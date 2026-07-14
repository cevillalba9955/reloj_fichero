# Feature Specification: Servicio de Consulta Programada de Fichadas

**Feature Branch**: `002-servicio-fichadas`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "crear Service que consulte asincronicamente a client y almacene en memoria las fichadas recuperadas, dominio incluye Empleado, Fichada, Periodo(AñoMes). horario de consulta 7:00 16:00 ( con repeticion cada 5 minutos hasta completar todos los empleados activos)"

## Clarifications

### Session 2026-07-06

- Q: ¿De dónde surge el universo de "empleados activos" contra el que el
  servicio debe completarse cada día? → A: Fuente externa a integrar
  (RRHH/Oracle). El servicio consulta un padrón externo, no lo deriva de
  las fichadas ya descargadas.
- Q: ¿Cuándo se considera "completo" a un empleado activo en el día? → A:
  Se requiere una fichada por cada momento esperado (por ejemplo, entrada
  ~07:00 y salida ~16:00), cada uno con un margen configurable (± 30
  minutos por defecto). Un empleado está completo para un momento cuando
  tiene una fichada cuya hora cae dentro de la ventana de aceptación de
  ese momento (hora esperada ± margen).
- Q: ¿Qué debe hacer el servicio si, al agotarse el margen de un momento
  esperado, un empleado activo todavía no fichó para ese momento? → A: No
  hacer nada automáticamente (sin alertas ni valores forzados): el
  servicio expone ese caso como pendiente/incompleto en su estado en
  memoria; la resolución del motivo (justificación de la ausencia) es un
  proceso manual fuera de esta feature. Las consultas para el momento
  "salida" siguen ejecutándose cada 5 minutos desde su hora esperada hasta
  que se agote su margen o todos los activos ya hayan fichado, lo que
  ocurra primero. Si una fichada de un momento ya cerrado (por margen
  agotado) aparece más tarde — incluso al día siguiente — se registra con
  normalidad, sin rechazarla ni marcarla como inválida.

### Session 2026-07-07

- Q: Dado que el reloj no borra fichadas (hereda FR-007 de
  `001-consulta-fichadas-rs596`) y por lo tanto vuelve a reportar como
  pendiente la misma fichada en cada ciclo de sondeo de 5 minutos hasta
  que se elimine explícitamente, ¿debe el servicio deduplicar fichadas
  repetidas entre ciclos, y con qué criterio de identidad? → A: Sí — las
  fichadas duplicadas se ignoran comparando su `rawHex`; si una fichada
  con el mismo `rawHex` ya está en el store en memoria, no se vuelve a
  agregar (no se cuenta dos veces ni se duplica en `periodos[]`).

### Session 2026-07-14

- Q: ¿Cómo debe programarse exactamente el sondeo respecto de la hora de
  entrada y su ventana? → A: El servicio consulta al reloj **arrancando en
  la hora de entrada** (07:00 por defecto), repitiendo **cada 5 minutos**
  hasta que **cada legajo activo** tenga registrada **al menos una fichada
  dentro de la ventana**, y **al cabo de 30 minutos** (07:30 por defecto)
  deja de intentar. **Esta decisión reemplaza el modelo anterior de dos
  momentos con margen simétrico ± 30 min:**
  - Hay **un único momento esperado, "entrada"**. El momento "salida"
    (16:00) queda **fuera de alcance** de esta feature.
  - La ventana de aceptación es **de un solo lado**: `[hora de entrada,
    hora de entrada + duración]`, con duración configurable de **30
    minutos por defecto** (07:00 → 07:30). Ya **no** es un margen simétrico
    hora esperada ± 30 (que abarcaba 06:30–07:30).
  - Un legajo activo se considera **completo** cuando tiene **al menos una
    fichada** cuya hora cae dentro de esa ventana; el momento se **cierra**
    apenas todos los activos estén completos **o** se cumplan los 30
    minutos, lo que ocurra primero.

