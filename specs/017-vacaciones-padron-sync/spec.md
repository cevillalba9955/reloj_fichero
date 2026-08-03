# Feature Specification: Fecha de Ingreso en Vacaciones y Sincronización del Padrón con Oracle

**Feature Branch**: `fix/vacaciones`

**Created**: 2026-08-03

**Status**: Implemented (en rama `fix/vacaciones`, pendiente de mergear a `main`)

**Input**: User description: "agregar columna fecha_ingreso a la pagina Vacaciones. la columna
proximo_incremento que solo diga la cantidad de dias a asignar, la fecha de proximo incremento
colocarla en un item fuera de la grilla ya que es comun a todos los empleados" + "revisar
generar_calendario en la pagina CALENDARIO. al json del padron le falta traer la fecha de
ingreso" + "corré sincronizar-padron y actualizá el .env.example, ademas hacer que se sincronice
el padron al iniciar un nuevo periodo y agregar un boton para forzar el sincronizamo
manualmente"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver fecha de ingreso y días de próximo incremento en Vacaciones (Priority: P1)

Como responsable de administración de personal, quiero ver la fecha de ingreso de cada legajo
en la grilla de la página Vacaciones, y que la columna de próximo incremento me diga solo
cuántos días se van a acreditar (la fecha del próximo incremento, al ser la misma para todos
los legajos, la quiero ver una sola vez, no repetida en cada fila).

**Why this priority**: es el pedido concreto que motivó la feature; sin esto la página sigue
siendo usable (feature 015) pero le falta un dato clave para auditar antigüedad y le sobra
repetición de un dato que no varía por legajo.

**Independent Test**: se puede probar completo abriendo la página Vacaciones con un padrón que
tenga fecha de ingreso cargada y verificando que la grilla muestra la columna "Fecha ingreso"
por legajo, que "Próximo incremento" solo indica la cantidad de días, y que la fecha de próximo
incremento aparece una única vez fuera de la grilla.

**Acceptance Scenarios**:

1. **Given** un legajo activo con fecha de ingreso cargada en el padrón, **When** se abre la
   página Vacaciones, **Then** su fila muestra la fecha de ingreso en una columna dedicada.
2. **Given** varios legajos activos con distinta antigüedad, **When** se abre la página
   Vacaciones, **Then** la columna "Próximo incremento" de cada fila muestra solo la cantidad
   de días que le corresponden a ese legajo en el próximo ciclo, sin repetir la fecha.
3. **Given** la página Vacaciones con al menos un legajo con próximo incremento calculable,
   **When** se abre la página, **Then** la fecha del próximo incremento anual se muestra una
   única vez, fuera de la grilla, no en cada fila.
4. **Given** un legajo sin fecha de ingreso cargada, **When** se abre la página Vacaciones,
   **Then** ese legajo sigue señalado como pendiente (comportamiento ya existente de la feature
   015), sin fecha de ingreso ni próximo incremento, sin bloquear el resto de la grilla.

---

### User Story 2 - La fecha de ingreso llega realmente sincronizada al iniciar un período (Priority: P1)

Como responsable de administración de personal, quiero que al iniciar un período (mes) nuevo el
sistema traiga automáticamente el padrón real desde Oracle (incluyendo fecha de ingreso), para
no depender de acordarme de sincronizarlo a mano cada vez que empieza un mes.

**Why this priority**: es la causa raíz por la que la columna de la User Story 1 podía quedar
vacía en la práctica — "Generar calendario" nunca consultaba Oracle, solo copiaba lo que ya
hubiera en el snapshot local (que podía no tener fecha de ingreso, o estar desactualizado). Sin
esto, la User Story 1 muestra una columna que casi siempre está vacía.

**Independent Test**: se puede probar completo generando el calendario de un período que todavía
no tiene padrón propio, con Oracle disponible y configurado, y verificando que el padrón
resultante de ese período trae legajo, categoría, nombre y fecha de ingreso reales desde Oracle
en vez del snapshot local copiado.

