# Research: Informe de la Primera Quincena antes del Cierre del Mes

**Feature**: 022-informe-primera-quincena-anticipado | **Date**: 2026-09-09

No quedaron marcadores `NEEDS CLARIFICATION` en el spec (las dos preguntas se
resolvieron en `/speckit-specify`: la acción vive en "Resumen del Período";
la emisión anticipada es siempre manual). Esta investigación consolida cómo la
feature se apoya en lo ya construido (features 011, 013, 018, 021) y fija las
decisiones de diseño.

## §1 — El informe anticipado de Q1 ES un informe de cierre con `tramo = 'Q1'`

**Decisión**: no crear un tipo de informe ni un endpoint nuevos. Reutilizar el
informe de cierre de la feature 018 con `tramo = 'Q1'`, emitido sobre un
período todavía abierto.

**Evidencia** (código actual):

- `src/presentismo/domain/informe-cierre.js` → `rangoDeTramo(periodoMes, 'Q1')`
  devuelve `{ desde: 'YYYY-MM-01', hasta: 'YYYY-MM-15' }`.
- `construirInformeCierre({ …, tramo: 'Q1' })` fija
  `periodoId = '<YYYYMM>-Q1'` y arma `resumen` + `detalle` + `pendientes` +
  `sello` sin recalcular presentismo (todo sale de `filas`).
- `calcular-presentismo-service.js` → `emitirInformeCierre({ tramo: 'Q1' })`
  llama `calcularResumenPeriodo(periodoMes, legajos, '<YYYYMM>-15', { tramo: 'Q1' })`,
  que filtra las jornadas a `dd <= 15` (`fechaEnTramo`) para todos los
  empleados, cualquiera sea su modalidad.
- `obtenerInformeCierre(periodoMes, 'Q1')` lee `mapa['Q1']` de
  `data/P<periodo>/informe-cierre.json`.
- **Ni el dominio ni el servicio chequean `calendario.cerrado`**: ese gate vive
  sólo en el handler (`exigirCalendarioCerrado`, `informe-cierre-handlers.js`).

