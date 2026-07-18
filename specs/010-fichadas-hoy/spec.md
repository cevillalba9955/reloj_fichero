# Feature Specification: Página "Fichadas de Hoy"

**Feature Branch**: `010-fichadas-hoy`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "iu pagina fichadas-hoy , muestra lista de legajo, nombre, fecha entrada, fecha salida, horas trabajadas, situacion(ESPERANDO,PRESENTE,TARDE,AUSENTE...) permite correccion manual por administrador de los horarios (con justificacion), agregado de pausa o retiro anticipado, opcion para consultar nuevas fichadas al reloj."

## Clarifications

### Session 2026-07-18

- Q: Al navegar a un día previo, ¿el administrador puede corregir fichadas,
  agregar pausas o registrar retiro anticipado sobre ese día, o esos días
  solo se pueden visualizar (sin edición)? → A: Edición permitida en el día
  actual y en días previos (dentro del período de liquidación abierto); no se
  puede navegar a días futuros.
- Q: ¿Hasta cuántos días hacia atrás se puede navegar desde la pantalla
  "Fichadas de Hoy"? → A: El límite lo define el período de liquidación
  abierto (calendario de feature 004); no se puede navegar a períodos ya
  cerrados.
- Q: Cuando un empleado tiene más de una pausa registrada en el día, ¿cómo se
  muestran las columnas de fichadas intermedias en la tabla? → A: Un único
  par de columnas "Inicio pausa" / "Fin pausa" con la pausa principal del
  día; si hay más de una pausa, se resume/accede al detalle desde la fila.
- Q: ¿El requisito de "modales" aplica solo a la corrección de entrada/salida
  (Historia 2), o también a los formularios de pausa intermedia y retiro
  anticipado (Historia 3)? → A: Todos los formularios de edición (corrección
  de horario, pausa intermedia, retiro anticipado) se abren como diálogo
  modal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el estado de asistencia del día (Priority: P1)

Un administrador abre la página "Fichadas de Hoy" y ve, para cada empleado
esperado ese día, su legajo, nombre, hora de entrada, hora de salida, horas
trabajadas hasta el momento y su situación actual (por ejemplo `ESPERANDO`,
`PRESENTE`, `TARDE`, `AUSENTE`), sin tener que consultar cada legajo por
separado.

**Why this priority**: Es el valor central de la funcionalidad: da visibilidad
inmediata del presentismo del día. Sin esto no hay producto; el resto de las
historias son acciones que se disparan a partir de esta vista.

**Independent Test**: Con un conjunto de fichadas ya cargadas para el día en
curso, se puede abrir la página y verificar que la lista muestra los datos
correctos por empleado sin necesitar ninguna otra funcionalidad.

**Acceptance Scenarios**:

1. **Given** un empleado fichó su entrada dentro del margen de tolerancia y
   aún no fichó salida, **When** el administrador abre la página, **Then** la
   fila del empleado muestra la hora de entrada, sin hora de salida, horas
   trabajadas parciales hasta el momento, y situación `PRESENTE`.
2. **Given** un empleado todavía no fichó entrada y la ventana de entrada
   del día sigue abierta, **When** el administrador abre la página, **Then**
   la fila muestra situación `ESPERANDO`, sin horas de entrada/salida ni
   horas trabajadas.
3. **Given** un empleado fichó su entrada fuera del margen de tolerancia
   configurado, **When** el administrador abre la página, **Then** la fila
   muestra situación `TARDE`.
4. **Given** un empleado no fichó entrada y ya venció la ventana de entrada
   del día, **When** el administrador abre la página, **Then** la fila
   muestra situación `AUSENTE`.
5. **Given** un empleado ya fichó entrada y salida dentro de los márgenes
   esperados, **When** el administrador abre la página, **Then** la fila
   muestra ambas horas, las horas trabajadas del día y una situación que
   indica jornada completa (distinta de `PRESENTE`).

---

### User Story 2 - Corregir manualmente un horario con justificación (Priority: P2)

Un administrador detecta que la hora de entrada o salida de un empleado está
mal (por una fichada perdida, un error del reloj, o una excepción autorizada)
y la corrige manualmente desde la página, dejando constancia del motivo.

