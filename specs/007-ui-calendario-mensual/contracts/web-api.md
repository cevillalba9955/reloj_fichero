# Contrato — API HTTP del backend (feature 007)

Backend fino (`src/web/`) sobre `node:http`. Es la **única** superficie de datos que el
frontend consume (Principio I). Todas las respuestas son JSON UTF-8. La API opera solo sobre
archivos JSON locales del dominio de presentismo; no accede a Oracle ni al reloj.

Base path: `/api`. Errores usan `{ "error": { "codigo": string, "mensaje": string } }`.

## GET /api/calendarios

Lista los meses con calendario generado y cuál es el último.

**200 OK**
```json
{ "periodos": ["202606", "202607"], "ultimo": "202607" }
```
- `periodos`: `YYYYMM` ascendentes. `ultimo`: `max(periodos)` o `null` si no hay ninguno.
- Cuando `ultimo === null`, el frontend muestra el estado vacío global (FR-011).

## GET /api/calendarios/:periodo

Devuelve la `VistaCalendarioMes` de un mes (ver [data-model.md](../data-model.md)).
`:periodo` es `YYYYMM`.

**200 OK** (ejemplo abreviado)
```json
{
  "periodo": "202607",
  "anio": 2026, "mes": 7,
  "esUltimoGenerado": true,
  "hoy": "2026-07-14",
  "periodoActivo": {
    "etiqueta": "Julio 2026", "tramo": "Mes",
    "desde": "2026-07-01", "hasta": "2026-07-31"
  },
  "leyenda": [
    { "clave": "habil", "etiqueta": "Hábil", "descripcion": "Día laborable" },
    { "clave": "no-laborable", "etiqueta": "No laborable", "descripcion": "No aporta jornada" },
    { "clave": "feriado", "etiqueta": "Feriado", "descripcion": "Pago, no se trabaja" },
    { "clave": "hoy", "etiqueta": "Hoy", "descripcion": "Fecha actual" },
    { "clave": "periodo-activo", "etiqueta": "Período activo", "descripcion": "Días del período en curso" }
  ],
  "dias": [
    { "fecha": "2026-07-01", "dd": 1, "diaSemana": 3, "clasificacion": "Laborable",
      "reclasificadoManual": false, "esHoy": false, "enPeriodoActivo": true, "resaltado": "habil" }
  ]
}
```

Reglas:
- `hoy` es `null` si la fecha actual del servidor no cae en `:periodo` (FR-007).
- `dias` cubre todos los días del mes en orden (SC-007).
- **No** incluye datos personales, legajos ni fichadas (FR-014).

**404 Not Found** — no existe calendario para `:periodo` (aún no generado). El frontend
muestra el estado vacío de ese mes (FR-011) y no ofrece reclasificar (FR-018).
```json
{ "error": { "codigo": "CALENDARIO_NO_GENERADO", "mensaje": "No hay calendario para 202609" } }
```

**400 Bad Request** — `:periodo` no es un `YYYYMM` válido.

## POST /api/calendarios/:periodo/reclasificar

Reclasifica un día. Se invoca **solo después** de la confirmación explícita del usuario
(FR-016). Delega en `service.reclasificarDia`.

**Request body**
```json
{ "fecha": "2026-07-12", "clasificacion": "Feriado", "autor": "ui:cevillalba" }
```
- `fecha`: `YYYY-MM-DD`, debe pertenecer a `:periodo`.
- `clasificacion`: `"Laborable" | "No Laborable" | "Feriado"`.
- `autor`: identificador de quien realiza el cambio (para el evento estructurado, FR-019).
  Opcional; si falta, se registra `null`.

**200 OK** — devuelve la `VistaCalendarioMes` actualizada (misma forma que el GET), para
que la UI refleje el cambio sin un segundo request (FR-017).

**400 Bad Request** — `clasificacion` inválida, `fecha` mal formada, o `fecha` fuera del
mes. Mensaje del dominio propagado.
```json
{ "error": { "codigo": "RECLASIFICACION_INVALIDA", "mensaje": "..." } }
```

**404 Not Found** — no existe calendario para `:periodo` (no hay días que reclasificar,
FR-018).

Efectos (garantizados por el dominio):
- Escritura atómica del calendario (temp + rename); `reclasificadoManual: true` en el día.
- Evento estructurado `dia_reclasificado` con `{ periodo, dia, clasificacion, autor }`, sin
  datos sensibles (Principio V).
- Idempotente respecto del valor final: refijar la misma clasificación deja el mismo estado.

## No-goals de la API (esta feature)

- No expone endpoints de cálculo de presentismo por empleado, correcciones ni pausas (son de
  la feature 004 y de vistas futuras).
- No genera meses (`generar-calendario` sigue siendo del CLI/otra vista).
- No expone padrón, nombres ni fichadas.

## Tests de contrato asociados

- `tests/contract/web-api-calendario.test.js`: forma de las tres respuestas (campos
  requeridos, ausencia de datos personales, `hoy` null fuera de mes, `ultimo` correcto).
- `tests/integration/reclasificar-desde-api.test.js`: `POST` persiste y el `GET` siguiente
  refleja la nueva clasificación; `POST` sobre período inexistente → 404; clasificación
  inválida → 400.
