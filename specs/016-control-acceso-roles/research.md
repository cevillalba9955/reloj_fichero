# Research: Control de Acceso por Roles (Lector / Editor / Configurador)

**Feature**: 016-control-acceso-roles | **Date**: 2026-07-28

Todas las incógnitas de la spec (sección Clarifications) ya se resolvieron con
el usuario antes de escribir `spec.md`. Esta fase de investigación se limita a
las decisiones **técnicas** necesarias para diseñar el adaptador de identidad
reemplazable que pide FR-002, dado que el mecanismo real de APEX todavía no
está definido (Assumptions del spec).

## 1. Punto de enchufe para la identidad/rol del usuario

**Decisión**: la app resuelve el rol actual leyendo un único header HTTP de
la request entrante (nombre configurable, default `X-Apex-Rol`), y lo traduce
al rol interno vía el mapeo fijo de `config/roles.json` (§3). Si el header
está ausente, vacío, o su valor no aparece en el mapeo, el rol resuelto es
`lector` (FR-004).

**Rationale**:
- Es la implementación más simple que cumple FR-002 (interfaz estable y
  reemplazable) sin construir un mecanismo que no se pidió: leer un header es
  compatible tanto con "el mismo proceso web ya corre detrás de un proxy/APEX
  que inyecta el header" (si ese termina siendo el mecanismo real) como con
  cualquier otro mecanismo futuro — solo cambia qué produce el valor del
  header o qué reemplaza a esta función, nunca la lógica de autorización que
  consume el rol ya resuelto (`exigirRol`, ver data-model.md).
