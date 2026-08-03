# Feature Specification: Control de Acceso por Roles (Lector / Editor / Configurador)

**Feature Branch**: `016-control-acceso-roles`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "ACL : agregar control de acceso, roles Lector, Editor y Configurador. vincular con roles provistos por apex"

## Clarifications

### Session 2026-07-28

- Q: ¿Cómo va a proveer APEX la identidad/rol del usuario a esta app? → A: Aún no
  está definido. Se implementa el control de acceso detrás de un adaptador de
  identidad reemplazable, con una interfaz estable, para poder enchufar más
  adelante el mecanismo real de APEX (header de proxy, token, consulta a
  Oracle, u otro) sin rediseñar la lógica de autorización ni la interfaz.
- Q: ¿Qué hace la app si no puede determinar el rol de un usuario (rol no
  mapeado, o la fuente de roles no está disponible)? → A: Lo trata como Lector
  (acceso de solo lectura) por defecto; el usuario no se queda sin poder usar
  la aplicación, solo sin poder modificar datos.
- Q: ¿Cómo se relacionan los roles/grupos que en el futuro exponga APEX con
  los 3 roles internos? → A: Mapeo fijo en configuración simple (no editable
  desde la UI en esta feature), igual que otros parámetros de conexión que
  hoy se ajustan por archivo de configuración.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver todo, sin poder modificar nada, como Lector (Priority: P1)

Como usuario con rol Lector, quiero poder entrar a todas las secciones de la
aplicación (Calendario, Fichadas de hoy, Resumen período, Vacaciones) y ver su
contenido, pero sin poder ejecutar ninguna acción que modifique datos, para
poder consultar información de presentismo sin riesgo de alterarla por error.

**Why this priority**: es el nivel de acceso más restrictivo y el que debe
funcionar primero, porque además sirve como comportamiento de respaldo
seguro para cualquier usuario cuyo rol no se pueda determinar (ver
Clarifications). Sin este nivel funcionando, ningún otro rol es seguro.

**Independent Test**: se puede probar entrando a la aplicación con un usuario
mapeado a Lector, navegando por las cuatro secciones operativas, y
verificando que ninguna acción de escritura (corrección, pausa, retiro
anticipado, justificar/quitar justificación, asignar/revertir vacaciones,
generar/cerrar/reabrir/reclasificar un período) está disponible ni se puede
completar, incluso si se la invoca directamente contra la API.

**Acceptance Scenarios**:

1. **Given** un usuario con rol Lector, **When** navega a cualquiera de las
   cuatro secciones operativas, **Then** ve la información igual que
   cualquier otro rol, pero los controles de escritura (botones de corregir,
   justificar, asignar vacaciones, cerrar período, etc.) aparecen ocultos o
   deshabilitados.
2. **Given** un usuario con rol Lector, **When** invoca directamente una
   operación de escritura de la API (por ejemplo, asignar vacaciones) sin
   pasar por la interfaz, **Then** el sistema la rechaza y no se modifica
   ningún dato.
3. **Given** un usuario con rol Lector, **When** intenta entrar a la sección
   de Configuración, **Then** el sistema no le muestra esa sección.

---

### User Story 2 - Operar el día a día como Editor (Priority: P2)

Como usuario con rol Editor, quiero poder hacer todo lo que puede hacer un
Lector y además ejecutar las operaciones diarias sobre fichadas, ausencias y
vacaciones (corregir marcas, registrar pausas y retiros anticipados,
justificar o quitar la justificación de una ausencia, asignar o revertir
vacaciones, y generar/cerrar/reabrir/reclasificar un período), para poder
mantener al día el presentismo del personal sin necesitar acceso a la
configuración técnica del sistema.

**Why this priority**: es el rol con el que trabaja quien opera el sistema
día a día; sin él, la aplicación sirve solo para consultar, no para
mantener actualizada la información de presentismo.

**Independent Test**: se puede probar entrando con un usuario mapeado a
Editor y completando de punta a punta cada una de las operaciones de
escritura listadas arriba, verificando que se completan con éxito, mientras
que la sección de Configuración permanece fuera de su alcance igual que
para un Lector.

**Acceptance Scenarios**:

1. **Given** un usuario con rol Editor, **When** ejecuta cualquiera de las
   operaciones de escritura de Calendario, Fichadas de hoy o Vacaciones,
   **Then** la operación se completa igual que se completaba antes de esta
   feature (sin control de acceso).
