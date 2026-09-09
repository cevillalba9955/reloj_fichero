# Research: Informe de Asistencia Mensual desde el Calendario

**Feature**: 021-informe-asistencia-mensual | **Date**: 2026-09-09

No quedaron marcadores `NEEDS CLARIFICATION` en el spec. Esta investigación
consolida cómo la feature se apoya en lo ya construido (features 011, 013, 018)
y fija las decisiones de diseño.

## §1 — El "informe mensual" es un informe de cierre con `tramo = 'Mes'`

**Decisión**: no crear un tipo de informe nuevo. Reutilizar el informe de
cierre de la feature 018 con `tramo = 'Mes'`.

**Evidencia** (código actual):

- `src/presentismo/domain/informe-cierre.js` → `rangoDeTramo(periodoMes, 'Mes')`
  devuelve `{ desde: 'YYYY-MM-01', hasta: 'YYYY-MM-<último>' }` (mes completo).
- `construirInformeCierre({ …, tramo: 'Mes' })` ya fija
  `periodoId = periodoMes` (sin sufijo) y arma `resumen` + `detalle` +
  `pendientes` + `sello`.
- `calcular-presentismo-service.js` → `emitirInformeCierre({ tramo: 'Mes' })`
  llama `calcularResumenPeriodo(periodoMes, legajos, hasta, { tramo: null })`,
  que **concatena todas las jornadas del mes** de cada empleado (Q1 + Q2),
  cualquiera sea su modalidad.
- `obtenerInformeCierre(periodoMes, 'Mes')` lee `mapa['Mes']` del archivo
  `data/P<periodo>/informe-cierre.json`.
- En modo `MENSUAL` esto ya se usa hoy: el cierre emite `['Mes']` y la página
  "Resumen del Período" lo muestra.

