# Research: Informe al Cierre del Período

**Feature**: 018-informe-cierre-periodo | **Date**: 2026-09-08

Contexto: el spec no dejó marcadores `[NEEDS CLARIFICATION]` (las dos preguntas
abiertas se resolvieron en la sesión de clarificación del 2026-09-08). Esta
investigación fija las decisiones de diseño sobre el código existente.

---

## §1 — Reutilizar la proyección del resumen del período; el informe es una emisión, no un cálculo nuevo

**Decisión**: agregar una proyección de dominio pura `informe-cierre.js` que
consume las filas que ya devuelve
`calcularResumenPeriodo(periodoMes, legajos, hoy, { tramo })`
(`src/presentismo/service/calcular-presentismo-service.js:314`) y arma las dos
estructuras de informe. No se recalcula presentismo.

**Racional**: `calcularResumenPeriodo` ya entrega por empleado
`{ horasTrabajadas, completas, incompletas, ausencias, llegadasTarde,
retirosAnticipados, correcciones, feriado, licencia, vacaciones, detalle[] }` y
`anomalia` (empleado sin categoría). Es exactamente el insumo de los dos
informes: el de resumen es el conjunto de filas + encabezado + totales, el de
detalle es `detalle[]` agrupado por empleado con subtotal. Derivar ambos de la
misma fuente garantiza SC-008 (las cifras coinciden con la pantalla "Resumen del
Período") y SC-002 (el subtotal del detalle de un empleado == su total en el
resumen) por construcción.

**Alternativas descartadas**:
- Recorrer fichadas/correcciones/justificaciones desde cero en un camino nuevo →
  duplica la lógica de 004/011 y abre la puerta a que informe y pantalla
  divergan.
- Emitir sólo el resumen y dejar el detalle como "abrir la pantalla" → el spec
  pide dos documentos emitidos y archivables (US2).

---

## §2 — Corte de días (`hoy`) para un período cerrado

**Decisión**: al emitir, pasar `hoy` = **último día del tramo** del período
(`YYYY-MM-15` para Q1, último día del mes para Q2/Mes), no `hoyLocal()`.

**Racional**: `proyectarResumenPeriodo` filtra `jornada.fecha <= hoy` (FR-008 de
la feature 011) para no contar días futuros de un período *en curso*. Un período
que se está cerrando puede cerrarse el mismo día que termina o incluso antes; si
se usara `hoyLocal()` el informe podría recortar días que sí pertenecen a la
liquidación. Usar el último día del tramo hace que el informe cubra **todo** el
tramo, que es lo que se va a liquidar.

**Nota**: si un responsable cierra un período antes de que termine, los días aún
sin fichar contarán como ausencia y aparecerán además en la lista de pendientes
(jornadas incompletas / sin fichadas). Es un caso de borde aceptable del cierre
anticipado; el informe lo hace visible, no lo oculta.

---

## §3 — Persistencia de la copia emitida

**Decisión**: nuevo archivo `data/P<periodo>/informe-cierre.json`, detrás del
puerto `PresentismoRepository` con dos métodos nuevos:
`guardarInformeCierre(periodo, tramo, informe)` y
`cargarInformeCierre(periodo)`. El archivo es un objeto con una entrada por
tramo:

```jsonc
{
  "Mes":  { "sello": {...}, "resumen": {...}, "detalle": {...}, "pendientes": {...}, "obsoleto": false },
  "Q1":   { ... },
  "Q2":   { ... }
}
```

En modo `MENSUAL` sólo se usa la clave `Mes`; en `QUINCENAL`, `Q1` y `Q2`.
Re-emitir un tramo **reemplaza** su entrada (FR-003: una sola copia por tramo).
El nombre de archivo se agrega como `ARCHIVO_INFORME_CIERRE` en
`periodo-storage.js` (único punto de verdad de rutas por período, patrón 013).

**Racional**: Principio VI — la copia emitida es estado operativo (editable vía
re-emisión, de alto detalle), así que va a archivo JSON por período, no a Oracle.
Un archivo por carpeta de período mantiene la unidad de ciclo de vida de 013
(archivar / eliminar el período se lleva el informe con él).

**Alternativas descartadas**:
- Un archivo por informe y por tramo (`informe-resumen-Q1.json`, …) → más
  archivos y más código de I/O sin beneficio.
- Base de datos → Principio VI reserva Oracle para el dato de liquidación; esta
  feature no lo implementa.

