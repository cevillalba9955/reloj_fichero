# Data Model: Control de Vacaciones Anual

Fase 1 — entidades del spec y su forma persistida, derivadas de research.md.

## 1. Fecha de Ingreso (extensión del padrón, feature 003)

Extiende el contrato `ActiveEmployeesProvider` y el snapshot local del
padrón.

| Campo         | Tipo               | Notas                                                  |
|---------------|---------------------|---------------------------------------------------------|
| `legajo`      | integer ≥ 1         | ya existente                                             |
| `activo`      | boolean              | ya existente                                             |
| `fechaIngreso`| `'YYYY-MM-DD'` \| `null` | **NUEVO**. `null` si Oracle no la tiene cargada para ese legajo (edge case: legajo pendiente de completar el dato) |

No es una entidad con su propio archivo: viaja dentro del padrón existente
(`data/presentismo/padron.json`, `P<periodo>/padron.json`).

## 2. Escala de Antigüedad → Días (`config/vacaciones.json`, campo `escalaAntiguedad`)

Lista ordenada de tramos, cada uno con el mínimo de años (inclusive) de
antigüedad requerido y los días que corresponden:

| Campo          | Tipo    | Validación                                              |
|----------------|---------|-----------------------------------------------------------|
| `aniosMinimos` | integer ≥ 0 | estrictamente creciente entre tramos; el primer tramo DEBE ser `0` |
| `dias`         | integer > 0 | días corridos que acredita el incremento en ese tramo   |

`diasPorAntiguedad(escala, aniosAntiguedad)` (dominio puro) devuelve el
`dias` del último tramo cuyo `aniosMinimos <= aniosAntiguedad`.

## 3. Configuración de Incremento Anual (`config/vacaciones.json`, campo `incrementoAnual`)

| Campo  | Tipo         | Validación        |
|--------|--------------|--------------------|
| `mes`  | integer 1–12 |                    |
| `dia`  | integer      | válido para ese mes (1–28/29/30/31 según corresponda) |

## 4. Saldo de Vacaciones (`data/presentismo/vacaciones.json`, `legajos[legajo]`)

| Campo                    | Tipo                | Notas                                                                 |
|---------------------------|----------------------|------------------------------------------------------------------------|
| `saldo`                  | integer (puede ser negativo) | valor actual, resultado de sumar todos los `movimientos`             |
| `ultimoIncrementoAplicado` | `'YYYY-MM-DD'` \| `null` | fecha del ciclo de incremento anual ya aplicado más reciente; controla la idempotencia del cómputo perezoso (research.md §4) |
| `movimientos`             | `MovimientoSaldo[]` | historial completo, orden cronológico de carga                        |

