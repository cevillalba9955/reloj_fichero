# Contrato: API web `/api/.../vacaciones`

Mismo estilo que `contracts/web-api.md` de 012: router propio
(`src/web/api/router.js`), errores uniformes `{ error: { codigo, mensaje } }`
vía `ApiError`. Rutas nuevas en `src/web/api/vacaciones-handlers.js` con
`registrarRutas(router, ctx)`; `ctx` se amplía con `ctx.vacacionesConfig`
(config cargada al arranque) y `ctx.vacacionesRepo` (adaptador de
`data/presentismo/vacaciones.json`).

## `GET /api/vacaciones`

Lista, para cada legajo activo del padrón, su antigüedad calculada a hoy, su
saldo actual y la fecha de su próximo incremento anual (US2, FR-008). Aplica
el incremento perezoso (research.md §4) a cada legajo antes de responder, de
forma que el saldo devuelto siempre está al día.

Respuesta:
- **200**
  ```json
  {
    "legajos": [
      {
        "legajo": 1234,
        "fechaIngreso": "2018-03-01",
        "antiguedadAnios": 8,
        "saldo": 3,
        "proximoIncremento": "2026-11-01",
        "pendienteFechaIngreso": false
      },
      {
        "legajo": 5678,
        "fechaIngreso": null,
        "antiguedadAnios": null,
        "saldo": 0,
        "proximoIncremento": null,
        "pendienteFechaIngreso": true
      }
    ]
  }
  ```
  `pendienteFechaIngreso: true` (FR-012, Acceptance Scenario US2.3): el
  padrón no tiene `fechaIngreso` cargada para ese legajo; no bloquea el
  listado del resto.

## `GET /api/vacaciones/{legajo}`

Historial completo de movimientos y asignaciones de un legajo (US2, FR-009).

Respuesta:
- **200**
  ```json
  {
    "legajo": 1234,
    "saldo": 3,
    "movimientos": [
      { "tipo": "incremento", "fecha": "2025-11-01", "dias": 21, "saldoResultante": 24, "antiguedadAnios": 6 },
      { "tipo": "asignacion", "fecha": "2026-01-10", "dias": -21, "saldoResultante": 3, "asignacionId": "a1", "autor": "rrhh.mgomez" }
    ],
    "asignaciones": [
      { "id": "a1", "fechaInicio": "2026-01-10", "cantidadDias": 21, "fechaFin": "2026-01-30", "autor": "rrhh.mgomez", "fechaHora": "2026-01-05T14:00:00.000Z", "vigente": true, "reversion": null }
    ]
  }
  ```

## `POST /api/vacaciones/asignaciones`

Asigna un período de vacaciones a un legajo (US1, FR-002..FR-007, FR-016).

Body:
```json
{ "legajo": 1234, "fechaInicio": "2026-01-10", "cantidadDias": 21, "autor": "rrhh.mgomez" }
```

Validaciones (→ **400** `VACACIONES_INVALIDA`):
- `legajo` obligatorio y válido.
- `fechaInicio` obligatoria, formato `YYYY-MM-DD`.
- `cantidadDias` entero > 0.

Flujo (todo o nada, research.md §6):
1. Expande `[fechaInicio, fechaInicio + cantidadDias - 1]` a la lista
   completa de fechas corridas (sin filtrar por clasificación del día).
2. Agrupa por período; para cada período: **404**
   `CALENDARIO_NO_GENERADO` si no tiene calendario, **409**
   `PERIODO_CERRADO` si está cerrado.
3. Para cada fecha: **409** `VACACIONES_SUPERPUESTA` si ya existe una
   Justificación vigente (genérica o espejo) de ese legajo en esa fecha
   (FR-007); la respuesta indica **todas** las fechas en conflicto, no solo
   la primera.
4. Si pasa 1–3: crea la Asignación (data-model.md §5), una Justificación-
   espejo por fecha (data-model.md §6) y el `MovimientoSaldo` tipo
   `asignacion` que descuenta `cantidadDias` del saldo (puede quedar
   negativo, FR-004).

Respuesta:
- **200**
  ```json
  {
    "asignacionId": "a1",
    "fechaInicio": "2026-01-10",
    "fechaFin": "2026-01-30",
    "cantidadDias": 21,
    "saldoResultante": 3
  }
  ```
- **400** `VACACIONES_INVALIDA` — datos faltantes/inválidos.
- **404** `CALENDARIO_NO_GENERADO` — algún período tocado no tiene calendario.
- **409** `PERIODO_CERRADO` — algún período tocado está cerrado.
- **409** `VACACIONES_SUPERPUESTA` — una o más fechas del rango ya tienen una
  Justificación vigente; `mensaje` lista las fechas en conflicto.

## `DELETE /api/vacaciones/asignaciones/{id}`

Revierte una Asignación de Vacaciones vigente (US4, FR-014/FR-015).

Body:
```json
{ "autor": "rrhh.mgomez" }
```

Flujo: revierte cada Justificación-espejo generada por la asignación (mismo
`repo.revertirJustificacion` día por día que usa 012) y agrega el
`MovimientoSaldo` tipo `reversion` que repone `cantidadDias` al saldo.

Respuestas:
- **200** `{ id, revertida: true, saldoResultante: 7 }`.
- **404** `VACACIONES_NO_ENCONTRADA` — no existe una asignación vigente con
  ese `id` para revertir.

## Efecto sobre `DELETE /api/justificaciones` existente (012)

- **409** `JUSTIFICACION_ES_VACACIONES` (código nuevo) — si `motivoId` del
  registro vigente en `legajo`/`fecha` es `'vacaciones-anual'`, el revert
  genérico de 012 la rechaza e indica que debe revertirse vía `DELETE
  /api/vacaciones/asignaciones/{id}` (research.md §1, guardrail de origen).
  No rompe el contrato existente de 012: es un nuevo código de error sobre
  un caso que antes no podía ocurrir (la Justificación-espejo no existía).

## Efecto sobre `GET /api/motivos-ausencia` existente (012)

- La entrada `vacaciones` del catálogo deja de aparecer en la lista de
  motivos activos (FR-018): se deshabilita (`activo: false`) como parte del
  despliegue de esta feature, con el mismo mecanismo de edición que ya
  expone `configuracion-handlers.js` (014). No se elimina del archivo:
  las Justificaciones históricas cargadas con ese motivo conservan su
  `etiquetaMotivo`/`tipoPago` sin cambios (mismo criterio que cualquier
  motivo desactivado, spec 012 Edge Cases).

## Invariantes de contrato (verificadas por tests)

- `POST /api/vacaciones/asignaciones` nunca deja una asignación a medias:
  si falla la escritura de alguna Justificación-espejo o del movimiento de
  saldo, no queda una asignación vigente sin su correlato completo (mismo
  criterio de atomicidad por operación que 012/013).
- El saldo devuelto por `GET /api/vacaciones` y `GET /api/vacaciones/
  {legajo}` es siempre el mismo número (una sola fuente de verdad,
  `data/presentismo/vacaciones.json`).
- Ningún endpoint de esta feature expone datos biométricos ni `rawHex`
  (mismo criterio que 010/011/012).
