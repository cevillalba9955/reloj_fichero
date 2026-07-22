# Contract (addendum): API de control local del servicio de fichadas

**Feature**: 014-pagina-config | **Date**: 2026-07-22

Extiende el contrato ya existente en
`specs/010-fichadas-hoy/contracts/control-api.md` (`POST /tick`, servidor
`node:http` en loopback, puerto `FICHADAS_CONTROL_PORT`, opt-in). Este
documento solo describe la ruta nueva que agrega esta feature; el resto del
contrato (bind a `127.0.0.1`, sin autenticación adicional, comportamiento
opt-in) no cambia.

## `POST /probar-conexion`

Body:

```json
{ "host": "10.0.0.5", "port": 5005 }
```

Usa `connectSocket(host, port, timeoutMs)` de `src/protocol/client.js` — el
mismo driver aislado que ya usa el scheduler — con `timeoutMs` igual al
`FICHADAS_TIMEOUT_MS` vigente del proceso `rs956-fichadas`. Abre la conexión,
la cierra inmediatamente sin ejecutar ningún comando del protocolo (no
consulta fichadas, no altera el estado del scheduler ni su configuración
cargada), y responde:

- **200** `{ "ok": true }` — la conexión TCP se estableció.
- **200** `{ "ok": false, "motivo": "..." }` — no se pudo conectar (timeout,
  conexión rechazada); `motivo` es el mensaje de
  `ConexionRechazadaError` tal cual lo lanza `connectSocket`.

No hay código de error 4xx/5xx propio de esta ruta: cualquier fallo de
conexión al reloj es un resultado válido (`ok: false`), no una falla del
control-API en sí. Si el `host`/`port` del body faltan o tienen tipo
incorrecto, responde **400** con la misma forma de error que `POST /tick`.

## Notas

- Este endpoint es puramente diagnóstico: nunca persiste nada ni cambia el
  host/puerto que el scheduler en curso está usando (ese sigue siendo el
  cargado al arrancar el proceso, FR-006 del spec).
- Si el servidor de control no está levantado (`FICHADAS_CONTROL_PORT` no
  configurado) o el proceso `rs956-fichadas` está caído, el `fetch` del lado
  web falla con error de conexión — el proceso web (`configuracion-handlers.js`)
  lo traduce a `502` `SERVICIO_FICHADAS_NO_DISPONIBLE` hacia el frontend (ver
  `web-api-configuracion.md`), igual criterio que
  `ERROR_CONSULTANDO_RELOJ` en el contrato de la feature 010.