- Q: Como el reloj no borra fichadas y el servicio solo sondea durante la
  ventana de entrada, ¿cómo se recuperan las fichadas posteriores (p. ej.
  la salida de la tarde) y cómo se evita que una fichada de un día previo
  falsee la completitud del día en curso? → A: Las fichadas que el reloj
  todavía no reportó dentro de la ventana de entrada de un día (típicamente
  las de la tarde de ese mismo día) se recuperan en el **sondeo de la
  mañana siguiente**, junto con las fichadas nuevas: al no borrarse del
  reloj, siguen pendientes hasta que el próximo sondeo las descargue, y
  quedan agrupadas en su **período real** (año-mes de su campo `fecha`
  decodificado), no en el de su recolección. Para que esto no distorsione
  la completitud, **la completitud se acota al día de servicio en curso**:
  un legajo solo cuenta como completo para la entrada de hoy si tiene una
  fichada válida **cuya fecha es la de hoy**; una fichada de un día
  anterior conservada en memoria no lo completa hoy. Además, una fichada
  con **hora válida pero fuera de la ventana** de entrada (p. ej. una
  salida de ayer descargada esta mañana) **no** se asocia a la entrada
  (queda con `checkpointId` nulo): el respaldo de asociar al momento
  abierto en el instante de la descarga aplica únicamente cuando la fichada
  viene **sin hora** decodificable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recolectar fichadas del día automáticamente (Priority: P1)

Como integrador/administrador del sistema, quiero que un servicio consulte
automáticamente al reloj biométrico (reutilizando el cliente de la consulta
de fichadas ya existente) durante la jornada laboral, para acumular en
memoria las fichadas del día sin tener que ejecutar el script manualmente
cada vez.

**Why this priority**: Es la funcionalidad núcleo solicitada — sin
programación automática, el servicio no aporta nada por encima de ejecutar
el script existente a mano. Todo lo demás (cierre por momento esperado,
consulta del estado acumulado) depende de que esta recolección automática
funcione primero.

**Independent Test**: Se puede probar arrancando el servicio dentro de la
ventana horaria contra un reloj (o mock) con fichadas pendientes, y
verificando que, sin intervención manual, las fichadas aparecen acumuladas
en memoria dentro de los siguientes 5 minutos.

**Acceptance Scenarios**:

1. **Given** el servicio está corriendo y llega la hora esperada de
   "entrada" (07:00 por defecto), **When** empieza la ventana de ese
   momento, **Then** el servicio ejecuta una primera consulta al reloj sin
   intervención manual.
2. **Given** el servicio ya ejecutó una consulta, **When** pasan 5 minutos
   y la ventana de "entrada" sigue abierta (dentro de los 30 min y con
   activos aún sin fichar), **Then** el servicio ejecuta una nueva consulta
   y agrega las fichadas nuevas a lo ya acumulado en memoria.
3. **Given** ya se cerró la entrada del día (por completitud de todos los
   activos o por cumplirse los 30 minutos de la ventana), **When**
   transcurre el tiempo, **Then** el servicio no ejecuta ninguna consulta
   nueva hasta la entrada del día siguiente.

---

### User Story 2 - Cerrar la ventana de entrada apenas se completa o se cumplen los 30 minutos (Priority: P2)

Como integrador, quiero que el servicio deje de repetir consultas para el
momento "entrada" apenas tenga al menos una fichada de todos los empleados
activos dentro de la ventana, o apenas se cumplan los 30 minutos de la
ventana, para no generar carga innecesaria de conexiones repetidas contra el
reloj.

**Why this priority**: Reduce el desgaste sobre un dispositivo con un
protocolo no oficial y sin soporte confirmado de sesiones concurrentes (ver
`001-consulta-fichadas-rs596`); es una optimización sobre la recolección
automática de la Historia 1, no un bloqueante para tener valor inicial.

**Independent Test**: Se puede probar simulando que, tras una o más
consultas, ya se cuenta con al menos una fichada de todos los empleados
activos dentro de la ventana de "entrada", y verificando que el servicio no
dispara ninguna consulta adicional en los siguientes ciclos de 5 minutos, ni
espera al vencimiento de los 30 minutos para detenerse.

**Acceptance Scenarios**:

1. **Given** el servicio ya recolectó al menos una fichada dentro de la
   ventana de "entrada" para todos los empleados activos, **When** llega el
   próximo ciclo de 5 minutos dentro de la ventana, **Then** el servicio no
   ejecuta una nueva consulta y cierra el momento "entrada".
2. **Given** transcurrieron los 30 minutos de la ventana de "entrada" y
   quedan empleados activos sin una fichada dentro de la ventana, **When**
   se cumple ese plazo, **Then** el servicio deja de consultar y expone a
   esos empleados como incompletos en su estado en memoria, sin generar
   ninguna alerta ni valor forzado.

---

### User Story 3 - Consultar el estado acumulado en memoria (Priority: P3)

Como integrador, quiero poder consultar en cualquier momento cuántas
fichadas se recolectaron, para qué empleados, en qué período (año-mes)
quedaron agrupadas, y quiénes siguen incompletos para algún momento
esperado, para verificar el progreso de la recolección del día sin tener
que leer logs ni código.

**Why this priority**: Da visibilidad sobre el trabajo de las Historias 1 y
2, pero el servicio ya entrega valor recolectando datos aunque todavía no
exista una forma cómoda de consultarlos.

**Independent Test**: Se puede probar consultando el estado en memoria del
servicio en distintos momentos del día y verificando que refleja
correctamente las fichadas acumuladas, agrupadas por empleado y por
período, y qué empleados activos quedan incompletos para cada momento
esperado.

**Acceptance Scenarios**:

1. **Given** el servicio acumuló fichadas de al menos un empleado, **When**
   se consulta el estado en memoria, **Then** se puede ver, por empleado,
   la cantidad de fichadas recolectadas, el período (año-mes) al que
   quedaron asociadas, y si está completo o incompleto para cada momento
   esperado del día.

---

### Edge Cases

- ¿Qué pasa si el reloj está inalcanzable o la consulta falla durante uno o
  más ciclos de 5 minutos? El servicio debe registrar el error y reintentar
  en el próximo ciclo programado, sin detenerse por completo.
- ¿Qué pasa si el servicio se inicia después de la hora esperada de
  "entrada" (por ejemplo, a las 09:00)? Si todavía está dentro de la
  ventana `[hora de entrada, hora de entrada + 30 min]`, empieza a consultar
  igual por el resto de la ventana; si la ventana de 30 min ya venció
  (07:30), considera el momento "entrada" ya cerrado y no consulta hasta la
  entrada del día siguiente.
- ¿Qué pasa si una consulta todavía está en curso cuando llega el próximo
  ciclo de 5 minutos? El servicio no debe iniciar una segunda consulta en
  paralelo contra el mismo reloj.
- ¿Qué pasa si el servicio se reinicia a mitad de la ventana horaria? Al no
  haber persistencia, el progreso de recolección del día en curso se pierde
  y arranca de nuevo desde cero para lo que quede de ventana.
- ¿Qué pasa si el reloj vuelve a reportar una fichada nueva (`rawHex`
  distinto) de un empleado que ya estaba "completo" para la entrada del
  día? La fichada se agrega igual al acumulado en memoria (no se descarta),
  sin que eso reabra la ventana de entrada ya cerrada.
- ¿Qué pasa si el reloj vuelve a reportar, en un ciclo posterior, una
  fichada que ya se había recolectado antes (mismo `rawHex`, ya que el
  reloj no borra fichadas entre ciclos — hereda FR-007 de
  `001-consulta-fichadas-rs596`)? El servicio la ignora: no se vuelve a
  agregar al store ni se cuenta dos veces en `periodos[]` (ver
  Clarifications, sesión 2026-07-07).
- ¿Qué pasa si un empleado no fichó la entrada cuando se cumplen los 30
  minutos de la ventana? El servicio no hace nada automáticamente (no
  alerta, no fuerza un valor); ese empleado queda expuesto como incompleto
  para la entrada en el estado en memoria, a la espera de una resolución
  manual fuera de esta feature.