- Permite construir, probar y demostrar de punta a punta el control de acceso
  ahora mismo (los 3 roles se pueden ejercitar mandando el header a mano,
  incluso con `curl`), sin bloquear la feature en una integración externa que
  hoy no está definida — consistente con la Assumption del spec ("el
  adaptador de identidad puede apoyarse en una fuente de configuración
  simple").
- Es puramente aditivo: ninguna ruta ni componente existente cambia de
  comportamiento para quien no manda el header (cae a Lector, el nivel más
  seguro).

**Alternativas consideradas**:
- *Validar un token/JWT emitido por APEX*: exige elegir y versionar un
  formato de token, una clave de verificación y su rotación — todo eso es
  parte del mecanismo real de APEX que la spec dejó explícitamente fuera de
  alcance (Assumptions). Prematuro sin una definición real que validar.
- *Consultar una tabla/vista en Oracle (mismo patrón que el padrón de la
  feature 003)*: acoplaría esta feature a una tabla que hoy no existe y que
  RRHH todavía no definió; además introduciría una llamada a Oracle en cada
  request, cuando la propia feature no requiere eso (Assumption: "no se
  requiere una pantalla de inicio de sesión propia").
- *Pantalla de login propia con usuario/contraseña*: contradice
  explícitamente la Assumption del spec ("no se requiere una pantalla de
  inicio de sesión propia de esta aplicación").

**Actualización (2026-07-28) — mecanismo real confirmado**: la app se
embebe como **iframe** dentro de una página de APEX (`research/p00023.yaml`,
página 23 "FICHADA", región tipo URL). Un iframe no puede recibir un header
inyectado desde afuera (eso solo lo hace un proxy intermedio, que acá no
existe), así que el "header HTTP" de la decisión de arriba se sigue
usando tal cual del lado del backend, pero quien se lo pasa al frontend
cambia: APEX pasa el rol directo por el query string de la URL del
iframe (`?rol=...`, sustituyendo un ítem de APEX), y el frontend
(`frontend/src/utils/rol-apex.js`) lo lee una vez al cargar y lo reenvía
como el mismo header `X-Apex-Rol` en cada llamada a `/api/*`. Riesgo
aceptado explícitamente: ese valor es editable desde las herramientas de
desarrollador del navegador; se acepta por ser una app de red interna.
Detalle completo, incluida la configuración necesaria del lado de APEX:
[contracts/apex-iframe-embed.md](./contracts/apex-iframe-embed.md).
`exigirRol`/`resolverRolActual` (`src/web/acl/autorizacion.js`) no
cambiaron nada — la interfaz reemplazable ya prevista acá absorbió el
mecanismo real sin tocar la lógica de autorización, tal como estaba
planeado.

## 2. Dónde y cómo se aplica la autorización

**Decisión**: un módulo nuevo (`src/web/acl/autorizacion.js`) resuelve el rol
actual a partir del `req` y expone `exigirRol(rolMinimo, handler)`, un
envoltorio de orden superior que cada archivo de handlers (`*-handlers.js`)
aplica a las rutas que corresponda al registrarlas en el router (mismo lugar
donde hoy se registran, sin cambiar la forma del router). Si el rol no
alcanza, lanza `ApiError(403, 'ACCESO_DENEGADO', mensaje)` — mismo mecanismo
uniforme de error que ya usa el resto de la API (`router.js`).

**Rationale**:
- FR-009 exige que el rechazo ocurra en el servidor, no solo ocultando
  controles en la interfaz; envolver el handler en el punto de registro es la
  forma más directa de garantizar que ninguna ruta quede sin envolver por
  descuido (queda a la vista en el propio archivo de handlers, junto a la
  ruta que protege).
- Reutiliza el mecanismo de error ya existente del router (`ApiError` →
  `{ error: { codigo, mensaje } }`), consistente con FR-010 (rechazo
  distinguible de un error de validación) sin tocar `router.js`.
- No requiere middleware global ni cambiar la firma de `router.add`: el
  router sigue siendo agnóstico de autorización, igual que hoy es agnóstico
  de negocio.

**Alternativas consideradas**:
- *Middleware global en `router.js` con una tabla ruta→rol*: centraliza el
  mapeo, pero exige mantener una tabla separada de las rutas reales (riesgo
  de que una ruta nueva se registre sin agregarse a la tabla) y le da a
  `router.js` conocimiento de negocio (qué rol necesita cada ruta) que hoy no
  tiene. Se descarta a favor de que cada archivo de handlers declare su
  propio requisito junto a la ruta.
- *Chequeo de rol dentro de cada handler*: repetiría la misma lógica de
  comparación de rango en cada handler; se descarta a favor de un envoltorio
  reutilizable.

## 3. Formato del mapeo fijo (`config/roles.json`)

**Decisión**: mismo patrón que `config/motivos-ausencia.json` /
`config/categorias.json` (JSON versionado en el repo, ruta configurable por
variable de entorno, `*.example.json` como plantilla sin datos reales):

```json
{
  "rolPorDefecto": "lector",
  "mapeo": {
    "<rol u origen que en el futuro provea APEX>": "editor",
    "<otro rol de origen>": "configurador"
  }
}
```

`rolPorDefecto` y los valores de `mapeo` deben ser uno de `lector` / `editor`
/ `configurador`; se valida fail-fast al cargar, mismo estilo que
`categorias-config.js`/`motivos-ausencia-config.js`. Se relee en cada acceso
(no se cachea al arrancar el proceso), igual que `motivosAusenciaConfig` en
`wiring.js`, para que ajustar el mapeo no requiera reiniciar `rs956-web`.

**Rationale**: consistencia con el resto de la configuración de dominio ya
existente (misma forma de override por entorno, mismo criterio de
hot-reload, mismo archivo `.example.json` para no commitear nombres de roles
reales de APEX). Evita introducir un mecanismo de configuración nuevo para
esta única feature.

**Alternativas consideradas**:
- *Variable de entorno con lista separada por comas*: no escala bien a un
  mapeo de N a 1 (varios roles de origen → un rol interno) ni es fácil de
  editar como los `.json` existentes; se descarta por inconsistencia con el
  resto del proyecto.

## 4. Cómo la interfaz conoce el rol actual

**Decisión**: un endpoint de solo lectura, sin restricción de rol,
`GET /api/acl/mi-rol`, que devuelve el rol ya resuelto para la request
actual (mismo mecanismo que exigirRol usa internamente). El frontend lo
consulta una vez al montar la aplicación y guarda el resultado en un
contexto de React (Principio I: estado compartido centralizado, no prop
drilling).

**Rationale**: FR-012 exige que el usuario vea su rol actual; y tanto
`AppShell` (ocultar "Configuración") como cada formulario de escritura
necesitan la misma información sin repetir la llamada — un contexto
alimentado por un único fetch inicial es el patrón más simple.
