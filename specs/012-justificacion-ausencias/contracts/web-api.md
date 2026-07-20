# Contrato: API web `/api/.../justificaciones`

Mismo estilo que los contratos de 010/011: router propio
(`src/web/api/router.js`), errores uniformes `{ error: { codigo, mensaje } }` vía
`ApiError`. Rutas nuevas en `src/web/api/justificaciones-handlers.js` con
`registrarRutas(router, ctx)`; `ctx` es el contexto web existente ampliado con el
catálogo de motivos cargado al arranque (`ctx.motivosAusencia`).

## `GET /api/motivos-ausencia`

Devuelve el catálogo de motivos activos, para poblar la lista de selección de
`FormularioJustificacion.jsx`.

Respuestas:
- **200** `{ motivos: [{ id, etiqueta, tipoPago }] }` — solo motivos con `activo:
  true` (data-model.md), en el orden del archivo de configuración.

## `POST /api/justificaciones`

Registra una Justificación para un día único o, si se envía `hasta`, para un rango
`[fecha, hasta]` (FR-003a). Devuelve el resultado día por día.

Body:
```json
{
  "legajo": "1234",
  "fecha": "2026-07-22",
  "hasta": "2026-07-24",
  "motivoId": "vacaciones",
  "autor": "rrhh.mgomez"
}
```
- `hasta` es opcional; si se omite, se justifica solo `fecha`.
- `autor` es opcional (mismo criterio que correcciones/pausas de 010).

Validaciones (→ **400** `JUSTIFICACION_INVALIDA` con el detalle en `mensaje`):
- `legajo` y `fecha` obligatorios y con formato válido (mismos validadores que
  `fichadas-hoy-handlers.js`).
- `hasta` (si viene) debe ser una fecha válida, `>= fecha`.
- `motivoId` obligatorio y debe existir en el catálogo **activo**.

Respuesta:
- **200**
  ```json
  {
    "registradas": [
      { "fecha": "2026-07-22", "motivoId": "vacaciones", "etiquetaMotivo": "Vacaciones", "tipoPago": "Paga" },
      { "fecha": "2026-07-23", "motivoId": "vacaciones", "etiquetaMotivo": "Vacaciones", "tipoPago": "Paga" }
    ],
    "omitidas": [
      { "fecha": "2026-07-25", "razon": "NO_LABORABLE" }
    ],
    "noAplicables": [
      { "fecha": "2026-07-24", "razon": "CON_FICHADAS" }
    ]
  }
  ```
  `razon` ∈ {`NO_LABORABLE` (día `No Laborable`/`Feriado`, se omite en silencio, no es
  un error), `CON_FICHADAS` (día pasado con al menos una fichada), `YA_JUSTIFICADO`
  (ya tiene una Justificación vigente)}. Para una carga de un solo día (sin `hasta`),
  si ese único día no es elegible la respuesta es **409** (ver abajo) en vez de un 200
  con `registradas: []`, para que la UI de un solo día muestre un error claro; en una
  carga por rango, el mismo caso puntual va a `noAplicables` sin abortar el resto
  (Acceptance Scenario 7 del spec).
- **404** `CALENDARIO_NO_GENERADO` — el período del día pedido no tiene calendario
  generado (004).
- **409** `JUSTIFICACION_NO_APLICABLE` — carga de un solo día (`hasta` omitido) sobre
  un día no elegible (`CON_FICHADAS`, `NO_LABORABLE` o `YA_JUSTIFICADO`); el `mensaje`
  indica cuál de los tres.
- **409** `RANGO_SIN_DIAS_ELEGIBLES` — carga por rango donde ningún día resultó
  elegible (edge case del spec).

## `DELETE /api/justificaciones`

Revierte la Justificación vigente de un legajo/día.

Body:
```json
{ "legajo": "1234", "fecha": "2026-07-22", "autor": "rrhh.mgomez" }
```

Respuestas:
- **200** `{ fecha, revertida: true }`.
- **400** `JUSTIFICACION_INVALIDA` — `legajo`/`fecha` faltantes o con formato
  inválido.
- **404** `JUSTIFICACION_NO_ENCONTRADA` — no hay una Justificación vigente para ese
  legajo/día.

## Efecto sobre endpoints existentes (sin romper contrato)

- `GET /api/fichadas-hoy` y `GET /api/resumen-periodo` / `GET
  /api/resumen-periodo/{legajo}` (010/011) agregan, por día, un campo opcional
  `justificacion: { motivoId, etiquetaMotivo, tipoPago } | null` cuando corresponde
  (FR-011). Los clientes existentes que ignoran campos desconocidos no se rompen; no
  se elimina ni renombra ningún campo previo.
- El acumulado de horas esperadas/trabajadas de `GET /api/resumen-periodo` refleja el
  crédito de un día `Paga` (FR-013) de la misma forma que ya refleja un `Feriado`; no
  se agrega un campo nuevo para eso, es el mismo número ya expuesto.

## Invariantes de contrato (verificadas por tests)

- Una carga por rango nunca deja el archivo del período a medio escribir: cada día
  elegible se persiste antes de devolver la respuesta; si el proceso se interrumpe a
  mitad de un rango, los días ya registrados quedan válidos (misma garantía de
  escritura atómica por día que ya da `file-presentismo-repository.js`).
- `DELETE` seguido de `GET /api/resumen-periodo/{legajo}` dejan de mostrar el motivo
  en ese día (SC-002, trazabilidad: el registro revertido sigue existiendo pero no
  vigente — no se expone como justificación activa).
- Sin datos biométricos ni `rawHex` en ninguna respuesta (mismo criterio que 010/011).