2. **Given** un usuario con rol Editor, **When** intenta entrar a la sección
   de Configuración o invoca directamente una operación de su API, **Then**
   el sistema no le muestra la sección y rechaza la operación.

---

### User Story 3 - Administrar la configuración técnica como Configurador (Priority: P3)

Como usuario con rol Configurador, quiero poder hacer todo lo que puede
hacer un Editor y además ver y modificar la página de Configuración (IP y
puerto del reloj, motivos de ausencia, categorías y modalidades, esquema
semanal), para ser el único perfil habilitado a cambiar parámetros que
afectan a todo el sistema.

**Why this priority**: es el nivel de menor prioridad de implementar primero
porque la página de Configuración ya existe y solo necesita quedar detrás
del control de acceso; el valor de esta historia depende de que las otras
dos ya funcionen.

**Independent Test**: se puede probar entrando con un usuario mapeado a
Configurador, confirmando que puede completar toda operación de Editor, y
además entrar a Configuración y guardar un cambio (por ejemplo, la IP del
reloj) con éxito.

**Acceptance Scenarios**:

1. **Given** un usuario con rol Configurador, **When** entra a la sección de
   Configuración y modifica cualquiera de sus parámetros, **Then** el
   cambio se guarda igual que se guardaba antes de esta feature.
2. **Given** un usuario con rol Configurador, **When** usa cualquier
   operación de Editor o Lector, **Then** funciona sin restricciones
   adicionales.

---

### Edge Cases

- ¿Qué pasa cuando el rol de un usuario no se puede determinar (identidad sin
  mapeo conocido, o la fuente de roles no responde)? El sistema lo trata como
  Lector: conserva acceso de lectura a todas las secciones, sin bloquear la
  aplicación (ver Clarifications).
- ¿Qué pasa si el mapeo de configuración asocia un mismo rol de origen a más
  de un rol interno, o queda mal formado? El sistema debe arrancar igual,
  registrar la anomalía, y tratar como Lector a cualquier identidad afectada
  por una entrada ambigua o inválida del mapeo, en vez de fallar por
  completo.
- ¿Qué pasa si un usuario con un rol insuficiente fuerza una operación
  directamente contra la API (sin pasar por la interfaz)? Debe ser rechazada
  igual que si lo hubiera intentado desde la interfaz — el control del lado
  del servidor es la fuente de verdad, no el ocultamiento de botones.
- ¿Qué pasa con una sesión de navegador ya abierta cuando el rol de esa
  identidad cambia en el mapeo? La próxima operación que intente se evalúa
  con el rol vigente en ese momento; no se exige diseñar un mecanismo de
  notificación en vivo para esta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE reconocer exactamente tres roles: Lector,
  Editor y Configurador, con permisos crecientes y acumulativos (Configurador
  incluye todo lo de Editor, que a su vez incluye todo lo de Lector).
- **FR-002**: El sistema DEBE resolver el rol del usuario actual a través de
  un adaptador de identidad con una interfaz estable y reemplazable, de
  forma que el mecanismo real de integración con APEX (aún no definido) se
  pueda conectar más adelante sin cambiar la lógica de autorización ni la
  interfaz de usuario.
- **FR-003**: El sistema DEBE asociar cada rol/grupo de origen (provisto en
  el futuro por APEX) a uno de los tres roles internos mediante un mapeo
  fijo definido en configuración, editable únicamente modificando esa
  configuración (no desde la interfaz, en esta feature).
- **FR-004**: Cuando el rol de un usuario no se pueda determinar (sin mapeo
  conocido, o la fuente de roles no disponible), el sistema DEBE tratarlo
  como Lector.
- **FR-005**: Un usuario con rol Lector DEBE poder ver el contenido de
  Calendario, Fichadas de hoy, Resumen período y Vacaciones, sin poder
  completar ninguna operación de escritura de esas secciones (corregir una
  marca, registrar pausa o retiro anticipado, consultar el reloj on-demand,
  justificar o quitar justificación de una ausencia, asignar o revertir
  vacaciones, generar/cerrar/reabrir/reclasificar un período).
- **FR-006**: Un usuario con rol Editor DEBE poder completar todas las
  operaciones de escritura listadas en FR-005, además de todo lo permitido a
  Lector.