- ¿Cómo se recuperan las fichadas posteriores a la ventana de entrada (por
  ejemplo, la salida de la tarde), si el servicio solo sondea entre 07:00 y
  07:30? Como el reloj no borra fichadas, esas marcaciones quedan pendientes
  y se descargan en el **sondeo de la mañana siguiente**, junto con las
  fichadas nuevas. Cada una queda agrupada en el período (año-mes) real de
  su campo `fecha` decodificado, no en el de su recolección (ver
  Clarifications, sesión 2026-07-14).
- ¿Qué pasa si aparece una fichada fuera de la ventana de aceptación de la
  entrada (por ejemplo, la salida de ayer descargada esta mañana)? Se
  registra con normalidad en memoria (no se rechaza), pero **no** se asocia
  a la entrada: queda sin momento asignado (`checkpointId` nulo) y no cuenta
  para la completitud de la entrada de ningún día. Solo el respaldo de
  "momento abierto al descargar" (para fichadas sin hora decodificable)
  puede asociar a la entrada una fichada que no calza por hora.
- ¿Qué pasa si el padrón externo de empleados activos (RRHH/Oracle) no
  está disponible cuando el servicio necesita evaluarlo? Sin un padrón
  válido, el servicio no puede determinar contra qué empleados debe
  completarse: debe registrar el error y no asumir un padrón vacío o
  ficticio.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El servicio DEBE ejecutar automáticamente, sin intervención
  manual, consultas al reloj biométrico reutilizando el cliente de consulta
  ya existente (`001-consulta-fichadas-rs596`) en vez de reimplementar el
  protocolo.
- **FR-002**: El servicio DEBE definir un único momento esperado de fichada
  por día — "entrada" (hora esperada configurable, 07:00 por defecto) — con
  una ventana de aceptación **de un solo lado** que arranca en la hora de
  entrada y se extiende una duración configurable (**30 minutos por
  defecto**): `[hora de entrada, hora de entrada + duración]` (07:00 → 07:30
  por defecto). El momento "salida" queda fuera de alcance de esta feature.
- **FR-003**: Mientras el momento "entrada" siga abierto (dentro de su
  ventana de 30 minutos y con empleados activos todavía sin al menos una
  fichada dentro de la ventana), el servicio DEBE repetir la consulta al
  reloj cada 5 minutos, arrancando en la hora de entrada.
- **FR-004**: El servicio DEBE cerrar el momento "entrada" — dejando de
  generar nuevas consultas motivadas por él — apenas ocurra lo que suceda
  primero entre: (a) todos los empleados activos tienen al menos una fichada
  válida dentro de la ventana de entrada, o (b) se cumplieron los 30 minutos
  de la ventana desde la hora de entrada.
- **FR-005**: El servicio DEBE obtener el universo de "empleados activos"
  consultando una fuente externa (RRHH/Oracle a integrar), en vez de
  derivarlo dinámicamente de las fichadas que el reloj va reportando.
- **FR-006**: El servicio DEBE considerar a un empleado activo "completo"
  para la entrada cuando tiene al menos una fichada **del día de servicio en
  curso** cuya hora cae dentro de la ventana de aceptación de la entrada
  (`[hora de entrada, hora de entrada + 30 min]`). La completitud DEBE
  acotarse al día en curso: una fichada de un día anterior que el servicio
  todavía conserva en memoria (porque agrupa por período mensual) NO DEBE
  contar como completitud del día de hoy. La hora ya viene decodificada de
  forma confiable por el cliente existente en la práctica totalidad de los
  casos (`001-consulta-fichadas-rs596`, research.md §5.16). El respaldo de
  asociar una fichada a la entrada por estar su ventana abierta en el
  instante de la descarga aplica **únicamente** cuando la fichada viene con
  hora `null` (registro que no calza con el formato esperado): una fichada
  con **hora válida pero fuera de la ventana** de entrada (por ejemplo, una
  salida de un día previo que el reloj recién reporta a la mañana siguiente)
  NO DEBE asociarse a la entrada, aunque se descargue mientras esa ventana
  está abierta.
