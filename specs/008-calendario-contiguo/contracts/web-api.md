# Contrato — API HTTP (feature 008: generación contigua)

Extiende el contrato de la feature 007 (`src/web/`, `node:http`, respuestas JSON UTF-8, base
`/api`, errores `{ "error": { "codigo", "mensaje" } }`). Solo se documentan aquí los endpoints
que esta feature cambia o agrega. El resto sigue igual que en la 007.

> Nota: la 007 declaraba como no-goal "No genera meses". La feature 008 **deroga** ese no-goal:
> la generación de meses pasa a estar disponible desde la API/IU, con las guardas de contigüidad
> de este contrato.

## GET /api/calendarios (extendido)

Lista los meses generados, el último, el mes actual del servidor y la **frontera generable**.

**200 OK**
```json
{
  "periodos": ["202606", "202607", "202608"],
  "ultimo": "202608",
  "mesActual": "202607",
  "generables": ["202605", "202609"]
}
```

Reglas:
- `periodos`: `YYYYMM` ascendentes (existente). `ultimo`: `max(periodos)` o `null` (existente).
- `mesActual`: `"YYYYMM"` derivado del reloj del **servidor** (no del cliente); se usa como
  semilla y para marcar "hoy" en la grilla, no para acotar `generables` (corrección 2026-07-17,
  ver research.md D4 — antes tenía un tope superior).
- `generables`: los períodos `YYYYMM` habilitados para generar ahora, ordenados ascendentemente:
  - Con `periodos` no vacío: `periodoAnterior(min)` y `periodoSiguiente(max)`, **sin tope**
    (`periodoSiguiente(max)` se incluye aunque sea posterior a `mesActual`).
  - Con `periodos` vacío: `generables === [mesActual]` y `ultimo === null`.
  - Nunca contiene un período ya presente en `periodos`.
- No incluye datos personales, legajos ni fichadas (FR-011).

Ejemplo — sin calendarios aún:
```json
{ "periodos": [], "ultimo": null, "mesActual": "202607", "generables": ["202607"] }
```

Ejemplo — el máx+1 es futuro (máx = mes actual): igual se puede generar hacia adelante:
```json
{ "periodos": ["202607"], "ultimo": "202607", "mesActual": "202607", "generables": ["202606", "202608"] }
```

## POST /api/calendarios/:periodo/generar

Genera el calendario de `:periodo` (`YYYYMM`) aplicando la regla de contigüidad. Delega en
`service.generarCalendario` (feature 004). Es la **única** vía de la IU para dar de alta un mes.

**Sin request body.**

**200 OK** — devuelve la `VistaCalendarioMes` del período (misma forma que
`GET /api/calendarios/:periodo`), para que la UI muestre la grilla sin un segundo request. Se
devuelve tanto al generar un período nuevo generable como al invocar sobre un período **ya
generado** (idempotencia, FR-010; en ese caso no se regenera).

**400 Bad Request** — `:periodo` no es un `YYYYMM` válido.
```json
{ "error": { "codigo": "PERIODO_INVALIDO", "mensaje": "Período inválido \"2026-9\" (se espera YYYYMM)" } }
```

**409 Conflict** — `:periodo` no es contiguo a la secuencia generada (dejaría un hueco,
FR-002/FR-003). El mensaje identifica el período que debe generarse primero. Aplica también a
un período futuro que no sea exactamente `max+1` (no hay código distinto para "futuro": la
contigüidad es la única guarda, corrección 2026-07-17).
```json
{ "error": { "codigo": "PERIODO_NO_CONTIGUO", "mensaje": "202611 no es contiguo; generá primero 202609" } }
```

### Tabla de decisión del endpoint

| Condición de `:periodo`                                  | Resultado                                   |
|----------------------------------------------------------|---------------------------------------------|
| Formato inválido                                         | 400 `PERIODO_INVALIDO`                      |
| Ya generado                                              | 200 `VistaCalendarioMes` (sin regenerar)    |
| No adyacente a la secuencia (ni `min-1` ni `max+1`)      | 409 `PERIODO_NO_CONTIGUO`                   |
| `∈ generables` (adyacente, futuro o no, o semilla)       | 200 `VistaCalendarioMes` (recién generado)  |

> Orden de evaluación sugerido: formato → ya generado (idempotente) → no contiguo → generar. El
> código `PERIODO_FUTURO` existió hasta el 2026-07-17 (FR-004, retractado); un período futuro
> hoy se evalúa exactamente igual que cualquier otro.

### Efectos (garantizados por el dominio/servicio)

- Escritura atómica del calendario (temp + rename) vía `repo.guardarCalendario`.
- Evento estructurado `calendario_generado` con `{ periodo, dias, regenerado }` (Principio V),
  sin datos sensibles.
- Idempotente respecto del estado final: invocar sobre un período ya generado no crea duplicados
  ni altera la secuencia.
- La secuencia generada permanece contigua tras cualquier resultado (invariante FR-008).

## Tests de contrato asociados

- `tests/contract/web-api-calendario.test.js` (extendido):
  - `GET` incluye `mesActual` y `generables` correctos (con y sin períodos; máx+1 futuro incluido).
  - `POST /generar` sobre el período frontera → 200 y el `GET` siguiente refleja la secuencia
    extendida y la nueva frontera.
  - `POST /generar` sobre período no contiguo → 409 `PERIODO_NO_CONTIGUO` (futuro o no).
  - `POST /generar` sobre el período futuro inmediato (`max+1`) → 200, ya sin tope superior.
  - `POST /generar` sobre período ya generado → 200 sin cambios (idempotente).
  - `POST /generar` con `:periodo` mal formado → 400 `PERIODO_INVALIDO`.
- `tests/integration/generar-calendario-contiguo.test.js` (nuevo): flujo completo — semilla →
  extender adelante → intentar saltear (rechazo) → backfill atrás; verificación de la invariante.