- **FR-007**: Ni Lector ni Editor DEBEN poder ver ni modificar la sección de
  Configuración (conexión al reloj, motivos de ausencia, categorías y
  modalidades, esquema semanal).
- **FR-008**: Un usuario con rol Configurador DEBE poder ver y modificar la
  sección de Configuración, además de todo lo permitido a Editor.
- **FR-009**: El sistema DEBE aplicar el control de permisos también del
  lado del servidor (API): toda operación de escritura o de lectura de
  Configuración DEBE rechazarse ahí si el rol del usuario no la autoriza, sin
  depender únicamente de que la interfaz oculte los controles.
- **FR-010**: El rechazo de una operación por falta de permiso DEBE devolver
  un resultado distinguible de otros tipos de error (por ejemplo, de
  validación de datos), para que la interfaz pueda informar al usuario que
  se trata de una restricción de acceso.
- **FR-011**: La interfaz DEBE ocultar o deshabilitar, según corresponda, los
  controles y secciones que el rol del usuario actual no puede usar.
- **FR-012**: El sistema DEBE mostrarle al usuario, en algún lugar visible de
  la interfaz, cuál es su rol actual.

### Key Entities *(include if feature involves data)*

- **Rol**: uno de Lector, Editor o Configurador; define qué secciones puede
  ver y qué operaciones de escritura puede completar un usuario.
- **Identidad de usuario**: quien usa la aplicación en un momento dado, según
  lo resuelva el adaptador de identidad (mecanismo de origen aún no
  definido); es el dato de entrada para determinar el rol.
- **Mapeo de roles**: asociación fija, definida en configuración, entre cada
  rol/grupo de origen que en el futuro provea APEX y uno de los tres roles
  internos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario con rol Lector no logra completar ninguna operación
  de escritura del sistema (verificado tanto desde la interfaz como
  invocando la API directamente) en el 100% de los casos probados.
- **SC-002**: Un usuario con rol Editor completa el ciclo diario completo de
  operaciones (corrección, pausa, retiro anticipado, justificación,
  asignación/reversión de vacaciones, cierre/reapertura de período) sin
  necesitar el rol Configurador en ningún paso.
- **SC-003**: El acceso a la página de Configuración y a sus operaciones
  queda restringido al 100% a usuarios con rol Configurador, tanto en lo que
  se ve en la interfaz como en lo que acepta la API.
- **SC-004**: Cuando el rol de un usuario no se puede determinar, el usuario
  conserva acceso de lectura a todas las secciones sin interrupción del
  servicio ni mensajes de error que le impidan seguir navegando.
- **SC-005**: Cambiar qué rol interno corresponde a un rol/grupo de origen no
  requiere modificar código de la aplicación, solo su configuración.

## Assumptions

- El mecanismo real por el cual APEX identifica a un usuario y expone sus
  roles/grupos (header inyectado por proxy, token de sesión, consulta a una
  fuente de datos, u otro) todavía no está definido y queda fuera del
  alcance de esta feature; esta feature entrega el control de acceso por
  rol y un punto de integración reemplazable, no la integración real con
  APEX.
- Mientras el mecanismo real no esté definido, el adaptador de identidad
  puede apoyarse en una fuente de configuración simple (equivalente a otros
  parámetros hoy definidos por archivo/entorno) para poder construir,
  probar y demostrar el control de acceso de punta a punta.
- Los tres roles son jerárquicos y acumulativos (Configurador ⊇ Editor ⊇
  Lector); no se contempla en esta feature la posibilidad de permisos no
  jerárquicos (por ejemplo, un rol con acceso a Configuración pero sin
  acceso a Vacaciones).
- El campo "autor" que ya existe hoy en algunas operaciones (por ejemplo,
  asignar/revertir vacaciones) sigue siendo un campo de texto libre e
  independiente del rol; vincularlo automáticamente a la identidad
  autenticada, o construir un registro de auditoría más amplio de qué
  usuario hizo cada cambio, queda fuera de alcance de esta feature (ver
  nota relacionada en la feature 014, que dejó la auditoría pendiente de
  "una eventual autenticación de usuarios" — esta feature resuelve el
  control de acceso, no la auditoría).
- No se requiere una pantalla de inicio de sesión propia de esta
  aplicación: la identidad del usuario la resuelve el adaptador de
  identidad (FR-002), no un formulario de usuario/contraseña local.
