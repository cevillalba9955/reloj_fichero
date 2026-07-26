# Research: Control de Vacaciones Anual

Fase 0 — decisiones de diseño que resuelven los puntos abiertos del Technical
Context antes de tocar código. Cada decisión referencia el código existente en
el que se apoya, para minimizar piezas nuevas y mantener el mismo estilo que
las features 003/004/007/008/011/012/013.

## 1. ¿Cómo se marca un día como `Vacaciones` en el calendario/resumen del legajo?

**Decisión**: reutilizar el mismo mecanismo de almacenamiento y de cómputo que
ya usa la Justificación de Ausencias (feature 012) — un registro por
(período, legajo, fecha) en la colección `justificaciones` del archivo por
período (`file-presentismo-repository.js`) — pero generado automáticamente por
esta feature con un motivo fijo y reservado, **sin pasar por el catálogo
editable** `config/motivos-ausencia.json` ni por la elegibilidad de día
`Laborable` que aplica la Justificación genérica.

Concretamente:

- Se usa directamente `crearJustificacion()` (`src/presentismo/domain/
  justificacion.js`) para construir cada registro diario, con un objeto
  `motivo` fijo `{ id: 'vacaciones-anual', etiqueta: 'Vacaciones', tipoPago:
  'No paga' }` en vez de resolver un `motivoId` contra
  `motivosAusenciaConfig`. El `id` `vacaciones-anual` es distinto del `id`
  `vacaciones` que ya existe en el catálogo de motivos (que queda deshabilitado
  para nuevas cargas por FR-018), evitando cualquier colisión o ambigüedad
  sobre el origen de un registro.
- **No** se usa `clasificarDiaParaJustificar`/`expandirRangoElegible`: esas
  funciones filtran a días `Laborable` únicamente (spec 012, FR-001/FR-002), y
  esta feature necesita marcar **todos** los días corridos del rango, sean
  hábiles, no hábiles o feriados (spec FR-002). El único filtro que aplica acá
  es el de solapamiento (`justificacionVigenteDe`, ya existente) por FR-007.