Legajo sin entrada todavía en `legajos`: saldo implícito `0`, sin
movimientos (spec, Edge Cases: "legajo nuevo sin ningún incremento
recibido").

### 4.1 Movimiento de Saldo de Vacaciones (`MovimientoSaldo`)

| Campo             | Tipo                              | Notas |
|--------------------|-------------------------------------|-------|
| `tipo`             | `'incremento'` \| `'asignacion'` \| `'reversion'` | |
| `fecha`            | `'YYYY-MM-DD'`                     | fecha del incremento anual, o fecha de carga/reversión de la asignación |
| `dias`             | integer (signo incluido)           | positivo en `incremento`/`reversion`, negativo en `asignacion` |
| `saldoResultante`  | integer                            | saldo del legajo inmediatamente después de este movimiento |
| `antiguedadAnios`  | integer \| `null`                  | solo en `tipo: 'incremento'`: antigüedad usada para calcular `dias` |
| `asignacionId`     | string \| `null`                   | solo en `tipo: 'asignacion'`/`'reversion'`: referencia a §5 |
| `autor`            | string \| `null`                   | solo en `asignacion`/`reversion` (un `incremento` es del sistema, `autor: null`) |

## 5. Asignación de Vacaciones (`data/presentismo/vacaciones.json`, `asignaciones[]`)

| Campo          | Tipo                 | Notas                                                        |
|-----------------|-----------------------|-----------------------------------------------------------------|
| `id`            | string (uuid)         | identificador estable, referenciado por `MovimientoSaldo.asignacionId` y por cada Justificación-espejo (`origenCarga.asignacionVacacionesId`, ver §6) |
| `legajo`        | integer ≥ 1            |                                                                 |
| `fechaInicio`   | `'YYYY-MM-DD'`        |                                                                 |
| `cantidadDias`  | integer > 0            | días corridos                                                  |
| `fechaFin`      | `'YYYY-MM-DD'`        | derivada: `fechaInicio + (cantidadDias - 1)` días              |
| `autor`         | string \| `null`       |                                                                 |
| `fechaHora`     | ISO 8601               | fecha/hora de carga                                             |
| `vigente`       | boolean                 |                                                                 |
| `reversion`     | `{ autor, fechaHora } \| null` | igual patrón que `Justificación`/`Corrección Manual`   |

Regla de invariancia: mientras `vigente === true`, existe exactamente una
Justificación-espejo vigente (§6, `motivoId: 'vacaciones-anual'`) por cada
fecha en `[fechaInicio, fechaFin]`, en el período que corresponda a esa
fecha. Revertir la asignación revierte cada una de esas Justificaciones y
agrega el `MovimientoSaldo` de tipo `reversion`.

## 6. Justificación-espejo de Vacaciones (extiende la Justificación de la feature 012)

No es una entidad nueva de almacenamiento: es un registro más en la
colección `justificaciones` de `P<periodo>/calendario.json` (`file-
presentismo-repository.js`), con esta particularidad frente a una
Justificación cargada por el flujo genérico de 012:

| Campo         | Valor                                                        |
|----------------|----------------------------------------------------------------|
| `motivoId`     | siempre `'vacaciones-anual'` (reservado; nunca proviene de `config/motivos-ausencia.json`) |
| `etiquetaMotivo` | siempre `'Vacaciones'`                                        |
| `tipoPago`     | siempre `'No paga'`                                            |
| `origenCarga`  | `{ asignacionVacacionesId: <id de §5> }` — distingue estos registros de un rango cargado por 012 (que usa `{ desde, hasta }`) o una carga de un solo día (`null`) |

`justificacionVigenteDe(justificaciones, legajo, fecha)` (ya existente en
`justificacion.js`) sirve sin cambios tanto para detectar solapamiento con
una Justificación genérica como con una Justificación-espejo de vacaciones
(FR-007): ambas viven en la misma colección.

## Relaciones

```text
Legajo (padrón, §1)
  └─ fechaIngreso ──> antigüedad (calculada, no persistida) ──┐
                                                                 │ usa
Escala Antigüedad→Días (config, §2) ─────────────────────────────┘
Configuración Incremento Anual (config, §3)
  └─ dispara ──> Movimiento 'incremento' (§4.1) ──> Saldo de Vacaciones (§4)

Asignación de Vacaciones (§5)
  ├─ genera ──> Movimiento 'asignacion' (§4.1, resta del Saldo)
  ├─ genera ──> N Justificaciones-espejo (§6), una por día corrido
  └─ al revertirse ──> Movimiento 'reversion' (§4.1, repone el Saldo)
                        + revierte cada Justificación-espejo generada
```

## Validaciones cruzadas (resumen de FR relevantes)

- `cantidadDias > 0` y `fechaInicio` presente (FR-003).
- Ningún día del rango `[fechaInicio, fechaFin]` tiene ya una Justificación
  vigente (genérica o espejo) para ese legajo (FR-007).
- Todo período tocado por `[fechaInicio, fechaFin]` tiene calendario
  generado (404 `CALENDARIO_NO_GENERADO`, mismo código que 012) y está
  abierto (409 `PERIODO_CERRADO`, mismo código que 013) — verificado para
  **todos** los períodos antes de escribir nada (FR-005, todo o nada).
- El incremento automático anual (FR-010/FR-012/FR-013) solo aplica a
  legajos `activo: true` con `fechaIngreso` no nulo; suma sobre el saldo
  existente sin pisarlo.