- **FR-007**: Si al cerrarse el momento "entrada" (por cumplirse los 30
  minutos) un empleado activo sigue sin una fichada válida dentro de la
  ventana, el servicio NO DEBE generar ninguna alerta ni forzar un valor:
  DEBE dejar a ese empleado expuesto como incompleto para la entrada en su
  estado en memoria.
- **FR-008**: El servicio DEBE seguir aceptando y registrando con
  normalidad cualquier fichada que llegue fuera de la ventana de aceptación
  de su momento correspondiente (incluso al día siguiente), sin rechazarla
  ni marcarla como inválida.
- **FR-009**: El servicio DEBE almacenar en memoria de proceso (sin
  persistencia en disco ni en base de datos) cada fichada recuperada,
  asociada al empleado (por legajo) y al período (año-mes) que le
  corresponda.
- **FR-010**: El servicio DEBE modelar el dominio con tres entidades:
  Empleado, Fichada y Período (año-mes) — ver Key Entities.
- **FR-011**: El servicio NO DEBE ejecutar más de una consulta simultánea
  contra el mismo reloj (una sola sesión TCP a la vez), en línea con la
  limitación de concurrencia ya documentada para el protocolo RS956
  (`001-consulta-fichadas-rs596`, Assumptions).
- **FR-012**: Si una consulta programada falla (error de conexión, timeout,
  respuesta inesperada del reloj), el servicio DEBE registrar el error y
  continuar con el próximo ciclo programado, sin detener el servicio por
  completo.
- **FR-013**: Si la fuente externa de empleados activos no está disponible,
  el servicio DEBE registrar el error y NO DEBE asumir un padrón vacío o
  ficticio para decidir si un momento esperado está completo.
- **FR-014**: El servicio DEBE permitir consultar, en cualquier momento, el
  estado acumulado en memoria: fichadas recolectadas por empleado, período
  (año-mes) asociado a cada una, y si el empleado está completo o
  incompleto para la entrada del día.
- **FR-015**: El servicio DEBE registrar de forma estructurada cada ciclo de
  consulta (resultado, cantidad de fichadas nuevas, duración), en línea con
  el principio de observabilidad de la constitución del proyecto.
- **FR-016**: El servicio NO DEBE ejecutar el comando de borrado de fichadas
  del reloj — hereda la restricción de solo-lectura de
  `001-consulta-fichadas-rs596` (FR-007 de esa feature).
- **FR-017**: Dado que el reloj no borra fichadas y por lo tanto puede
  volver a reportar la misma fichada como pendiente en ciclos de sondeo
  posteriores, el servicio DEBE ignorar (no volver a agregar al
  acumulado en memoria) cualquier fichada cuyo `rawHex` ya se haya
  recolectado antes, sin importar en qué ciclo o checkpoint se la vuelva
  a recibir.

### Key Entities *(include if feature involves data)*

- **Empleado**: representa a una persona identificable por su legajo
  (identificador numérico ya confirmado como confiable por el cliente
  existente). Su estado activo/inactivo surge de una fuente externa
  (RRHH/Oracle, a integrar — ver FR-005). Para la entrada del día, el
  servicio mantiene si el empleado está completo o incompleto.
- **Fichada**: evento de marcación de un Empleado, tal como lo entrega el
  cliente existente (método de verificación, hora y fecha decodificadas por
  completo desde 2026-07-07 — ver Assumptions). Cada Fichada queda asociada
  a un Empleado, a un Período, y — cuando corresponde — a la entrada, si su
  ventana de aceptación la contiene. Su `rawHex` actúa
  como identificador único dentro del acumulado en memoria: una Fichada con
  un `rawHex` ya recolectado antes se ignora, no se vuelve a agregar
  (FR-017).
- **Período (AñoMes)**: agrupación mensual bajo la cual se acumulan las
  Fichadas de un Empleado (por ejemplo, "2026-07"). Sirve como clave de
  organización del almacenamiento en memoria, pensada para un eventual uso
  de reportes o nómina mensual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El servicio recolecta las fichadas de entrada del día sin
  intervención manual en el 100% de los días en que está corriendo.