**Rationale**: garantiza por construcción SC-002 (cuadre con "Resumen del
Período" para Q1) y SC-003 (subtotal detalle == fila resumen), sin duplicar
reglas de cálculo. El corte `hasta = '<YYYYMM>-15'` hace que el informe cubra
TODA la quincena aunque se emita el día 16 o mucho después.

**Alternativas descartadas**:
- *Nuevo dominio / endpoint "informe quincena anticipada"*: duplicaría el 90%
  de `informe-cierre.js` y su contrato para algo que es "el mismo informe, otra
  precondición". Rechazada.
- *Congelar (cerrar) la primera quincena como estado propio*: introduce un
  segundo eje de cierre (Q1 solo-lectura mientras Q2 sigue abierta), toca
  `periodo-storage`, `cerrarCalendario`, todas las validaciones de escritura y
  la UI de calendario. El spec (FR-011) pide explícitamente **no** bloquear
  correcciones sobre los días 1–15. Rechazada.

## §2 — Qué falta habilitar: excepción acotada al gate de "período cerrado"

**Decisión**: en `POST /api/calendarios/:periodo/informe-cierre`, aceptar
`?tramo=Q1` sobre un período **abierto** si y sólo si se cumplen TODAS estas
condiciones (la "ventana de emisión anticipada"):

1. `ctx.modoResumenPeriodo === 'QUINCENAL'`
2. el calendario del período existe (si no → `404 CALENDARIO_NO_GENERADO`)
3. `calendario.cerrado !== true`
4. la primera quincena ya terminó: `hoyLocal()` es posterior al día 15 del mes
   del período (mes anterior al de hoy, o mismo mes con día > 15)

Si (1) se cumple, `?tramo=Q1`, el período está abierto pero **(4) NO** se
cumple → `409 QUINCENA_EN_CURSO` (código nuevo, mensaje "la primera quincena
del período aún no terminó").

Para cualquier otro tramo (`Q2`, `Mes`) o cuando `?tramo` se omite, el gate
actual no cambia: período abierto → `409 PERIODO_ABIERTO`.

**Evidencia**: hoy `informe-cierre-handlers.js` llama
`await exigirCalendarioCerrado(ctx, periodoMes, { debeEstarCerrado: true })`
antes de resolver `tramosParaEmitir`. El cambio es reordenar: cargar el
calendario, decidir si la petición es "anticipada Q1" y, según eso, exigir
`cerrado` **o** exigir "Q1 terminada".

**Cambio concreto** (POST handler):

```
const modo = ctx.modoResumenPeriodo ?? 'MENSUAL';
const { periodoMes } = parsePeriodoId(params.periodo, modo);
const calendario = await cargarCalendarioObligatorio(ctx, periodoMes); // 404 si no hay
const esAnticipadoQ1 = modo === 'QUINCENAL' && query.tramo === 'Q1' && calendario.cerrado !== true;

if (esAnticipadoQ1) {
  if (!primeraQuincenaTerminada(periodoMes, hoyLocal())) {
    throw new ApiError(409, 'QUINCENA_EN_CURSO', `La primera quincena de ${periodoMes} aún no terminó`);
  }
} else if (calendario.cerrado !== true) {
  throw new ApiError(409, 'PERIODO_ABIERTO', `El período ${periodoMes} debe cerrarse antes de emitir el informe`);
}

const tramos = tramosParaEmitir(modo, query.tramo);           // ['Q1'] en el caso anticipado
// … emitirInformeCierre({ …, emision: 'manual', anticipado: esAnticipadoQ1 })
```

`tramosParaEmitir('QUINCENAL', 'Q1')` ya devuelve `['Q1']`: sin cambios ahí.

**Rationale**: cambio mínimo y localizado; no toca dominio, servicio de cálculo
ni storage. El `:periodo` de la ruta sigue siendo `YYYYMM`.

**Alternativas descartadas**:
- *Query param explícito `?anticipado=1`*: redundante — `tramo=Q1` + período
  abierto + modo QUINCENAL ya identifican unívocamente el caso; un flag extra
  que el frontend tendría que setear sólo agrega superficie de error. Rechazada.
- *Relajar el gate para `Q1` sin chequear que la quincena terminó*: permitiría
  emitir un "informe de la primera quincena" a mitad de Q1, sobre días que aún
  no ocurrieron (contradice US2 / FR-002). Rechazada.

## §3 — La marca `anticipado` y su ciclo de vida

**Decisión**: la entrada guardada del tramo Q1 y su `sello` llevan
`anticipado: boolean`.

- `construirInformeCierre({ …, anticipado })` → `sello.anticipado` (default
  `false` si no se pasa, para no romper las llamadas existentes de 018/021).
- `emitirInformeCierre({ …, anticipado = false })` → persiste
  `entrada = { ...informe, obsoleto: false, invalidadoPor: null }` con
  `sello.anticipado` ya dentro de `informe.sello`; agrega `anticipado` al
  `logger.evento('informe_cierre_emitido', …)`.
- `construirVistaInformeCierre` ya pasa `sello` tal cual (view-model.js:260):
  `vista.sello.anticipado` llega al frontend sin más cambios.

**Ciclo de vida** (FR-012):

- Emisión anticipada manual (POST ?tramo=Q1, período abierto) →
  `sello.anticipado = true`, `sello.modo = 'manual'`.
- Re-emisión anticipada manual (misma ruta, mientras el mes siga abierto) →
  reemplaza la copia; sigue `anticipado = true`.
- **Cierre del período**: `emitirInformesDelCierre` (calendario-handlers.js) ya
  emite `['Q1', 'Q2', 'Mes']` en QUINCENAL con `emision: 'automatico'`. Al no
  pasar `anticipado`, `emitirInformeCierre` usa el default `false`: la entrada
  `Q1` se **reescribe** con `sello.anticipado = false`. A partir de ahí el
  informe de Q1 es el de cierre y se obtiene por el flujo normal.
- **Reapertura posterior**: `reabrirPeriodoMes` ya itera todas las claves del
  mapa marcando `obsoleto: true` — la clave `Q1` queda cubierta sin cambios.
  (Tras reabrir, el flujo anticipado vuelve a estar disponible si Q1 ya
  terminó; una nueva emisión anticipada limpia `obsoleto` como hoy.)

**Rationale**: una sola bandera, sin máquina de estados nueva; el reemplazo al
cerrar "cae solo" del default. `obsoleto` se mantiene como concepto exclusivo
de "reabrí un período cerrado", sin solaparlo con "anticipado".

## §4 — Desactualización mientras el mes sigue abierto (FR-011)

**Decisión**: NO marcar `obsoleto` la copia anticipada tras cada corrección
sobre un día 1–15. En su lugar:

- El informe anticipado se muestra **siempre** con un aviso persistente
  ("Emisión anticipada — el mes sigue abierto; las cifras de la primera
  quincena pueden cambiar hasta el cierre"), tanto en la acción de "Resumen del
  Período" (`<Alert type="info">`) como dentro del documento
  (`InformeCierreContenido`, renglón visible).
- La acción de **re-emitir** está siempre disponible mientras dure la ventana
  anticipada (FR-010): el responsable regenera a demanda si Q1 cambió.
- La emisión de cierre reescribe Q1 con las cifras finales (§3).

**Evidencia / rationale**: el spec dice "MUST tratar la copia guardada como
**potencialmente** desactualizada" — no exige detección activa de staleness.
Marcar `obsoleto` desde cada mutación (`cargarCorreccion`, `revertirCorreccion`,
`cargarPausa`, `cargarRetiroAnticipado`, `revertirPausa`, `cargarJustificacion`,
`revertirJustificacion`, `reclasificarDiaMes`) obligaría a tocar 8 funciones y
a filtrar por `fecha ∈ Q1` en cada una — desproporcionado para un informe que
por definición es provisional y se re-emite con un clic. FR-011 ("MUST NOT
impedir ni bloquear correcciones") se cumple trivialmente: emitir el informe no
cambia el estado abierto/cerrado, así que `exigirPeriodoAbiertoDe` sigue
pasando.

**Alternativa descartada**: timestamp de última mutación en el calendario +
comparación contra `sello.emitidoEn` en el `GET`. Requiere que
`guardarCalendario` y las escrituras de correcciones/justificaciones (archivos
separados) mantengan un `actualizadoEn` coherente; hoy no existe. Rechazada por
costo/beneficio.

## §5 — Habilitación en la UI: `emisionAnticipadaQ1Disponible`

**Decisión**: `GET /api/resumen-periodo` agrega a `VistaResumenPeriodo` un
booleano `emisionAnticipadaQ1Disponible`, calculado en el handler:

```
emisionAnticipadaQ1Disponible =
  modo === 'QUINCENAL' &&
  tramo === Tramo.Q1 &&
  !cerrado &&
  primeraQuincenaTerminada(periodoMes, hoyLocal())
```

`resumen-periodo-handlers.js` → `periodoEfectivo` ya resuelve `modo`, `tramo`,
`periodoMes`, `cerrado` y el calendario; sólo falta este cálculo y propagarlo
por `construirVistaResumenPeriodo`.

**Frontend**:
- `PaginaResumenPeriodo.jsx` pasa
  `anticipadoQ1Disponible={estado.vista.emisionAnticipadaQ1Disponible}` a
  `<AccionInformeCierre>`.
- `AccionInformeCierre.jsx`: hoy, si `!cerrado`, muestra sólo una nota. Nuevo
  comportamiento: si `!cerrado && anticipadoQ1Disponible`:
  - sin copia guardada → botón **"Emitir informe de la primera quincena"**
    (llama `cliente.emitir(periodo)`; `periodo` es `'<YYYYMM>-Q1'`, que el
    cliente ya traduce a `POST …?tramo=Q1`).
  - con copia guardada (`cliente.obtener(periodo)` al montar) → "Ver informe" /
    "Descargar PDF" / **"Re-emitir"** + `<Alert type="info">` "emisión
    anticipada".
  - si `!cerrado && !anticipadoQ1Disponible` → nota actual, sin cambios.
- `informe-cierre-client.js`: **sin cambios**. `partesPeriodo('202609-Q1')` ya
  produce `?tramo=Q1` para `emitir` y `obtener`.

**Rationale**: el frontend no conoce el modo de la instalación ni la fecha del
servidor; el backend es el único que puede decidir la ventana. Un solo
booleano en la vista evita duplicar esa lógica en el cliente.

## §6 — Control de acceso

**Decisión**: idéntico criterio que features 018/016. Ver y descargar un
informe anticipado ya emitido: abierto (el `GET` de informe-cierre no exige
rol). Emitir / re-emitir el anticipado: rol `editor`+ (el `POST` ya está
detrás de `exigirRol(ctx, 'editor', …)`; no se toca).

**Nota UI**: un lector que abra "Resumen del Período" en una Q1 dentro de la
ventana verá el botón deshabilitado o ausente (mismo patrón que el resto de
acciones `editor`+); si ya hay copia anticipada, la ve y la descarga. FR-013 /
SC-009.

## §7 — Alcance y borde

- **Modo MENSUAL**: `emisionAnticipadaQ1Disponible` siempre `false`; el POST con
  `?tramo=Q1` en MENSUAL sigue devolviendo `400 PERIODO_INVALIDO`
  (`tramosParaEmitir` no cambia). FR-003.
- **Q1 en curso (día 1–15)**: `primeraQuincenaTerminada` → `false`; la vista no
  habilita la acción y el POST responde `409 QUINCENA_EN_CURSO`. US2.
- **Período ya cerrado**: `esAnticipadoQ1` es `false` (`calendario.cerrado ===
  true`); el flujo es el de cierre (feature 018/021). El `GET ?tramo=Q1`
  devuelve la copia de cierre (`anticipado: false`). US2 escenario 3.
- **Sin calendario generado**: `404 CALENDARIO_NO_GENERADO` en el POST; la
  vista de "Resumen del Período" ya maneja ese caso (no hay período efectivo).
  US2 escenario 4.
- **Empleados con vínculo parcial dentro de Q1 (feature 017)**: ya lo maneja
  `calcularResumenPeriodo` (jornadas sólo de los días con vínculo vigente,
  acotadas a `dd <= 15`). Sin cambios.
- **Empleado sin categoría**: `filaResumenDe` lo marca `anomalia`; aparece en
  `pendientes.anomalias` del informe anticipado. Sin cambios.
- **Q2 anticipada**: fuera de alcance. `esAnticipadoQ1` sólo mira `tramo ===
  'Q1'`; `?tramo=Q2` sobre período abierto → `409 PERIODO_ABIERTO` como hoy.
- **`data/P<periodo>/informe-cierre.json` sin la clave `Q1`**: `GET ?tramo=Q1`
  responde `404 INFORME_NO_EMITIDO`; la UI muestra el botón "Emitir informe de
  la primera quincena" (si la ventana está abierta). Aceptable.

## Decisiones registradas (defaults del spec, no clarificaciones)

| Tema | Decisión | Motivo |
|------|----------|--------|
| ¿Uno o dos documentos? | Ambos (resumen + detalle), como la feature 018 | Continuidad con el informe de cierre por quincena |
| ¿Segunda quincena anticipada? | No | Q2 termina con el mes; su informe sale al cierre (spec, Assumptions) |
| ¿Emisión automática al terminar Q1? | No: sólo manual | Clarificación Q2 de `/speckit-specify` (FR-018) |
| ¿Dónde vive la acción? | Página "Resumen del Período" | Clarificación Q1 de `/speckit-specify` (FR-017) |
| ¿Congelar los días 1–15? | No | FR-011 pide explícitamente no bloquear correcciones sobre Q1 |
| ¿Código de error si Q1 no terminó? | `409 QUINCENA_EN_CURSO` (nuevo) | Distinguirlo de `409 PERIODO_ABIERTO` (tramo no elegible) |