**Why this priority**: Las fichadas del reloj no siempre reflejan la realidad
(errores de hardware, olvidos, excepciones autorizadas); sin corrección
manual auditable, el dato de presentismo pierde confiabilidad para nómina.

**Independent Test**: Sobre la lista ya visible (Historia 1), se puede
seleccionar un empleado, editar su hora de entrada o salida, ingresar un
motivo y guardar; el cambio se refleja en la fila y queda registrado quién,
cuándo y por qué lo hizo.

**Acceptance Scenarios**:

1. **Given** la fila de un empleado con una hora de entrada incorrecta,
   **When** el administrador edita esa hora, escribe una justificación y
   confirma, **Then** la fila pasa a mostrar la nueva hora, las horas
   trabajadas y la situación se recalculan en consecuencia, y la corrección
   queda registrada con autor, fecha/hora de la corrección, valor anterior,
   valor nuevo y motivo.
2. **Given** un administrador intenta guardar una corrección sin completar el
   motivo, **When** confirma el formulario, **Then** el sistema rechaza el
   guardado y exige la justificación antes de continuar.
3. **Given** una corrección manual ya aplicada sobre la entrada de un
   empleado, **When** el sistema recibe posteriormente una fichada real del
   reloj para ese mismo campo, **Then** la corrección manual no se
   sobrescribe automáticamente (se preserva como fuente de verdad hasta que
   un administrador decida explícitamente lo contrario).

---

### User Story 3 - Registrar pausa intermedia o retiro anticipado (Priority: P3)

Un administrador agrega, para un empleado del día, una pausa intermedia
(por ejemplo un corte de mediodía no fichado) o marca que se retiró antes del
horario oficial, en ambos casos dejando un motivo.

**Why this priority**: Son ajustes frecuentes pero secundarios respecto de
ver el estado del día (Historia 1) y corregir horarios base (Historia 2); sin
embargo son necesarios para que las horas trabajadas reflejen la jornada real.

**Independent Test**: Sobre la fila de un empleado con entrada y salida ya
determinadas, se puede agregar un intervalo de pausa con motivo y verificar
que las horas trabajadas del día se recalculan descontando la porción de la
pausa que cae dentro de la jornada efectiva; por separado, se puede marcar un
retiro anticipado con motivo y verificar que la situación del empleado lo
refleja.

**Acceptance Scenarios**:

1. **Given** un empleado con entrada y salida ya registradas, **When** el
   administrador agrega una pausa intermedia con horario `[desde, hasta]` y
   motivo, **Then** las horas trabajadas del día se recalculan descontando la
   porción de la pausa dentro de la jornada efectiva, sin bajar de cero.
2. **Given** un empleado que se retira antes de la hora oficial de salida,
   **When** el administrador registra un retiro anticipado con motivo,
   **Then** la fila del empleado refleja una situación distinta a jornada
   completa normal, indicando que hubo salida anticipada justificada.
3. **Given** un intento de agregar pausa o retiro anticipado sin motivo,
   **When** el administrador confirma el formulario, **Then** el sistema
   rechaza el guardado y exige la justificación.

---

### User Story 4 - Consultar nuevas fichadas al reloj (Priority: P4)

Un administrador, ante la sospecha de que hay fichadas recientes aún no
reflejadas en la página, dispara manualmente una consulta al reloj biométrico
para traer las fichadas nuevas sin esperar a la próxima sincronización
programada.

**Why this priority**: Es un complemento operativo sobre la sincronización ya
existente (feature 002); mejora la vista en el momento pero no es
indispensable para el valor central de ver y corregir el estado del día.

**Independent Test**: Con el servicio de sincronización programada ya
funcionando en background, se puede disparar la consulta manual desde la
página y verificar que, si había fichadas nuevas en el reloj, la lista se
actualiza con ellas sin necesidad de esperar el próximo ciclo programado.

**Acceptance Scenarios**:

1. **Given** el reloj tiene fichadas nuevas no sincronizadas todavía,
   **When** el administrador dispara la consulta manual, **Then** la lista se
   actualiza mostrando esas fichadas nuevas (horas de entrada/salida y
   situación recalculadas) sin recargar toda la página.
