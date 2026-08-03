# Contrato: cómo APEX le pasa el rol a la app embebida (iframe)

**Feature**: 016-control-acceso-roles | **Fecha**: 2026-07-28

**Mecanismo adoptado.** Reemplaza a la idea original de un proxy que
inyecta un header HTTP (research.md §1): la app está embebida como
**iframe** en una página de APEX (ver `research/p00023.yaml`, página 23
"FICHADA"), y un iframe no puede recibir un header inyectado desde
afuera — APEX solo puede pasarle datos a través de la propia URL del
iframe (query string). Riesgo aceptado explícitamente (2026-07-28): ese
valor viaja visible en la URL y es editable desde las herramientas de
desarrollador del navegador; se acepta porque la app solo es alcanzable
en la red interna (mismo criterio que ya rige para Oracle y el reloj
biométrico).

> Esto **reemplaza** al enfoque de `oracle-roles-view.md` (consultar una
> vista de Oracle por usuario): ya no hace falta una vista nueva ni un
> adaptador Oracle — APEX ya sabe el rol de la persona (vía sus propios
> grupos/esquema de autorización) y se lo pasa a la app directamente, sin
> que la app tenga que ir a buscarlo. Ese documento queda como alternativa
> por si en el futuro se prefiere que la app resuelva el rol por su
> cuenta en vez de recibirlo ya resuelto.

## Cómo funciona, de punta a punta

1. **En APEX**: un ítem (de aplicación o de página) contiene el rol de la
   persona logueada, calculado con la lógica de autorización que APEX ya
   tenga (grupos, esquema de autorización, lo que sea). La región que
   embebe la app (tipo *URL*, `inclusion-mode: IFrame`) sustituye ese
   ítem en su `url`.
2. **El navegador** carga el iframe con esa URL, que ya incluye
   `?rol=<valor>`.
3. **Esta app** (`frontend/src/utils/rol-apex.js`) lee ese query string
   **una sola vez**, al montarse (no cambia sin recargar el iframe
   entero), y lo reenvía como el header `X-Apex-Rol` en **cada** llamada
   a `/api/*` que hace el frontend — mismo header que el backend ya sabía
   leer (`src/web/acl/autorizacion.js`, sin cambios).
4. **El backend** traduce ese valor con el mapeo fijo de
   `config/roles.json`, igual que antes.

Ningún código del backend cambió para esto — solo cambió **quién** pone el
header y **cómo** llega hasta ahí.

## Qué hay que configurar en APEX

### 1. Ítem con el rol de la persona

Ilustrativo — se adapta a cómo estén armados los grupos/roles hoy en la
aplicación APEX. Ejemplo con un ítem de aplicación `ROL_ACCESO`
(computation "PL/SQL Function Body", punto de ejecución *On New Session*
o *Before Header* de la página):

```sql
DECLARE
  l_rol VARCHAR2(50);
BEGIN
  IF APEX_UTIL.CURRENT_USER_IN_GROUP('RRHH_ADMIN') THEN
    l_rol := 'RRHH_ADMIN';
  ELSIF APEX_UTIL.CURRENT_USER_IN_GROUP('RRHH_OPERADOR') THEN
    l_rol := 'RRHH_OPERADOR';
  ELSE
    l_rol := 'RRHH_CONSULTA';
  END IF;
  RETURN l_rol;
END;
```

El valor (`RRHH_ADMIN`, `RRHH_OPERADOR`, `RRHH_CONSULTA`, o los nombres
que ya usen) **no** necesita ser literalmente `lector`/`editor`/
`configurador` — eso lo traduce `config/roles.json` del lado de la app,
igual que se documentó para la alternativa de Oracle. Ejemplo de mapeo:

```json
{
  "rolPorDefecto": "lector",
  "mapeo": {
    "RRHH_CONSULTA": "lector",
    "RRHH_OPERADOR": "editor",
    "RRHH_ADMIN": "configurador"
  }
}
```

### 2. La región del iframe (página 23, región "New")

Cambio sobre lo que ya existe en `research/p00023.yaml`
(`regions[0].attributes.settings.url`) — agregar el query string con el
ítem:

```yaml
attributes:
  settings:
    url: 'http://#DIRECCION_IP#:4173/?rol=#ROL_ACCESO#'
    inclusion-mode: IFrame
    iframe-attributes: width="100%" height="800px"
```

(Este archivo YAML en `research/` es solo un export de referencia — el
cambio real se hace en Application Builder, sobre la región de la página
23; no alcanza con editar el archivo del repositorio.)

## Qué hace la app (ya implementado)

- `frontend/src/utils/rol-apex.js`: lee `?rol=` de
  `window.location.search` una vez al cargar, expone `fetchConRol` (mismo
  perfil que `fetch`, agrega el header `X-Apex-Rol` si hay un rol
  capturado).
- Los 7 clientes de `/api` (`frontend/src/api/*-client.js`) usan
  `fetchConRol` como su `fetchImpl` por defecto — ninguno necesitó saber
  nada de APEX, solo cambió de dónde sale el `fetch` que ya usaban.
- Sin `?rol=` en la URL (por ejemplo, en desarrollo local fuera del
  iframe), el comportamiento es idéntico a antes: sin header, el backend
  cae a `rolPorDefecto` (Lector).

## Cómo probarlo

Simulando la URL que arma APEX, en un navegador (no hace falta el iframe
real todavía):

```text
http://<ip-del-servidor>:4173/?rol=RRHH_ADMIN
```

La app carga, y el badge de rol en `AppShell` (esquina del menú lateral)
debería mostrar "Rol: Configurador" si `RRHH_ADMIN` está mapeado a
`configurador` en `config/roles.json`. Para confirmar que el header
efectivamente viaja en las llamadas a la API, `GET /api/acl/mi-rol` desde
las herramientas de desarrollador (pestaña Network) debe mostrar el
header `X-Apex-Rol: RRHH_ADMIN` en la request.
