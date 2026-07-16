# Contrato: API web `/api/fichadas-hoy/*`

Sigue el mismo estilo que `specs/008-calendario-contiguo/contracts/web-api.md`: router
propio (`src/web/api/router.js`), errores uniformes `{ error: { codigo, mensaje } }`
vía `ApiError(status, codigo, mensaje)`. Registrado en un nuevo
`src/web/api/fichadas-hoy-handlers.js` con `registrarRutas(router, ctx)`, donde `ctx`
ahora incluye `activeEmployeesProvider` y `scheduler` (research.md §4/§5) además de
`repo`/`service`/`categoriasConfig`/`logger`.

## `GET /api/fichadas-hoy`

Devuelve la `VistaFichadasHoy` del día actual del servidor (data-model.md).

- **200** `VistaFichadasHoy`
- **500** `ERROR_CALCULANDO_FICHADAS_HOY` si el servicio falla al calcular algún
  empleado (no aborta toda la vista por un solo legajo con anomalía — eso se refleja
  como `anomalias` en su fila, no como error HTTP).

Parámetro opcional de query `?fecha=YYYY-MM-DD` para pruebas/soporte (por defecto,
`hoyLocal()` del servidor, mismo helper que 007/008); fuera de rango del mes actual no
está soportado por esta feature (alcance: solo el día en curso, spec Assumptions).

## `POST /api/fichadas-hoy/correcciones`

Body:

```json
{
  "legajo": 123,
  "fecha": "2026-07-16",
  "entrada": "08:15",
  "salida": null,
  "autor": "admin@utn",
  "motivo": "Fichada de entrada perdida por corte de red del reloj"
}
```

- Al menos uno de `entrada`/`salida` (o `totalHoras`, compat 004) debe venir presente.
- `motivo` obligatorio, no vacío → si falta: **400** `CORRECCION_INVALIDA`.
- Formato de hora inválido → **400** `CORRECCION_INVALIDA`.
- Legajo sin categoría configurada (anomalía) → **409** `EMPLEADO_SIN_CATEGORIA` (no
  tiene sentido corregir una jornada que no se calcula).
- Éxito → **200** `FilaFichadaHoy` (la fila recalculada de ese legajo/fecha).

Delegan en `service.cargarCorreccion` (extendido, research.md §3) + logging
`correccion_alta` ya existente de 004.

## `POST /api/fichadas-hoy/pausas`

Body:

```json
{
  "legajo": 123,
  "fecha": "2026-07-16",
  "desde": "12:00",
  "hasta": "13:00",
  "autor": "admin@utn",
  "motivo": "Corte de mediodía no fichado"
}
```

- `tipo` implícito `'intermedia'` (este endpoint es para pausas; retiros van al
  endpoint siguiente).
- `motivo` obligatorio → si falta: **400** `PAUSA_INVALIDA`.
- `desde >= hasta` → **400** `PAUSA_INVALIDA`.
- Éxito → **200** `FilaFichadaHoy` recalculada.

## `POST /api/fichadas-hoy/retiros-anticipados`

Body:

```json
{
  "legajo": 123,
  "fecha": "2026-07-16",
  "hora": "14:30",
  "autor": "admin@utn",
  "motivo": "Turno médico autorizado"
}
```

- Internamente construye una `Pausa` con `tipo: 'retiro_anticipado'`,
  `desde = hora`, `hasta = cierreOficial` de la modalidad del empleado ese día
  (research.md §2).
- `motivo` obligatorio → si falta: **400** `RETIRO_INVALIDO`.
- `hora` posterior al cierre oficial → **400** `RETIRO_INVALIDO` (no hay nada que
  descontar; no es un retiro "anticipado").
- Éxito → **200** `FilaFichadaHoy` recalculada, con `situacion: 'RETIRO_ANTICIPADO'`.

## `POST /api/fichadas-hoy/consultar-reloj`

Sin body. Dispara `scheduler.tick()` (research.md §4) y, si trajo fichadas nuevas, las
importa al archivo acumulativo del período actual.

- **200**
  ```json
  { "resultado": "ok", "fichadasNuevas": 3, "vista": { "...VistaFichadasHoy" } }
  ```
  (o `"resultado": "omitido"` con `fichadasNuevas: 0` si ya había una consulta en
  curso — mismo contrato que `getUltimoCiclo()` de 002; no es un error).
- **502** `ERROR_CONSULTANDO_RELOJ` si el ciclo del scheduler termina en error (reloj
  no responde, timeout) — la vista existente no se ve afectada; el cliente conserva lo
  que ya tenía en pantalla (FR-010 del spec).

## Notas comunes

- Todas las respuestas de fila (`FilaFichadaHoy`) usan el mismo formato de hora
  `'HH:MM'` que el resto de la UI (nunca minutos-del-día crudos hacia el cliente).
- Ninguna respuesta incluye `rawHex` ni datos biométricos (Principio V).
- Los cuatro `POST` son idempotentes en el sentido de que reintentar con el mismo
  body agrega un nuevo registro de auditoría (no se deduplican) — igual criterio que
  `guardarCorreccion`/`guardarPausa` en 004 (cada alta es un evento auditable propio).
