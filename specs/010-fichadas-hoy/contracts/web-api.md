# Contrato: API web `/api/fichadas-hoy/*`

Sigue el mismo estilo que `specs/008-calendario-contiguo/contracts/web-api.md`: router
propio (`src/web/api/router.js`), errores uniformes `{ error: { codigo, mensaje } }`
vía `ApiError(status, codigo, mensaje)`. Registrado en un nuevo
`src/web/api/fichadas-hoy-handlers.js` con `registrarRutas(router, ctx)`, donde `ctx`
ahora incluye `activeEmployeesProvider` y `scheduler` (research.md §4/§5) además de
`repo`/`service`/`categoriasConfig`/`logger`.

## `GET /api/fichadas-hoy`

Devuelve la `VistaFichadasHoy` del día solicitado (data-model.md), incluido el bloque
`navegacion { anterior, siguiente, esHoy }` calculado por el servidor.

Parámetro opcional de query `?fecha=YYYY-MM-DD` — **parte oficial del contrato desde
la iteración 2** (research.md §6): por defecto `hoyLocal()` del servidor (mismo helper
que 007/008); una fecha explícita debe cumplir el predicado de navegabilidad
(`fecha <= hoy` y período con calendario generado — "período de liquidación abierto",
FR-016/FR-017).

- **200** `VistaFichadasHoy`
- **400** `FECHA_INVALIDA` si el formato no es `YYYY-MM-DD`.
- **400** `FECHA_FUERA_DE_RANGO` si la fecha es futura o su período no tiene
  calendario generado (período no abierto).
- **500** `ERROR_CALCULANDO_FICHADAS_HOY` si el servicio falla al calcular algún
  empleado (no aborta toda la vista por un solo legajo con anomalía — eso se refleja
  como `anomalias` en su fila, no como error HTTP).

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

Sin body. **No** dispara ningún `scheduler` en el proceso web (research.md §4: el web
server y el servicio de fichadas son procesos de SO separados en el despliegue real).
El handler hace un `POST` HTTP local a `FICHADAS_CONTROL_URL` (default
`http://127.0.0.1:5006`) `/tick` — ver `contracts/control-api.md` — y, si esa llamada
devuelve éxito, recalcula y devuelve la `VistaFichadasHoy` (el sink de persistencia ya
escribió las fichadas nuevas en el archivo del período de forma síncrona antes de que
el `/tick` respondiera; no hace falta un paso de importación separado).

- **200**
  ```json
  { "resultado": "ok", "fichadasNuevas": 3, "vista": { "...VistaFichadasHoy" } }
  ```
  (o `"resultado": "omitido"` con `fichadasNuevas: 0` si el servicio de fichadas ya
  tenía una consulta en curso — mismo contrato que `getUltimoCiclo()` de 002; no es un
  error).
- **502** `ERROR_CONSULTANDO_RELOJ` si el `POST /tick` local falla (el servicio de
  fichadas no responde, está caído, o su ciclo terminó en error) — la vista existente
  no se ve afectada; el cliente conserva lo que ya tenía en pantalla (FR-010 del spec).

## Validación de fecha en los POST de edición (iteración 2)

`POST /correcciones`, `POST /pausas` y `POST /retiros-anticipados` aplican sobre la
`fecha` del body el **mismo predicado de navegabilidad** que el `GET` (research.md
§6): fecha futura o de un período sin calendario generado → **400**
`FECHA_FUERA_DE_RANGO` (antes de cualquier validación de negocio). Esto habilita la
edición de días previos dentro del período abierto (US5, FR-003/FR-006/FR-007) y
bloquea en el servidor lo que la UI ya no ofrece.

`POST /consultar-reloj` no acepta fecha: siempre opera sobre el día actual (FR-008);
la UI solo muestra el botón cuando `navegacion.esHoy` es `true`.

## Notas comunes

- Todas las respuestas de fila (`FilaFichadaHoy`) usan el mismo formato de hora
  `'HH:MM'` que el resto de la UI (nunca minutos-del-día crudos hacia el cliente).
- Ninguna respuesta incluye `rawHex` ni datos biométricos (Principio V).
- Los cuatro `POST` son idempotentes en el sentido de que reintentar con el mismo
  body agrega un nuevo registro de auditoría (no se deduplican) — igual criterio que
  `guardarCorreccion`/`guardarPausa` en 004 (cada alta es un evento auditable propio).
