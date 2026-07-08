# Data Model: Padrón Real de Empleados Activos desde Oracle/RRHH

**Feature**: `003-padron-oracle-rrhh` | **Fase**: 1 | **Fecha**: 2026-07-08

Complementa (no reemplaza) el data model de la feature 002: `Empleado`,
`Fichada`, `Período` y `Checkpoint` no cambian. Esta feature agrega las
estructuras del lado del padrón.

## §1 — OracleRosterConfig

Configuración validada al arranque (research.md §3, FR-004/FR-005).

| Campo | Tipo | Origen (env) | Validación |
|---|---|---|---|
| `user` | string | `RRHH_ORACLE_USER` | requerido, no vacío |
| `password` | string | `RRHH_ORACLE_PASSWORD` | requerido, no vacío; **nunca aparece en logs/errores/`getState()`** |
| `connectString` | string | `RRHH_ORACLE_CONNECT_STRING` | requerido, no vacío |
| `vistaPadron` | string | `RRHH_ORACLE_VISTA_PADRON` | requerido; identificador SQL estricto (research.md §2) |
| `columnaLegajo` | string | `RRHH_ORACLE_COLUMNA_LEGAJO` | opcional, default `LEGAJO`; identificador SQL estricto |
| `timeoutMs` | integer | `RRHH_ORACLE_TIMEOUT_MS` | opcional, default `10000`; entero > 0 |

Error de validación: `ConfiguracionPadronInvalidaError` con la lista de
variables faltantes/ inválidas por nombre (sin valores).

## §2 — PadronSnapshot

Resultado normalizado de una obtención exitosa del padrón. Vive solo en
memoria de proceso (sin persistencia; un reinicio lo descarta — spec,
Assumptions).

| Campo | Tipo | Descripción |
|---|---|---|
| `empleados` | `Empleado[]` | forma exacta del contrato 002: `{ legajo: integer, activo: true }`, ya deduplicada y sin valores inválidos (FR-012) |
| `obtenidoEn` | Date | instante de la obtención exitosa contra la fuente |
| `fechaServicio` | string `YYYY-MM-DD` | día de servicio al que pertenece la obtención (derivado de `now()` inyectable) |

Reglas de normalización (FR-012, research.md §5):
- legajo válido = entero ≥ 1 (mismo dominio que el legajo RS956)
- duplicados: se conserva una sola aparición; cada duplicado descartado se
  loguea (`legajo_descartado`, motivo `duplicado`)
- no interpretable (null, texto, negativo, no entero): se descarta y se
  loguea (`legajo_descartado`, motivo `invalido`), sin incluir el valor
  crudo si no es representable de forma segura
- un padrón con 0 empleados tras normalizar = padrón vacío (ver §3)

## §3 — Estado diario del decorator (DailyCachedActiveEmployeesProvider)

Máquina de estados por día de servicio (research.md §4):

```text
pendiente_del_dia ──(obtención exitosa y no vacía)──> obtenido_del_dia
      │
      ├─(fuente falla o padrón vacío) + hay snapshot previo ──> degradado (sirve el último PadronSnapshot, de hoy o días previos)
      │        └── cada llamada posterior REINTENTA la fuente (sigue pendiente_del_dia hasta lograr éxito)
      │
      └─(fuente falla o padrón vacío) + sin snapshot previo ──> RosterNoDisponibleError (FR-007)

(cambio de día de servicio según now()) ──> vuelve a pendiente_del_dia (el snapshot anterior queda como respaldo)
```

Invariantes:
- `obtenido_del_dia` es absorbente dentro del día: no se vuelve a
  consultar la fuente hasta el próximo día de servicio (FR-014).
- "degradado" no es un estado persistente sino el resultado de una
  llamada: se materializa en el log (`padron_respaldo`, con `obtenidoEn`
  del snapshot servido) y en que el consumidor recibe el respaldo.
- Un padrón vacío nunca se convierte en snapshot (FR-011) ni consume el
  éxito del día.
- El decorator nunca devuelve una lista vacía como sustituto de un error
  (regla heredada del contrato 002).

## §4 — RosterFetchEvent (log NDJSON)

Un registro por intento de obtención o descarte (research.md §7, FR-010).

| Campo | Tipo | Notas |
|---|---|---|
| `ts` | string ISO-8601 | instante del evento |
| `serviceId` | string | mismo identificador que el resto de los logs del servicio |
| `evento` | enum | `padron_fresco` \| `padron_respaldo` \| `padron_vacio` \| `padron_error` \| `legajo_descartado` |
| `cantidadLegajos` | integer \| null | tamaño del padrón servido (fresco o respaldo); null en error/descartes |
| `duracionMs` | integer \| null | duración de la consulta a la fuente; null si no se consultó |
| `obtenidoEn` | string ISO-8601 \| null | del snapshot servido (relevante en `padron_respaldo` para auditar antigüedad — SC-003) |
| `detail` | string \| null | motivo de error/descarte; PROHIBIDO: password, connect string completo, datos personales |

## §5 — Relación con el modelo de la feature 002

- `Empleado[]` que sale del decorator alimenta `computeCompletitud` del
  servicio 002 sin ningún cambio en `consulta-programada-service.js`,
  `scheduler.js`, `checkpoint.js` ni `fichadas-memory-store.js`.
- `RosterNoDisponibleError` (definido en 002,
  `src/roster/active-employees-provider.js`) se reutiliza tal cual como
  tipo de error de la cadena Oracle (repositorio y decorator lo lanzan o
  lo envuelven); el scheduler ya lo registra como ciclo `error` (FR-013
  de 002 / FR-007 de esta spec).