---

## §4 — Invalidación al reabrir el período

**Decisión**: `reabrirPeriodoMes(periodo, autor)` marca `obsoleto: true` en
todas las entradas de `informe-cierre.json` de ese período (si el archivo
existe), referenciando la reapertura. No se borra el archivo.

Al volver a cerrar el período, o al re-emitir a demanda, la entrada del tramo se
regenera con `obsoleto: false`.

**Racional**: FR-013 — reabrir invalida la copia guardada. Conservar el archivo
marcado (en vez de borrarlo) deja ver "esto fue lo último que se emitió, quedó
desactualizado" y permite a la UI avisar sin perder el rastro. Borrarlo perdería
esa referencia.

---

## §5 — Disparo: automático al cerrar + acción explícita de re-emisión

**Decisión**:
- **Automático**: `cerrarPeriodoMes` — tras `repo.guardarCalendario(nuevo)` —
  emite y guarda los informes de todos los tramos que correspondan al modo de la
  instalación (`MENSUAL` → `Mes`; `QUINCENAL` → `Q1` y `Q2`), con
  `modo: 'automatico'` en el sello. Si la emisión fallara, el cierre ya quedó
  hecho: se registra el error en el log y la UI ofrece re-emitir (el cierre no se
  revierte por un fallo de informe).
- **Manual**: `POST /api/calendarios/:periodo/informe-cierre` (rol `editor`+)
  regenera y reemplaza la copia del tramo indicado; exige
  `calendario.cerrado === true` (si no, 409 `PERIODO_ABIERTO`).
- **Lectura**: `GET /api/calendarios/:periodo/informe-cierre` devuelve la copia
  guardada del tramo, con el flag `obsoleto`; 404 `INFORME_NO_EMITIDO` si nunca
  se emitió.

**Racional**: es la respuesta a la clarificación Q1 (opción C). El enganche en
`cerrarPeriodoMes` mantiene un solo lugar donde "cerrar" implica "emitir"; la
acción manual cubre la re-emisión tras un ajuste y reapertura.

---

## §6 — Universo de empleados = padrón del período

**Decisión**: la emisión lee `data/P<periodo>/padron.json` (snapshot del período,
feature 013) para el universo de legajos y sus nombres, mediante un helper nuevo
`leerSnapshotPadron({ filePath })` en `file-padron-category-provider.js` (ya
tiene el writer `guardarSnapshotPadron`).

**Racional**: FR-005 — el informe de un período pasado debe listar los empleados
de **ese** período, no los vigentes hoy.
`createLocalFileActiveEmployeesProvider` resuelve siempre
`P<mesActualPeriodo>/padron.json` (el mes en curso), así que no sirve para un
período arbitrario. `calcularResumenPeriodo` recibe la lista de legajos como
parámetro, de modo que basta con pasarle los legajos del snapshot del período.

**Nota**: si el período no tiene `padron.json` (no debería, 013 lo crea al
generar el calendario), la emisión produce un informe con la lista de empleados
vacía y lo indica (edge case del spec).

---

## §7 — Empleados con vínculo parcial en el período (feature 017)

**Decisión**: la feature **no** reimplementa el recorte por fecha de ingreso /
egreso. Consume `detalle[]` tal como lo entrega `calcularResumenPeriodo`. Si el
dominio (004 + 017) ya acota los días previos al ingreso, el informe lo hereda;
si hubiera un hueco ahí, es un tema del dominio, no de esta feature.

**Racional**: FR-015 se cumple si `calcularEmpleado` respeta `fechaIngreso`.
Duplicar ese recorte en la proyección del informe sería lógica divergente
(mismo principio que §1). Se documenta como dependencia de 017 en el spec.

---

## §8 — Lista de pendientes (FR-010)

**Decisión**: `informe-cierre.js` deriva, de las mismas filas:
- **jornadas incompletas**: por fila con `incompletas > 0`, listar
  `{ legajo, nombre, fechas: [detalle donde estado === INCOMPLETA] }`.
- **anomalías**: filas con `anomalia != null` (empleado sin categoría).
- **ajustes**: `{ legajo, nombre, fechas: [detalle donde corregida === true ||
  justificacion != null] }`.
- `hayPendientes` = alguna de las tres listas no vacía; si es `false`, el informe
  lo dice explícitamente.