2. **Given** el reloj no responde o la consulta falla, **When** el
   administrador dispara la consulta manual, **Then** el sistema muestra un
   error claro y la lista existente permanece visible sin corromperse.
3. **Given** una consulta manual en curso, **When** el administrador la
   dispara nuevamente antes de que termine la anterior, **Then** el sistema
   evita lanzar consultas duplicadas en paralelo.

---

### User Story 5 - Navegar a días previos dentro del período abierto (Priority: P3)

Un administrador, parado en la pantalla "Fichadas de Hoy", navega hacia un
día anterior dentro del período de liquidación abierto para revisar o
corregir el presentismo de esa fecha, con las mismas acciones disponibles
que para el día actual (salvo la consulta manual al reloj).

**Why this priority**: Las correcciones y pausas suelen detectarse uno o más
días después de ocurridas (por ejemplo, al revisar antes de un cierre de
período); sin esta navegación, el administrador no tiene forma de corregir
nada fuera del día en curso.

**Independent Test**: Con datos de asistencia cargados para varios días
dentro del período abierto, se puede navegar hacia un día previo, verificar
que se muestra la misma información que en Historia 1 para esa fecha, y que
se puede aplicar una corrección, pausa o retiro anticipado sobre ese día tal
como en las Historias 2 y 3.

**Acceptance Scenarios**:

1. **Given** el administrador está en la pantalla "Fichadas de Hoy",
   **When** navega a un día anterior dentro del período de liquidación
   abierto, **Then** la lista muestra legajo, nombre, horas de
   entrada/salida, pausa, horas trabajadas y situación correspondientes a
   ese día.
2. **Given** un día previo dentro del período abierto, **When** el
   administrador corrige un horario, agrega una pausa o registra un retiro
   anticipado sobre ese día, **Then** la acción se guarda igual que si fuera
   el día actual, quedando auditada con la fecha del día corregido.
3. **Given** el administrador está viendo un día previo, **When** intenta
   disparar la consulta manual de fichadas al reloj, **Then** el sistema no
   ofrece esa acción (solo aplica al día actual).
4. **Given** un día anterior al período de liquidación abierto (ya cerrado),
   **When** el administrador intenta navegar hacia esa fecha, **Then** el
   sistema no permite la navegación a ese día.
5. **Given** el administrador está en el día actual, **When** busca navegar
   hacia un día futuro, **Then** el sistema no ofrece esa opción.

---

### Edge Cases

- Un día `No Laborable` o `Feriado` (calendario de 004) no debe mostrar a los
  empleados como `AUSENTE`; se distingue de un día `Laborable` sin fichadas.
- Un legajo presente en la lista de hoy pero sin categoría configurada en el
  dominio de presentismo (anomalía ya identificada en 004) se muestra
  señalado como anomalía en vez de asignarle una situación normal.
- Dos correcciones manuales sucesivas sobre el mismo campo del mismo día
  conservan el historial completo (no se pierde la corrección anterior).
- Un retiro anticipado registrado después de que el empleado ya fichó su
  salida real no debe duplicar ni contradecir la hora de salida fichada.
- Una pausa cuyo intervalo cae fuera de la jornada efectiva del empleado no
  descuenta horas.
- Si la consulta manual al reloj trae una fichada para un campo que ya tiene
  una corrección manual vigente, la corrección manual prevalece (ver
  Historia 2, escenario 3).
- Un intento de navegar a un día anterior al período de liquidación abierto
  (ya cerrado) no se permite; el sistema no ofrece esa fecha como destino de
  navegación.
- Un intento de navegar a un día futuro no se permite, independientemente de
  si ese día ya tiene datos de calendario cargados (feature 004).
- Un empleado con más de una pausa registrada en el día muestra en las
  columnas "Inicio pausa" / "Fin pausa" la pausa principal del día; las
  pausas adicionales no descuentan visibilidad en la tabla pero siguen
  restando horas trabajadas (ver FR-006) y son accesibles desde el detalle o
  el modal de edición de la fila.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar, para el día seleccionado (el día en
  curso por defecto), una lista de todos los empleados esperados ese día con:
  legajo, nombre, fecha/hora de entrada, fecha/hora de salida, inicio y fin
  de la pausa intermedia principal del día (si existe), horas trabajadas y
  situación.