**Acceptance Scenarios**:

1. **Given** el período EN CURSO sin padrón propio todavía, Oracle disponible y configurado,
   **When** se genera el calendario de ese período por primera vez, **Then** el padrón del
   período se sincroniza contra Oracle, trayendo fecha de ingreso real por legajo.
2. **Given** el período EN CURSO sin padrón propio todavía, Oracle no disponible o no
   configurado, **When** se genera el calendario de ese período, **Then** la generación no
   falla: el sistema cae al comportamiento existente (copiar el snapshot local ya cableado).
3. **Given** un período DISTINTO al mes en curso sin padrón propio (por ejemplo, completar un
   hueco atrasado), **When** se genera su calendario, **Then** el sistema no intenta
   sincronizarlo contra Oracle (que solo expone el padrón activo ahora) y usa el snapshot local,
   igual que antes de esta feature.
4. **Given** un período que ya tiene su propio padrón, **When** se vuelve a generar o consultar
   su calendario, **Then** el padrón existente no se sobrescribe.

---

### User Story 3 - Forzar la sincronización del padrón manualmente (Priority: P2)

Como Configurador del sistema, quiero un botón para forzar la sincronización del padrón contra
Oracle en cualquier momento, para poder corregirlo sin esperar a que empiece un período nuevo
(por ejemplo, si Oracle estuvo caído cuando se generó el período, o si recién se corrigió la
configuración de la columna de fecha de ingreso).

**Why this priority**: complementa la User Story 2 para el caso en que la sincronización
automática no pudo completarse; no es indispensable para el valor central (que ya lo cubre la
sincronización automática), pero evita depender de la línea de comandos para resolverlo.

**Independent Test**: se puede probar completo entrando a Configuración con rol Configurador,
tocando "Sincronizar padrón", y verificando que el padrón del período en curso se actualiza
contra Oracle y que la página muestra el resultado (cantidad de legajos) o el error.

**Acceptance Scenarios**:

1. **Given** un usuario con rol Configurador en la página Configuración, **When** toca
   "Sincronizar padrón", **Then** el sistema sincroniza el padrón del período en curso contra
   Oracle y muestra cuántos legajos se sincronizaron.
2. **Given** Oracle no configurado o no disponible, **When** un Configurador toca "Sincronizar
   padrón", **Then** el sistema muestra un error legible, sin dejar el padrón existente
   corrompido ni parcialmente sobrescrito.
3. **Given** un usuario con rol Lector o Editor (no Configurador), **When** intenta forzar la
   sincronización, **Then** el sistema rechaza la acción.

---

### Edge Cases

- **Oracle no devuelve ningún legajo activo** (vista vacía, filtro sin resultados): ni la
  sincronización automática al iniciar período ni la manual sobrescriben el snapshot existente
  con una lista vacía.
- **Columna de fecha de ingreso no configurada en Oracle**: el padrón se sincroniza igual
  (legajo, categoría, nombre), con fecha de ingreso `null` por legajo — mismo criterio que un
  legajo sin ese dato hoy (feature 015, FR-012), sin bloquear el resto.
- **Sincronización automática dispara justo cuando Oracle está caído**: la generación del
  calendario del período no debe fallar ni quedar a medio hacer; debe completarse con el
  fallback existente.
- **Doble disparo casi simultáneo** (por ejemplo, alguien genera el calendario del período en
  curso mientras otro fuerza la sincronización manual): ambos caminos escriben el mismo archivo
  del período en curso; el resultado final es el de la última escritura que se complete, sin
  corromper el archivo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La página Vacaciones DEBE mostrar, por legajo, su fecha de ingreso en una columna
  propia de la grilla.
- **FR-002**: La columna "Próximo incremento" de la grilla DEBE mostrar únicamente la cantidad
  de días que se acreditarán en el próximo incremento de ese legajo, sin la fecha.
- **FR-003**: La fecha del próximo incremento anual, al ser la misma para todos los legajos
  activos, DEBE mostrarse una única vez fuera de la grilla, no repetida por fila.
