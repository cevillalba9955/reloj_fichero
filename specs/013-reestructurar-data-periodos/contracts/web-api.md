# Contrato: API web `/api/calendarios/:periodo/{cerrar,reabrir}`

**Feature**: 013-reestructurar-data-periodos | **Date**: 2026-07-20

Extiende `src/web/api/calendario-handlers.js` (feature 007/008), mismo estilo que
`POST /api/calendarios/:periodo/reclasificar`: router propio
(`src/web/api/router.js`), errores uniformes `{ error: { codigo, mensaje } }`.

## `POST /api/calendarios/:periodo/cerrar`

Cierra el calendario del período (US3, FR-005/FR-005a/FR-008).

Body:
```json
{ "autor": "rrhh.mgomez" }
```
- `autor` opcional (mismo criterio best-effort que correcciones/pausas/justificaciones).

Respuestas:
- **200** `VistaCalendarioMes` (mismo cuerpo que `GET /api/calendarios/:periodo`),
  con `cerrado: true` reflejado. Idempotente: cerrar un período ya cerrado también
  devuelve 200 y actualiza el autor/fecha del cierre.
- **400** `PERIODO_INVALIDO` — formato distinto de `YYYYMM`.
- **404** `CALENDARIO_NO_GENERADO` — el período no tiene calendario generado
  todavía.

## `POST /api/calendarios/:periodo/reabrir`

Reabre un período cerrado (US3, FR-008).

Body:
```json
{ "autor": "rrhh.mgomez" }
```

Respuestas:
- **200** `VistaCalendarioMes`, con `cerrado: false` reflejado. Idempotente: reabrir
  un período ya abierto también devuelve 200.
- **400** `PERIODO_INVALIDO`.
- **404** `CALENDARIO_NO_GENERADO`.

## Efecto sobre endpoints existentes (sin romper contrato)

- `GET /api/calendarios/:periodo` (`VistaCalendarioMes`) agrega un campo `cerrado:
  boolean` (y opcionalmente `cierre`/`reapertura` con `autor`/`fechaHora`, ver
  data-model.md) al nivel raíz de la respuesta. Los clientes existentes que ignoran
  campos desconocidos no se rompen.
- `POST /api/calendarios/:periodo/reclasificar` (010): agrega **409**
  `PERIODO_CERRADO` cuando el período está cerrado, en vez de aplicar la
  reclasificación.
- `POST /api/fichadas-hoy/correcciones`, `/pausas`, `/retiros-anticipados`
  (010) y `POST /api/justificaciones` (012): agregan **409** `PERIODO_CERRADO`
  cuando el período de la fecha indicada está cerrado, en vez de aplicar el cambio.
  El mensaje indica el período y desde cuándo está cerrado.
- Ningún endpoint de solo lectura (`GET /api/resumen-periodo*`, `GET
  /api/fichadas-hoy`, `GET /api/calendarios*`) cambia su comportamiento sobre un
  período cerrado (FR-007): siguen respondiendo igual que sobre uno abierto.

## Invariantes de contrato (verificadas por tests)

- Cerrar un período nunca modifica sus datos (calendario, correcciones, pausas,
  justificaciones, fichadas, padrón): solo agrega el indicador `cerrado` y los
  metadatos de auditoría.
- Tras cerrar, **todo** intento de escritura sobre ese período (los cinco endpoints
  listados arriba) responde 409 `PERIODO_CERRADO`, sin excepciones.
- Tras reabrir, esos mismos endpoints vuelven a comportarse exactamente igual que
  antes del cierre (sin datos perdidos ni alterados).
