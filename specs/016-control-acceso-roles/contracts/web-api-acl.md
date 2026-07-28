# Contract: API web de Control de Acceso

**Feature**: 016-control-acceso-roles | **Date**: 2026-07-28

Ruta nueva bajo `/api/acl/*`, registrada en `src/web/api/acl-handlers.js`
(mismo router sin framework de `src/web/api/router.js`, forma de error
uniforme `{ error: { codigo, mensaje } }`). Además, este contrato documenta
la extensión que esta feature aplica a **todas** las rutas de escritura ya
existentes y a **todas** las rutas de `/api/configuracion/*`.

## `GET /api/acl/mi-rol`

Sin restricción de rol (accesible para cualquier identidad, incluida una sin
rol resuelto — en ese caso responde `lector`, FR-004). Es el mecanismo por
el que la interfaz descubre qué puede mostrar/ocultar (FR-011) y qué rol
mostrarle al usuario (FR-012).

**200**
```json
{ "rol": "lector" }
```
`rol` es siempre uno de `"lector"` / `"editor"` / `"configurador"` (nunca
`null` ni el `rolOrigen` crudo — ver data-model.md).

## Extensión: rechazo por permiso insuficiente

Toda ruta protegida por `exigirRol` (ver research.md §2) responde, cuando el
rol resuelto de la request no alcanza:

**403** `ACCESO_DENEGADO`
```json
{ "error": { "codigo": "ACCESO_DENEGADO", "mensaje": "Tu rol actual (lector) no tiene permiso para esta operación (requiere editor o superior)" } }
```

Este código es nuevo y exclusivo de rechazos por rol — nunca se reutiliza
para errores de validación de datos (FR-010), que siguen devolviendo sus
códigos ya existentes (`VACACIONES_INVALIDA`, `CONFIGURACION_INVALIDA`,
etc.) sin cambios.

### Rutas que pasan a requerir rol `editor` o superior

| Método | Ruta | Handler |
|---|---|---|
| POST | `/api/calendarios/:periodo/generar` | `calendario-handlers.js` |
| POST | `/api/calendarios/:periodo/cerrar` | `calendario-handlers.js` |
| POST | `/api/calendarios/:periodo/reabrir` | `calendario-handlers.js` |
| POST | `/api/calendarios/:periodo/reclasificar` | `calendario-handlers.js` |
| POST | `/api/fichadas-hoy/correcciones` | `fichadas-hoy-handlers.js` |
| POST | `/api/fichadas-hoy/pausas` | `fichadas-hoy-handlers.js` |
| POST | `/api/fichadas-hoy/retiros-anticipados` | `fichadas-hoy-handlers.js` |
| POST | `/api/fichadas-hoy/consultar-reloj` | `fichadas-hoy-handlers.js` |
| POST | `/api/justificaciones` | `justificaciones-handlers.js` |
| DELETE | `/api/justificaciones` | `justificaciones-handlers.js` |
| POST | `/api/vacaciones/asignaciones` | `vacaciones-handlers.js` |
| DELETE | `/api/vacaciones/asignaciones/:id` | `vacaciones-handlers.js` |

Todas las rutas `GET` de estas mismas áreas (Calendario, Fichadas de hoy,
Resumen período, Vacaciones) quedan sin cambios: accesibles a partir de
`lector` (FR-005).

### Rutas que pasan a requerir rol `configurador`

**Todas** las rutas bajo `/api/configuracion/*` (`GET` incluido — FR-007: ni
Lector ni Editor pueden **ver** Configuración, no solo modificarla):

| Método | Ruta |
|---|---|
| GET/PUT | `/api/configuracion/reloj` |
| POST | `/api/configuracion/reloj/probar-conexion` |
| GET/POST | `/api/configuracion/motivos-ausencia` |
| PUT | `/api/configuracion/motivos-ausencia/:id` |
| GET | `/api/configuracion/categorias` |
| PUT | `/api/configuracion/categorias/esquema-semanal` |
| POST/PUT/DELETE | `/api/configuracion/categorias/modalidades[/:nombre]` |
| POST/PUT | `/api/configuracion/categorias/categorias[/:codigo]` |

## Resolución del rol (todas las rutas)

Cada request resuelve su rol leyendo el header configurado (default
`X-Apex-Rol`, ver research.md §1) y aplicando el mapeo de
`config/roles.json` (data-model.md). No hay estado de sesión de servidor:
la resolución es puramente por request, a partir del header presente en esa
request.