- **FR-002**: El sistema MUST calcular automáticamente la situación de cada
  empleado a partir de sus fichadas y las reglas del calendario/jornada
  (feature 004), usando un catálogo acotado de valores que incluye, como
  mínimo: `ESPERANDO`, `PRESENTE`, `TARDE`, `AUSENTE`, jornada completa, y
  retiro anticipado.
- **FR-003**: El sistema MUST permitir a un administrador corregir
  manualmente la hora de entrada y/o salida de un empleado para el día
  mostrado (el día actual o un día previo dentro del período de liquidación
  abierto), mediante un formulario modal.
- **FR-004**: El sistema MUST exigir una justificación de texto obligatoria
  para poder guardar cualquier corrección manual, pausa intermedia o retiro
  anticipado; el guardado MUST rechazarse si falta.
- **FR-005**: El sistema MUST registrar cada corrección manual con autor,
  fecha/hora de la corrección, valor anterior, valor nuevo y motivo, de forma
  reversible y auditable (consistente con el modelo de auditoría de 004).
- **FR-006**: El sistema MUST permitir a un administrador agregar, mediante
  un formulario modal, una pausa intermedia (intervalo `[desde, hasta]`) a la
  jornada de un empleado para el día mostrado (actual o previo dentro del
  período de liquidación abierto), con motivo obligatorio, y recalcular las
  horas trabajadas descontando la porción de la pausa dentro de la jornada
  efectiva (sin bajar de cero). Si el empleado tiene más de una pausa ese
  día, todas descuentan horas trabajadas aunque la tabla solo despliegue la
  pausa principal en columnas (ver FR-001).
- **FR-007**: El sistema MUST permitir a un administrador registrar, mediante
  un formulario modal, un retiro anticipado para un empleado en el día
  mostrado (actual o previo dentro del período de liquidación abierto), con
  motivo obligatorio, reflejándose en la situación mostrada.
- **FR-008**: El sistema MUST ofrecer un control, disponible únicamente
  cuando el día mostrado es el día actual, para disparar manualmente una
  consulta de fichadas nuevas al reloj biométrico, independiente del ciclo
  de sincronización programado (feature 002).
- **FR-009**: Al completarse una consulta manual exitosa, el sistema MUST
  actualizar la lista con las fichadas nuevas sin sobrescribir correcciones
  manuales vigentes sobre los mismos campos.
- **FR-010**: El sistema MUST mostrar un estado de error claro cuando la
  consulta manual al reloj falla, sin perder ni corromper los datos ya
  mostrados en la lista.
- **FR-011**: El sistema MUST evitar disparar dos consultas manuales al
  reloj en paralelo mientras una ya está en curso.
- **FR-012**: El sistema MUST restringir la corrección manual, el agregado
  de pausas/retiros anticipados y la consulta manual al reloj a usuarios con
  rol administrador; el resto de los usuarios con acceso a la página solo
  puede visualizar la lista.
- **FR-013**: El sistema MUST distinguir en la lista a los empleados de un
  día `No Laborable` o `Feriado` de modo que no aparezcan como `AUSENTE`.
- **FR-014**: El sistema MUST señalar de forma distinguible a los legajos
  presentes en la lista de hoy que no tienen categoría de presentismo
  configurada (anomalía descripta en 004), en vez de asignarles una
  situación normal.
- **FR-015**: El sistema MUST NOT mostrar datos biométricos crudos (templates
  de huella, imágenes) en la página ni en los registros de auditoría.
- **FR-016**: El sistema MUST permitir a un administrador navegar desde el
  día actual hacia días previos dentro del período de liquidación abierto
  (calendario de feature 004), mostrando para el día seleccionado la misma
  información y acciones descriptas en FR-001 a FR-007.
- **FR-017**: El sistema MUST NOT permitir navegar a días futuros ni a días
  anteriores al período de liquidación abierto (períodos ya cerrados).
- **FR-018**: El sistema MUST presentar los formularios de corrección de
  horario, pausa intermedia y retiro anticipado como diálogos modales, en
  lugar de formularios embebidos en la página.

### Key Entities

