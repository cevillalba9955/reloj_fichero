# Instructivo: vista de solo lectura para roles de acceso (Oracle/APEX)

**Feature**: 016-control-acceso-roles | **Fecha**: 2026-07-28

> **Alternativa NO adoptada (actualización 2026-07-28).** Al confirmar que
> la app se embebe como iframe dentro de una página de APEX
> (`research/p00023.yaml`), se optó por un mecanismo más simple: APEX ya
> conoce el rol de la persona y se lo pasa directo a la app por la URL del
> iframe, sin que la app tenga que consultar Oracle. Ver
> [apex-iframe-embed.md](./apex-iframe-embed.md), que es el mecanismo
> vigente. Este documento queda como referencia por si en el futuro
> conviene que la app resuelva el rol por su cuenta (por ejemplo, si deja
> de estar embebida en un iframe).

**Para quién es este documento**: quien administra la base Oracle/APEX
(DBA o responsable de RRHH/APEX). Describe qué preparar del lado de la
base para que esta aplicación pueda resolver el rol (Lector / Editor /
Configurador) de cada persona que la usa. **No** es una migración ni un
cambio en la app — es el pedido de un dato de solo lectura, mismo espíritu
que ya se usa para el padrón de empleados activos (feature 003:
`RRHH_ORACLE_VISTA_PADRON`).

## Decisión de diseño (2026-07-28)

La identidad de cada usuario, de cara a esta vista, es **el usuario/login
de APEX** (no el legajo): una misma persona puede operar esta app sin
tener necesariamente un legajo de RRHH (por ejemplo, un perfil
administrativo). La vista se consulta por ese usuario, no por legajo.

## Qué necesitamos: una vista (o consulta) de solo lectura

Forma mínima esperada — dos columnas, una fila por usuario con acceso
asignado:

| Columna (nombre sugerido) | Contenido |
|---|---|
| `USUARIO_APEX` | El mismo identificador de usuario/login que ya usa APEX para autenticar a esa persona. |
| `ROL_ACCESO` | Un valor de texto que identifique el rol/grupo de esa persona en esta aplicación. |