- Como el registro tiene exactamente la misma forma `{ periodo, legajo, fecha,
  motivoId, etiquetaMotivo, tipoPago, autor, fechaHora, vigente, reversion,
  origenCarga }` que una Justificación cargada por el flujo genérico, **no se
  requiere ningún cambio** en `resumen-presentismo.js` (crédito de jornada
  esperada) ni en `resumen-periodo.js` (conteo de columnas `Ausencias`/
  `Licencia`, ver `resumen-periodo.js` líneas ~78-107): `tipoPago: 'No paga'`
  ya hace que el día no acredite jornada y siga sumando a `Ausencias`, nunca a
  `Licencia` (esa columna solo cuenta `tipoPago === 'Paga'`), que es
  exactamente el comportamiento pedido ("para el dominio de asistencia es una
  justificación NO PAGA").
- FR-006 ("queda marcado en el calendario") se satisface por el mismo join que
  ya hace `calcular-presentismo-service.js`/`view-model.js` entre
  `calendario.dias` y `justificaciones` al construir la jornada de cada día;
  **no** se escribe nada nuevo dentro de `calendario.json`.

**Guardrail de origen** (evita doble camino / bookkeeping roto, FR-014):
`DELETE /api/justificaciones` (el revert genérico de 012) DEBE rechazar un
registro cuyo `motivoId === 'vacaciones-anual'`, indicando que se revierte
desde la Asignación de Vacaciones. Revertir una Asignación de Vacaciones
revierte, puertas adentro, cada Justificación diaria que generó (mismo
`repo.revertirJustificacion` por día) y además repone el saldo (§4).

**Alternativas consideradas**:
- *Mecanismo de calendario paralelo* (marcar `calendario.dias[].vacaciones`
  directamente): requeriría duplicar toda la lógica de crédito de jornada y
  de conteo del resumen de período ya escrita para Justificación. Se
  descarta: mucha más superficie de cambio para el mismo resultado observable.
- *Reusar el catálogo genérico reclasificando `vacaciones` a `No paga`*
  (opción C descartada en la clarificación del spec): obligaría a cargar
  vacaciones día por día o por rango-solo-Laborable desde el flujo de
  Justificación existente, perdiendo la semántica de "días corridos sin
  importar hábil/feriado" que pide el spec (FR-002). Se descarta.

## 2. ¿De dónde sale la fecha de ingreso / antigüedad?

**Decisión** (clarificación con el usuario, 2026-07-22): el dato ya existe en
Oracle RRHH; se extiende la sincronización del padrón (feature 003) para
traerlo.

- `oracle-active-employees-provider.js` normaliza hoy filas crudas a `{
  legajo, activo }` (contrato `ActiveEmployeesProvider`, data-model.md §2 de
  003). Se extiende ese contrato a `{ legajo, activo, fechaIngreso }`
  (`fechaIngreso` como `'YYYY-MM-DD'` o `null` si Oracle no la tiene cargada
  para ese legajo — no se bloquea la sincronización por un dato faltante,
  mismo criterio de tolerancia que el resto del provider).
- La consulta SQL que trae `fetchLegajosActivos()` (capa de repositorio
  Oracle, Principio II) se extiende para incluir la columna de fecha de
  ingreso del padrón de RRHH; sigue siendo de **solo lectura** (no se agrega
  ninguna escritura nueva a Oracle, Principio VI).
- El snapshot local (`padron.json`, tanto el de `data/presentismo/` como el
  de cada `P<periodo>/`) pasa a incluir `fechaIngreso` por legajo, igual que
  hoy incluye `categoria`/`nombre`.
- Un legajo sin `fechaIngreso` (dato no cargado en Oracle) se trata igual que
  describe el spec (Edge Cases, FR-012): sin antigüedad calculable, sin
  incremento automático, señalado en la página de control como pendiente.

## 3. ¿Dónde persiste el saldo y las asignaciones de vacaciones?

**Decisión**: archivo nuevo, **fuera** de la carpeta por período
(`P<periodo>/`), porque el saldo y las asignaciones son datos de **legajo**,
no de período — una asignación puede cruzar varios períodos (spec FR-005) y
el saldo es un acumulado histórico continuo. Se persiste en
`data/presentismo/vacaciones.json`, mismo patrón de archivo único que
`config/motivos-ausencia.json` (lectura completa, escritura atómica
temp+rename vía `writeFileSync`/`renameSync`, igual que
`motivos-ausencia-config.js` y `file-presentismo-repository.js`).

Forma (ver data-model.md para el detalle campo por campo):

```json
{
  "legajos": {
    "1234": {
      "saldo": 3,
      "ultimoIncrementoAplicado": "2025-11-01",
      "movimientos": [ /* ... */ ]
    }
  },
  "asignaciones": [ /* ... */ ]
}
```

Cada día de una asignación sigue generando, además, su Justificación-espejo
por período (§1) — el archivo `vacaciones.json` es la fuente autoritativa del
**saldo y la asignación en sí** (fecha inicio/cantidad/vigencia), mientras que
`P<periodo>/calendario.json` (vía `justificaciones`) sigue siendo la fuente
del **día a día** para el cálculo de horas y el resumen de período. Un nuevo
adaptador `file-vacaciones-repository.js` encapsula la lectura/escritura de
este archivo, detrás de un puerto nuevo (mismo patrón de puerto que
`PresentismoRepository` en `src/presentismo/ports/index.js`).

**Alternativa considerada**: un archivo por legajo (`data/vacaciones/
<legajo>.json`). Se descarta por ahora: la escala de legajos activos es la
misma que 004/011 (~500), un único archivo JSON de ese tamaño es trivial de
leer/escribir completo y evita manejar cientos de archivos pequeños; se puede
particionar más adelante si el tamaño lo justifica (YAGNI).

## 4. ¿Cómo se aplica el incremento automático anual sin un proceso en segundo plano?

**Decisión**: cómputo **perezoso** (lazy), no un cron/daemon nuevo. El
sistema no tiene hoy ningún proceso en segundo plano de negocio (el único
scheduler existente, `src/scheduling/scheduler.js`, es específico del
polling TCP al reloj biométrico — spec 002/005 — y no es un lugar apropiado
para lógica de liquidación). En su lugar:

- Cada vez que se lee o se escribe el saldo de un legajo (consultar la
  página de control, asignar vacaciones, revertir una asignación), el
  servicio evalúa: *¿la fecha de incremento configurada de este año (o de
  años anteriores) ya pasó y todavía no se le aplicó a este legajo?* —
  comparando contra `ultimoIncrementoAplicado`. Si corresponde, aplica el
  incremento (o los incrementos, si pasó más de un ciclo sin que nadie
  consultara el sistema — por ejemplo, tras un período de inactividad) ANTES
  de continuar con la operación pedida, y persiste el resultado.
- Esto garantiza el mismo resultado observable que un cron real (SC-003: el
  100% de los legajos activos con fecha de ingreso terminan con el
  incremento aplicado en la fecha configurada) sin depender de que el
  proceso Node quede corriendo exactamente en esa fecha/hora, consistente
  con la arquitectura basada en archivos y sin servidor persistente
  obligatorio de este sistema (Principio VI).
- Idempotencia: aplicar el incremento del ciclo `YYYY` a un legajo que ya
  tiene `ultimoIncrementoAplicado >= fecha de ese ciclo` es un no-op.

**Alternativa considerada**: agregar un `setInterval`/cron real en
`src/web/server.js` que dispare el incremento en la fecha configurada. Se
descarta: introduce un proceso que debe quedar corriendo 24/7 para que la
fecha "no se pase por alto", contradice el estilo sin-daemon del resto del
sistema, y no aporta nada que el cómputo perezoso no resuelva ya (nadie
necesita el saldo actualizado en el instante exacto de la medianoche del 1°
de noviembre; alcanza con que esté correcto la próxima vez que se consulta).

## 5. Escala de antigüedad → días y fecha de incremento: formato de configuración

**Decisión**: un archivo de configuración nuevo, `config/vacaciones.json` (+
`config/vacaciones.example.json`), validado fail-fast al arranque con el
mismo criterio que `motivos-ausencia-config.js`/`categorias-config.js`
(`src/presentismo/config/vacaciones-config.js`, funciones
`parseVacacionesConfig`/`loadVacacionesConfig`/`saveVacacionesConfig`,
escritura atómica). Valor inicial (FR-010, LCT Art. 150):

```json
{
  "incrementoAnual": { "mes": 11, "dia": 1 },
  "escalaAntiguedad": [
    { "aniosMinimos": 0, "dias": 14 },
    { "aniosMinimos": 5, "dias": 21 },
    { "aniosMinimos": 10, "dias": 28 },
    { "aniosMinimos": 20, "dias": 35 }
  ]
}
```

Validación: `escalaAntiguedad` ordenada estrictamente creciente por
`aniosMinimos`, empezando en `0` (cubre cualquier antigüedad desde el
ingreso), `dias` entero > 0; `incrementoAnual.mes` en `1..12`,
`incrementoAnual.dia` válido para ese mes. Un archivo inválido o incompleto
bloquea el incremento automático (edge case del spec: "escala de antigüedad
incompleta o inválida"), reportando la anomalía, igual que un catálogo de
motivos inválido bloquea la Justificación en 012.

## 6. Días corridos que cruzan de período

**Decisión**: expandir la asignación a la lista completa de fechas
calendario (`fechaInicio` + `cantidadDias - 1` días, sin filtrar por
`Laborable`/`No Laborable`/`Feriado` — a diferencia de `fechasEnRango` +
`expandirRangoElegible` de 012), agrupar esas fechas por período
(`periodoDeFecha`, ya existente en `calcular-presentismo-service.js`), y
exigir que **todos** los períodos tocados tengan calendario generado
(mismo `CALENDARIO_NO_GENERADO` 404 que ya usan los handlers de
Justificación) y estén abiertos (mismo `PERIODO_CERRADO` 409 de la feature
013, `exigirPeriodoAbierto`) antes de registrar nada — todo o nada, igual
criterio que ya aplica 013 a la carga de Justificaciones multi-período.