- **Fichada del día**: marca de entrada o salida capturada por el reloj para
  un legajo en una fecha/hora determinada; entidad ya existente (features
  001/002), consumida aquí de solo lectura salvo por las correcciones.
- **Situación**: valor calculado por empleado y por día que resume su estado
  de asistencia (`ESPERANDO`, `PRESENTE`, `TARDE`, `AUSENTE`, jornada
  completa, retiro anticipado, anomalía); se deriva de las fichadas, las
  correcciones vigentes y las reglas de calendario/jornada de 004.
- **Corrección Manual**: entidad de auditoría (ya modelada en 004) con autor,
  fecha, valor anterior, valor nuevo y motivo obligatorio; aplicada aquí
  sobre la hora de entrada o salida de un día concreto.
- **Pausa Intermedia**: entidad ya modelada en 004, con intervalo
  `[desde, hasta]`, autor y motivo obligatorio; usada aquí para descontar
  horas de la jornada de un empleado desde la página del día.
- **Retiro Anticipado**: registro de que un empleado se retiró antes de la
  hora oficial de salida, con autor y motivo obligatorio; afecta la
  situación mostrada y las horas trabajadas del día.
- **Empleado esperado del día**: legajo y nombre provenientes del padrón de
  RRHH (feature 003), de solo lectura, combinado con su categoría de
  presentismo (feature 004) para determinar si corresponde presentarse ese
  día.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede ver el estado de asistencia de todos los
  empleados esperados del día en una sola pantalla, sin consultar legajo por
  legajo.
- **SC-002**: El sistema recalcula y refleja el efecto de una corrección
  manual, pausa o retiro anticipado (horas trabajadas y situación) en la fila
  correspondiente sin recargar toda la página.
- **SC-003**: El 100% de las correcciones manuales, pausas y retiros
  anticipados guardados incluyen autor, motivo y marca de tiempo, quedando
  auditables.
- **SC-004**: Una consulta manual al reloj que encuentra fichadas nuevas las
  refleja en la lista en la misma sesión, sin esperar al próximo ciclo
  programado.
- **SC-005**: Ningún guardado de corrección, pausa o retiro anticipado sin
  motivo llega a persistirse (0% de excepciones sin justificación).

## Assumptions

- El acceso a las funciones de corrección manual, pausa, retiro anticipado y
  consulta manual al reloj está restringido a usuarios con rol
  administrador; el resto de los roles con acceso a la página solo la
  visualizan (no se especificó un esquema de permisos más granular).
- El catálogo de situaciones se apoya en las reglas ya definidas en el
  dominio de presentismo (feature 004): ventanas de entrada/salida, margen
  de tolerancia y clasificación de días (`Laborable`, `No Laborable`,
  `Feriado`); esta feature no redefine esas reglas, solo las consume para
  calcular y mostrar la situación de hoy.
- "Consultar nuevas fichadas al reloj" es un disparo manual y bajo demanda
  del mismo mecanismo de sincronización ya implementado en la feature
  `002-servicio-fichadas-programado`, no un protocolo nuevo de comunicación
  con el dispositivo.
- El retiro anticipado se modela como un registro auditable propio,
  hermano de la pausa intermedia y la corrección manual, y no como una
  simple corrección de la hora de salida, porque conceptualmente representa
  una excepción autorizada distinta (salida antes de horario oficial) que se
  quiere poder reportar por separado.
- La página permite navegar hacia días previos dentro del período de
  liquidación abierto (calendario de feature 004); no permite navegar a días
  futuros ni a períodos ya cerrados. Al navegar a un día previo, las
  acciones de administrador (corrección, pausa, retiro anticipado) siguen
  disponibles sobre ese día; la consulta manual al reloj biométrico solo
  aplica al día actual.
- La tabla de la pantalla muestra un único par de columnas para la pausa
  intermedia ("Inicio pausa" / "Fin pausa"), correspondiente a la pausa
  principal del día por empleado; si un empleado tiene más de una pausa, el
  detalle completo se consulta desde el modal de edición de la fila, no
  desde columnas adicionales en la tabla.
- Los formularios de corrección de horario, pausa intermedia y retiro
  anticipado se implementan como diálogos modales, unificando el patrón de
  interacción de edición en toda la página.