Los nombres de columna y de la vista son **sugeridos, no obligatorios** —
esta app no impone el diseño interno de la base (igual que con el padrón:
"RRHH/DBA provee una vista de solo lectura que ya devuelve los legajos
activos; este servicio no conoce ni mantiene el criterio de armado").
Cuando esté lista, solo hace falta decirnos el nombre real de la vista y
de las dos columnas — son configurables por variable de entorno, sin
tocar código.

**Reglas sobre `ROL_ACCESO`**:

- Es un valor de texto libre, el que ya uses para nombrar roles/grupos en
  APEX (por ejemplo, si ya tenés grupos como `RRHH_ADMIN`,
  `RRHH_OPERADOR`, `RRHH_CONSULTA`, se puede usar el mismo nombre tal
  cual). Esta app **no** necesita que el valor sea literalmente
  `lector`/`editor`/`configurador` — eso lo traduce un archivo de mapeo
  propio de la app (`config/roles.json`), así que el nombre real que uses
  en Oracle puede ser el que ya tengas.
- Si una persona tiene más de un grupo/rol asignado en APEX, la vista
  debe entregar **una sola fila por usuario** con el rol vigente para
  esta aplicación (si conviven varios roles de APEX no relacionados con
  esta app, quien arma la vista decide cuál mapear, o arma un valor
  combinado — a definir según cómo estén organizados los grupos hoy).
- Si un usuario no aparece en la vista (todavía no se le asignó nada, o no
  corresponde que use la app), esta aplicación ya sabe manejarlo: lo trata
  como **Lector** por defecto, sin error ni interrupción del servicio
  (comportamiento ya implementado, FR-004 de la feature). No hace falta
  que la vista incluya "todo el mundo" — solo a quien tenga un rol
  explícito distinto de Lector.

## Acceso necesario

- **Usuario Oracle de SOLO LECTURA**, mínimo privilegio: `SELECT` sobre
  esa única vista, nada más (mismo criterio que el usuario `padron_ro` ya
  usado para el padrón — Constitución, Principio II). Puede ser el mismo
  usuario de lectura que ya existe si tiene grants sobre ambas vistas, o
  uno nuevo si preferís mantenerlos separados — cualquiera de las dos
  opciones nos sirve.
- Sin necesidad de una consulta de alta frecuencia: se lee, como mucho, en
  cada request a la app (una consulta liviana, sin joins pesados
  esperados dado el tamaño de la tabla — una fila por persona con acceso).

## Qué NO es parte de este pedido

- No pedimos que Oracle/APEX nos autentique directamente ni que valide
  contraseñas — esta app sigue sin login propio.
- No pedimos escritura: esta app nunca va a insertar/actualizar nada en
  esa vista ni en las tablas de origen.
- No define todavía **cómo** la app se entera de qué usuario de APEX está
  del otro lado de cada request — ver "Lo que falta del lado de la
  aplicación" abajo. Esta vista sola no resuelve identidad, solo traduce
  "usuario ya identificado" → "rol".

## Lo que falta del lado de la aplicación (no es parte de este pedido a la DB)

Para que esto quede realmente conectado, además de la vista hace falta
que **algo** (típicamente un proxy o la propia integración de APEX
delante de esta app) le diga a la app, en cada request, qué usuario de
APEX está operando — hoy la app no tiene ese dato. **Mecanismo adoptado
(2026-07-28)**: un header HTTP, mismo patrón "punto de enchufe
reemplazable" que ya usa la resolución de rol actual
(`src/web/acl/autorizacion.js`, research.md §1) — es la Opción 1 evaluada
en el research de la feature, ahora confirmada:

1. Un header HTTP (`X-Apex-Usuario`, nombre configurable) inyectado por
   quien autentique al usuario — típicamente el reverse proxy/gateway que
   ya se pone delante de la app en producción, o la propia integración de
   APEX si corre server-side — con su login de APEX. Reemplaza al header
   actual `X-Apex-Rol` (hoy un placeholder que trae el rol directo; con la
   vista de Oracle, en cambio, la app resuelve el rol ELLA MISMA a partir
   del usuario).
2. Un adaptador nuevo (`src/db/oracle-roles-provider.js` o similar),
   mismo patrón que `src/roster/oracle-active-employees-provider.js`:
   conexión efímera, una sola consulta `SELECT ROL_ACCESO FROM
   <vista> WHERE USUARIO_APEX = :usuario`, solo lectura, sin exponer
   credenciales en logs ni errores (mismo contrato que
   `oracle-roster-repository-contract.md` de la feature 003).
3. Nuevas variables de entorno (propuesta, mismo estilo que
   `RRHH_ORACLE_*`): `RRHH_ORACLE_VISTA_ROLES`,
   `RRHH_ORACLE_COLUMNA_USUARIO`, `RRHH_ORACLE_COLUMNA_ROL` — reutilizando
   la misma conexión (`RRHH_ORACLE_USER`/`PASSWORD`/`CONNECT_STRING`) si
   el usuario de solo lectura tiene grants sobre ambas vistas.
4. `resolverRolActual` (`src/web/acl/autorizacion.js`) pasa de leer el rol
   directo del header a: leer el usuario del header → consultar el nuevo
   provider Oracle → traducir el resultado con `config/roles.json` (el
   mapeo fijo que ya existe hoy sigue cumpliendo el mismo rol: traducir
   "lo que dice la fuente externa" a Lector/Editor/Configurador).

Esto es trabajo de código nuevo (no forma parte de esta feature, que
dejó el mecanismo real de APEX explícitamente fuera de alcance) — un buen
candidato para una feature/tarea de seguimiento una vez que la vista
exista y confirmemos el nombre real de columnas/vista.

## Ejemplo de uso end-to-end

Con la vista ya creada (acá, `RRHH.V_ROLES_ACCESO`) y una fila de ejemplo:

| `USUARIO_APEX` | `ROL_ACCESO` |
|---|---|
| `jperez` | `RRHH_ADMIN` |

Y un `config/roles.json` que ya traduce ese valor de origen:

```json
{
  "rolPorDefecto": "lector",
  "mapeo": { "RRHH_ADMIN": "configurador", "RRHH_OPERADOR": "editor" }
}
```

### 1. Quien pone el header delante de la app (ejemplo con nginx)

Ilustrativo — el mecanismo real depende de cómo autentique APEX/el
gateway; la única condición es que el header solo lo pueda setear ese
proxy de confianza, nunca el cliente final directamente (si la app queda
expuesta sin ese proxy delante, cualquiera podría mandar el header a
mano y hacerse pasar por otro usuario):

```nginx
location /presentismo/ {
    # ... autenticación real de APEX resuelta acá arriba ...
    proxy_set_header X-Apex-Usuario $apex_authenticated_user;
    proxy_pass http://127.0.0.1:4173/;
}
```

### 2. La request que le llega a esta app

```http
GET /api/acl/mi-rol HTTP/1.1
Host: 127.0.0.1:4173
X-Apex-Usuario: jperez
```

### 3. Lo que hace la app internamente

1. `resolverRolActual` lee `X-Apex-Usuario: jperez` del request.
2. Consulta la vista: `SELECT ROL_ACCESO FROM RRHH.V_ROLES_ACCESO WHERE
   USUARIO_APEX = 'jperez'` → obtiene `RRHH_ADMIN`.
3. Traduce ese valor con `config/roles.json` → `configurador`.
4. Responde con el rol ya resuelto.

### 4. Respuesta

```json
{ "rol": "configurador" }
```

A partir de ahí, el resto de la app funciona exactamente igual que hoy
(`exigirRol`, ocultamiento de controles en la UI, etc.) — nada de eso
cambia; solo cambia **de dónde** sale el rol.

### 5. Para probarlo a mano mientras se define el proxy real

Mientras no exista todavía el proxy que inyecta el header en producción,
se puede simular igual que hoy con `curl` (mismo patrón que
`quickstart.md`), una vez que el adaptador Oracle esté implementado:

```bash
curl http://localhost:4173/api/acl/mi-rol -H "X-Apex-Usuario: jperez"
```

## Checklist para pedirle a RRHH/DBA

- [ ] Confirmar si ya existe algún catálogo de roles/grupos de APEX
      reutilizable para esta app, o si hay que definir valores nuevos.
- [ ] Crear la vista de solo lectura (nombre a elección de quien la
      arma) con las dos columnas: usuario APEX + rol.
- [ ] Confirmar una sola fila por usuario (o el criterio de desempate si
      hay más de un rol posible).
- [ ] Otorgar `SELECT` sobre esa vista a un usuario Oracle de solo
      lectura (existente o nuevo).
- [ ] Compartir con el equipo de la app: nombre de la vista, nombre de
      las dos columnas, y las credenciales/connect string del usuario de
      lectura (por un canal seguro, nunca por el mismo medio que este
      documento).
