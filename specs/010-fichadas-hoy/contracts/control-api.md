# Contrato: API de control local del servicio de fichadas (`rs956-fichadas.service`)

Nuevo, mínimo, atado **exclusivamente a `127.0.0.1`** (nunca a una interfaz externa) —
no es una API pública, es el mecanismo de research.md §4 para que el proceso web
(`rs956-web.service`) le pida al proceso dueño del reloj (`rs956-fichadas.service`,
donde vive el `scheduler` de la feature 002) que haga un ciclo fuera de horario. Sin
autenticación adicional: la superficie de ataque se limita por el bind a loopback
(mismo host, ambos procesos administrados por systemd).

Implementado con `node:http` (sin framework), igual criterio que `src/web/server.js`.
Puerto configurable por `FICHADAS_CONTROL_PORT` (default `5006`); si no se define, el
servidor de control **no se levanta** (comportamiento opcional/retrocompatible: una
instalación que no use esta feature no cambia su superficie de red).

## `POST /tick`

Sin body. Llama a `scheduler.tick({ forzarConsulta: true })` (mismo método que ya usa
el temporizador interno de 5 min, con una diferencia: al ser un disparo explícito del
administrador, **consulta al reloj en cualquier momento**, aunque ninguna ventana de
checkpoint esté abierta — el chequeo de ventana solo aplica al ciclo programado).
Respeta el single-flight `consultaEnCurso` de 002: si ya hay una consulta en curso, se
comporta igual que un tick del temporizador que encuentra el lock tomado (`"omitido"`).

- **200**
  ```json
  { "resultado": "ok" | "omitido" | "error", "fichadasNuevas": 0, "detail": "..." }
  ```
  Misma forma que `scheduler.getUltimoCiclo()` (ya documentada en
  `specs/002-servicio-fichadas-programado/contracts/service-contract.md`).
- El proceso web trata `"error"` como fallo del ciclo, pero la respuesta HTTP sigue
  siendo **200** (el `POST /tick` en sí se ejecutó correctamente; el ciclo del reloj es
  el que falló) — es la API web (`/api/fichadas-hoy/consultar-reloj`) la que traduce un
  `resultado: "error"` a **502** hacia el frontend.
- Si el servidor de control no está levantado (`FICHADAS_CONTROL_PORT` no configurado)
  o el proceso de fichadas está caído, el `fetch` del lado web falla con error de
  conexión (`ECONNREFUSED`/timeout) → **502** `ERROR_CONSULTANDO_RELOJ` en
  `contracts/web-api.md`.

## Notas

- Este control-API es un detalle de despliegue interno entre dos procesos del mismo
  host; no reemplaza ni expone el ciclo programado de 5 minutos (sigue corriendo igual,
  research.md §4 no lo toca).
- No hay otras rutas: no se expone `getState()` completo por este canal (ya existe,
  vía el propio proceso CLI, para status/diagnóstico — fuera de alcance de esta
  feature).