**Rationale**: garantiza por construcción SC-002 (cuadre con "Resumen del
Período") y SC-003 (subtotal detalle == fila resumen), sin duplicar reglas de
cálculo. La unificación de quincenas (SC-002 del spec: `Mes == Q1 + Q2`) es
consecuencia directa de concatenar las jornadas del mes.

**Confirmado en implementación (T013)**: sin ningún cambio en
`src/presentismo/domain/informe-cierre.js` ni en el servicio, el contract test
`021 QUINCENAL: Mes = Q1 + Q2 por empleado y contador` pasa: para cada empleado,
`horasTrabajadas`, `completas`, `incompletas`, `ausencias`, `llegadasTarde` y
`retirosAnticipados` del tramo `Mes` coinciden con la suma de Q1 + Q2, y el
informe mensual cuadra internamente (Σ filas == encabezado.totalHoras; subtotal
de cada sección == su fila de resumen). El dominio y el servicio quedaron
intactos; el cambio fue sólo en los handlers y la UI.

**Alternativas descartadas**:
- *Sumar numéricamente los dos informes Q1 y Q2 guardados*: frágil (hay que
  re-sumar contadores, promediar ratios de presentismo, reconciliar
  `pendientes`); rompe el cuadre del detalle. Rechazada.
- *Nuevo dominio "informe mensual"*: duplica el 90% de `informe-cierre.js` sin
  aportar nada. Rechazada.

## §2 — Qué falta habilitar: el tramo `Mes` en modo QUINCENAL

**Decisión**: permitir `tramo = 'Mes'` en los handlers
`POST`/`GET /api/calendarios/:periodo/informe-cierre` **en ambos modos**
(`MENSUAL` y `QUINCENAL`).

**Evidencia**: hoy `informe-cierre-handlers.js`:
- `tramosParaEmitir(modo, tramoQuery)`: en `QUINCENAL` acepta sólo `Q1`/`Q2`
  (o ambos si se omite); en `MENSUAL` prohíbe cualquier `tramo` explícito.
- `tramoParaLeer(modo, tramoQuery)`: mismo criterio para el `GET`.

**Cambio**: tratar `tramo=Mes` como válido siempre y mapearlo al tramo de
almacenamiento `'Mes'`. En `MENSUAL`, `tramo=Mes` es equivalente a omitirlo
(el frontend no conoce el modo de la instalación, así que enviar `tramo=Mes`
explícito debe funcionar en los dos modos). En `QUINCENAL`, `tramo=Mes`
convive con `Q1`/`Q2` en el mismo archivo (claves distintas del mapa; sin
colisión).

**Rationale**: cambio mínimo y localizado; no toca dominio ni servicio ni
storage. El `:periodo` de la ruta sigue siendo `YYYYMM` (ya lo exige
`parsePeriodoId`).

**Alternativas descartadas**:
- *Endpoint nuevo `/informe-mensual`*: otro handler, otro contrato, otro
  cliente, para algo que es "el mismo informe, otro tramo". Rechazada.

## §3 — Emisión automática al cerrar en modo QUINCENAL

**Decisión**: al cerrar el período en modo `QUINCENAL`, emitir y guardar
**tres** tramos: `Q1`, `Q2` y `Mes`. En `MENSUAL` sigue siendo sólo `Mes`.

**Evidencia**: `calendario-handlers.js` → `emitirInformesDelCierre(ctx, …)`
hoy hace `const tramos = modo === 'QUINCENAL' ? ['Q1', 'Q2'] : ['Mes'];`.

**Cambio**: `['Q1', 'Q2', 'Mes']` cuando `QUINCENAL`. Sigue siendo
best-effort: un fallo se loguea (`informe_cierre_emision_fallida`) y no
revierte el cierre (research 018 §5). El orden Q1→Q2→Mes es indistinto (cada
`emitirInformeCierre` recalcula desde las jornadas).

**Rationale**: cumple FR-009 del spec (el informe mensual "ya está disponible"
tras cerrar, sin paso extra) y US3 escenario 2.

**Reapertura**: `reabrirPeriodoMes` en el servicio ya itera **todas** las
entradas del mapa `informe-cierre.json` marcando `obsoleto: true`; la clave
`'Mes'` queda cubierta automáticamente (FR-010, US3 escenario 3). Sin cambios.

## §4 — Presentación y descarga: reutilizar los componentes de la feature 018

**Decisión**: en la página Calendario, montar la acción del informe mensual
reutilizando `AccionInformeCierre` (ver / descargar PDF) con
`InformeCierrePrintable` + `InformeCierreContenido` + `descargarInformePdf`
tal cual.

**Evidencia**:
- `AccionInformeCierre.jsx` ya resuelve: traer la copia guardada
  (`cliente.obtener`), botón "Ver informe" (modal `InformeCierrePrintable`),
  botón "Descargar PDF" (`descargarInformePdf` sobre una copia oculta del
  contenido), aviso `obsoleto`, y el caso "período abierto" (nota, sin
  acciones).
- `InformeCierreContenido` / `InformeCierrePrintable` son presentación pura:
  reciben la `vista` ya resuelta y usan `etiquetaPeriodo(periodoId)` — que para
  `'YYYYMM'` (tramo Mes) rinde "Julio 2026" sin sufijo de quincena. Correcto
  para el informe mensual.

**Cambio**:
- `AccionInformeCierre.jsx`: hoy deriva el tramo del `periodo` que recibe
  (sufijo `-Q1`/`-Q2` o nada). Para el uso desde el Calendario se necesita
  forzar el tramo `Mes`. Se agrega una prop (p. ej. `tramo="Mes"` /
  `mensual`) que, cuando está presente, hace que el componente use
  `cliente.obtenerMensual(periodoMes)` / `cliente.emitirMensual(periodoMes)`.
  El uso actual desde "Resumen del Período" no cambia (prop ausente →
  comportamiento por tramo del período seleccionado).
- `informe-cierre-client.js`: agregar `obtenerMensual(periodoMes)` y
  `emitirMensual(periodoMes)` que pegan a
  `/calendarios/<YYYYMM>/informe-cierre?tramo=Mes`. Se mantiene `obtener` /
  `emitir` existentes.
- `PaginaCalendario.jsx`: cuando `estado.tipo === 'con-datos'` y
  `estado.vista.cerrado`, renderizar `<AccionInformeCierre periodo={periodoMostrado} cerrado mensual />`
  dentro de la sección del calendario (junto al indicador "Período cerrado").
  `periodoMostrado` ya es `YYYYMM`.

**Rationale**: cero trabajo de maquetación/impresión nuevo; el documento del
informe mensual es idéntico en formato al de la feature 018 (FR-002, FR-012).

**Alternativas descartadas**:
- *Link a la página "Resumen del Período"*: el spec pide ver y descargar
  **desde la página Calendario** ("dentro de la página", US1 escenario 1).
  Rechazada.
- *Componente de acción nuevo para el Calendario*: duplicaría la lógica de
  `AccionInformeCierre` (traer guardado, obsoleto, modal, PDF). Rechazada.

## §5 — Control de acceso

**Decisión**: mantener el criterio de la feature 018/016. Ver y descargar un
informe ya disponible: abierto (el `GET` no exige rol). Disparar / re-emitir:
rol `editor`+ (el `POST` usa `exigirRol(ctx, 'editor', …)`).

**Nota UI**: en `PaginaCalendario`, "Cerrar período" ya está detrás de
`puede('editor')`; la emisión automática ocurre en ese flujo. Un lector que
entra a un mes ya cerrado ve la acción "Ver informe" / "Descargar PDF" (copia
guardada), consistente con `AccionInformeCierre` actual. FR-011 / SC-009.

## §6 — Alcance y borde

- **Sin calendario generado / período no cerrado**: `PaginaCalendario` sólo
  monta la acción cuando `estado.vista.cerrado` es `true`; el resto de estados
  (`vacio-global`, `vacio-mes`, `con-datos` no cerrado) no la muestran (FR-014,
  US3 escenarios 1 y 4).
- **Empleados con vínculo parcial (feature 017)**: ya los maneja
  `calcularResumenPeriodo` (jornadas sólo de los días con vínculo vigente); el
  total mensual sigue siendo la suma de sus quincenas.
- **Empleado sin categoría**: `filaResumenDe` lo marca `anomalia`; aparece en
  `pendientes.anomalias`. Sin cambios.
- **Modo MENSUAL**: la acción del Calendario entrega el mismo `Mes` que hoy se
  ve en "Resumen del Período" (FR-005). `tramo=Mes` explícito debe ser aceptado
  por el handler en modo MENSUAL (hoy lo rechaza).
- **`data/P<periodo>/informe-cierre.json` sin la clave `Mes`** (período cerrado
  antes de esta feature, en modo QUINCENAL): `GET ?tramo=Mes` responde
  `404 INFORME_NO_EMITIDO`; la UI muestra "todavía no está disponible; se
  genera al cerrar el período" y el rol `editor` puede re-emitir. Aceptable:
  al volver a cerrar (o re-emitir) se crea la clave.

## Decisiones registradas (defaults del spec, no clarificaciones)

| Tema | Decisión | Motivo |
|------|----------|--------|
| ¿Uno o dos documentos? | Ambos (resumen + detalle), como la feature 018 | El usuario pidió "igual que los generados en Resumen periodo" (plural) |
| ¿Modo MENSUAL también? | Sí: la acción aparece en el Calendario y entrega el `Mes` existente | Mismo botón, sin ramificar la UI por modo |
| ¿Generación al cierre o a demanda? | Al cerrar (automática) + re-emisión a demanda | Mismo ciclo de vida que la feature 018 |