**Racional**: son señales que ya están en `detalle[]`/`fila`; no hace falta
información nueva. La feature 011 ya trata "jornadas incompletas" como el
indicador de "revisar antes de liquidar".

---

## §9 — Entrega imprimible (FR-011), sin dependencias nuevas

**Decisión**: el backend devuelve el informe como JSON estructurado (la copia
guardada, formateada por `construirVistaInformeCierre` a `HH:MM`, totales y
secciones por empleado). El frontend tiene una vista `InformeCierrePrintable.jsx`
con CSS `@media print`; el responsable usa "Imprimir" del navegador (o "Guardar
como PDF"). Esa vista **es** el "documento apto para imprimir y archivar".

**Racional**: el repo no tiene motor de PDF y `package.json` sólo depende de
`oracledb`. Generar PDF en el servidor (layout, fuentes, paginación) es
desproporcionado para el valor pedido. El navegador ya produce un PDF fiel desde
una vista con estilos de impresión.

**Alternativas descartadas**:
- Librería PDF en el backend → dependencia pesada, contra el estilo del repo.
- Exportación tabular (CSV/Excel) → explícitamente fuera de alcance (Q2 → A).

---

## §10 — Sello de emisión (FR-009) y logging (FR-014)

**Decisión**: cada entrada de informe lleva
`sello: { periodoId, periodoMes, tramo, emitidoEn: <ISO>, autor, modo }`
(`modo` ∈ `'automatico' | 'manual'`). Cada emisión registra
`logger.evento('informe_cierre_emitido', { periodo, tramo, autor, modo,
empleados, totalHoras })` — mismo estilo que `periodo_cerrado` /
`periodo_reabierto`. Ni el archivo ni el log contienen biométricos ni `rawHex`.

**Racional**: FR-009 pide identificación de período/tramo + cuándo + quién,
visible en el documento. FR-014 y Principio V piden traza estructurada sin datos
sensibles.

---

## §11 — Refactor menor: helper de parseo de período compartido

**Decisión**: extraer `parsePeriodoId`, `expandirPeriodos`, `periodoPorDefecto`
y las regex `RE_MES` / `RE_QUINCENA` de `resumen-periodo-handlers.js` a
`src/web/api/periodo-id.js`, y hacer que ambos handlers lo importen. Sin cambio
de contrato de `/api/resumen-periodo`.

**Racional**: el handler nuevo necesita la misma traducción de
`YYYYMM[-Q1|-Q2]` ↔ `{ periodoMes, tramo }` según `ctx.modoResumenPeriodo`.
Duplicar las regex y el default sería una fuente de deriva.

---

## Resumen de artefactos a crear/editar

| Acción | Archivo |
|--------|---------|
| NUEVO | `src/presentismo/domain/informe-cierre.js` |
| NUEVO | `src/web/api/periodo-id.js` |
| NUEVO | `src/web/api/informe-cierre-handlers.js` |
| NUEVO | `frontend/src/api/informe-cierre-client.js` |
| NUEVO | `frontend/src/components/AccionInformeCierre.jsx` (+ test) |
| NUEVO | `frontend/src/components/InformeCierrePrintable.jsx` (+ test) |
| NUEVO | `tests/unit/presentismo-informe-cierre.test.js` |
| NUEVO | `tests/contract/web-api-informe-cierre.test.js` |
| NUEVO | `tests/integration/informe-cierre.integration.test.js` |
| EDITA | `src/presentismo/service/calcular-presentismo-service.js` (emitir/obtener + enganche cierre/reapertura + `modalidad` en fila) |
| EDITA | `src/presentismo/adapters/file-presentismo-repository.js` (+ in-memory) |
| EDITA | `src/presentismo/adapters/file-padron-category-provider.js` (`leerSnapshotPadron`) |
| EDITA | `src/presentismo/domain/periodo-storage.js` (`ARCHIVO_INFORME_CIERRE`) |
| EDITA | `src/presentismo/ports/index.js` (métodos del puerto) |
| EDITA | `src/web/api/resumen-periodo-handlers.js` (usa `periodo-id.js`) |
| EDITA | `src/web/view-model.js` (`construirVistaInformeCierre`) |
| EDITA | `src/web/wiring.js` (registrar rutas) |
| EDITA | `frontend/src/components/PaginaResumenPeriodo.jsx` (+ test) |
| EDITA | `docs/presentismo.md` (sección nueva) |