- **FR-004**: Al generar por primera vez el calendario del período EN CURSO (el que todavía no
  tiene un padrón propio), el sistema DEBE intentar sincronizar ese padrón contra Oracle
  (legajo, categoría, nombre y fecha de ingreso reales) antes de recurrir a cualquier otro
  origen.
- **FR-005**: Si la sincronización contra Oracle no está disponible (configuración incompleta o
  inválida, error de conexión) al iniciar el período en curso, el sistema DEBE caer al
  comportamiento existente (copiar el snapshot local ya cableado) sin bloquear ni fallar la
  generación del calendario.
- **FR-006**: Generar el calendario de un período que NO es el mes en curso (por ejemplo,
  completar un hueco atrasado) NO DEBE intentar sincronizar su padrón contra Oracle; DEBE seguir
  usando el snapshot local existente, igual que antes de esta feature.
- **FR-007**: El sistema DEBE ofrecer una acción para forzar manualmente la sincronización del
  padrón del período en curso contra Oracle, accesible solo a un rol Configurador.
- **FR-008**: La acción manual de sincronización DEBE informar el resultado (cantidad de
  legajos sincronizados) en caso de éxito, o un mensaje de error legible en caso de fallo, sin
  dejar al usuario sin respuesta.
- **FR-009**: Ninguna sincronización contra Oracle (automática o manual) DEBE sobrescribir el
  padrón existente de un período si Oracle no devuelve ningún legajo activo.
- **FR-010**: La configuración de despliegue (`.env.example`) DEBE documentar la variable de
  entorno que habilita traer la fecha de ingreso desde la vista de Oracle, siguiendo el mismo
  criterio de documentación que el resto de las columnas opcionales del padrón.

### Key Entities *(include if feature involves data)*

- **Snapshot del Padrón de un Período**: copia local (JSON) de legajo, categoría, nombre y
  fecha de ingreso de cada empleado activo, usada por el resto del sistema sin depender de
  Oracle en cada consulta (feature 003/013). Esta feature agrega un segundo origen posible para
  producirlo (sincronización directa contra Oracle) además del ya existente (copia del snapshot
  local del mes en curso).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable puede ver la fecha de ingreso y la antigüedad de cualquier legajo
  activo en la página Vacaciones sin pasos adicionales ni consultar otra pantalla.
- **SC-002**: Con Oracle disponible y configurado, el 100% de los legajos activos del período en
  curso quedan con su fecha de ingreso real (no vacía) al generar el calendario de ese período
  por primera vez, sin intervención manual.
- **SC-003**: Un Configurador puede forzar una sincronización del padrón y ver su resultado (éxito
  o error) sin salir de la página Configuración ni usar la línea de comandos.
- **SC-004**: Si Oracle no está disponible en el momento de iniciar un período nuevo, la
  generación de su calendario se completa igual, sin error visible para quien la solicitó.

## Assumptions

- "Iniciar un período nuevo" se interpreta como la primera vez que se genera el calendario del
  mes EN CURSO (el que todavía no tiene padrón propio); Oracle solo expone el padrón activo
  "ahora", así que sincronizar un período distinto al actual (pasado o futuro) no tendría un
  padrón históricamente correcto para traer, y se deja fuera de alcance.
- El acceso de solo lectura a Oracle y su configuración (`RRHH_ORACLE_*`) ya existían (feature
  003); esta feature no agrega un mecanismo de conexión nuevo, solo dos puntos de disparo
  adicionales (automático al iniciar período, manual por botón) sobre el mismo repositorio de
  solo lectura.
- El rol mínimo para forzar la sincronización manual es Configurador (feature 016), mismo nivel
  que el resto de las acciones de infraestructura ya agrupadas en la página Configuración
  (reloj, motivos de ausencia, categorías).
- La sincronización (automática o manual) siempre escribe el padrón del período EN CURSO, nunca
  el de un período pasado o futuro, siguiendo el mismo criterio que ya tenía el comando
  `sincronizar-padron` existente (feature 003).