- **SC-002**: En el 100% de los ciclos de consulta, el servicio nunca abre
  más de una sesión simultánea contra el reloj.
- **SC-003**: Un operador puede saber, en cualquier momento durante la
  jornada, cuántos empleados activos están completos o incompletos para la
  entrada del día, sin necesitar leer logs ni código.
- **SC-004**: Ante una falla de conexión puntual con el reloj, el servicio
  se recupera solo en el siguiente ciclo programado (dentro de 5 minutos)
  sin intervención manual.
- **SC-005**: El servicio deja de generar consultas repetidas motivadas por
  la entrada dentro de los 5 minutos posteriores a que ese momento se cierre
  (por completitud de todos los activos o por cumplirse los 30 minutos de la
  ventana).
- **SC-006**: Ningún empleado activo incompleto al cierre de la ventana de
  entrada queda con un valor de fichada inventado o forzado — el 100% de
  los casos incompletos quedan expuestos como tales en el estado en
  memoria.

## Assumptions

- El "client" mencionado en la descripción de la feature es el cliente TCP
  del protocolo RS956 ya implementado en `001-consulta-fichadas-rs596`
  (`src/protocol/client.js`, función `runQuerySession`); este servicio
  reutiliza ese cliente tal cual, sin reimplementar ni modificar el
  protocolo.
- El almacenamiento en memoria no persiste entre reinicios del proceso: si
  el servicio se reinicia, el progreso de recolección del día en curso se
  pierde y arranca de nuevo. Persistencia durable (por ejemplo, Oracle)
  queda fuera de alcance de esta feature, en línea con el Principio II de
  la constitución (que exige una capa de repositorio dedicada, todavía no
  construida para esta feature).
- **Actualizado 2026-07-07:** el campo `fecha` de cada Fichada ya se
  decodifica por completo y con 100% de coincidencia contra calibración real
  (`001-consulta-fichadas-rs596`, FR-005/research.md §5.16) — la suposición
  anterior de que siempre era `null` quedó obsoleta. En consecuencia, el
  Período (año-mes) de cada Fichada DEBE determinarse a partir del campo
  `fecha` ya decodificado del propio evento (año-mes real de la marcación),
  no de la fecha en que el servicio la recolectó — esto también resuelve
  con naturalidad el caso de fichadas que llegan tarde (incluso al día
  siguiente, ver Edge Cases): quedan agrupadas en el período real al que
  pertenecen, no en el de su recolección. Solo si `fecha` viniera `null`
  para un registro puntual (caso hoy no observado, pero el cliente
  existente puede devolverlo si el registro no calza con el formato
  esperado) el servicio debe recurrir a la fecha de recolección como
  respaldo, dejando constancia de que ese período es una aproximación.
- La hora de entrada y la duración de su ventana son configurables, pero se
  asume un único horario de entrada compartido por todos los empleados
  activos (no hay turnos distintos por empleado en esta primera versión);
  soporte para turnos diferenciados por empleado, y para un segundo momento
  "salida", queda fuera de alcance.
- La fuente externa de empleados activos (RRHH/Oracle) todavía no está
  integrada en este proyecto; esta feature depende de que exista una forma
  de consultarla (el mecanismo concreto — qué sistema, qué interfaz — es
  una decisión de diseño para `/speckit-plan`, no de esta especificación).
  Esta dependencia es de solo lectura sobre el padrón de empleados, y no
  debe confundirse con la escritura de fichadas a Oracle, que sigue fuera
  de alcance (Principio II de la constitución).
- La resolución manual de empleados incompletos (justificar la ausencia de
  una fichada) es un proceso fuera de esta feature; el servicio solo debe
  exponer el estado incompleto, no resolverlo.
- El servicio corre contra un único reloj RS956 (mismo host/IP que
  `001-consulta-fichadas-rs596`); soporte para múltiples relojes queda
  fuera de alcance de esta feature.
- El servicio expone el estado acumulado en memoria mediante una interfaz
  de consulta interna (en proceso), no necesariamente una API HTTP externa;
  exponerlo como servicio web queda para una feature futura si se necesita.
