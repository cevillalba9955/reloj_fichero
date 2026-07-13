# Feature Specification: Dominio de Presentismo — Cálculo de Horas Trabajadas por Período

**Feature Branch**: `004-dominio-presentismo`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "preparar dominio de presentismo, para calculo de horas trabajadas por periodo. Periodo [YYYYMM] contiene lista de dias habiles [DD], inicialmente se carga con los dias de mes en cuestion de Lunes a Viernes (configurable), luego cada dia se modificar como [Laborable, No Laborable, Feriado]. un dia contiene lista de fichadas. para el calculo de horas trabajadas, se toma primer fichada del dia (dentro de la ventana de apertura) y ultima fichada (dentro de ventana de cierre) si estan dentro del margen se utliza hora de apertura y cierre (7:00 a 16:00) completando 9 hs trabajadas. si esta fuera de margen se calcula horario parcial"

## Clarifications

### Session 2026-07-10 (pausas intermedias)

- Q: ¿Cómo carga el responsable una pausa intermedia? → A: Como un intervalo horario
  `[desde, hasta]` (por ejemplo `12:00`–`13:00`). El sistema descuenta del total diario
  únicamente la porción de ese intervalo que cae dentro del horario efectivo trabajado
  de la jornada (intersección con `[entrada efectiva, salida efectiva]`), de forma
  determinista.
- Q: ¿Qué naturaleza tiene la pausa intermedia y cómo se audita? → A: Es una entidad
  propia (Pausa intermedia), distinta de la Corrección Manual de horas de
  entrada/salida, pero con las mismas garantías de auditoría: autor, fecha, motivo
  obligatorio y reversible. Se registra y se reporta por separado, y —como las
  correcciones— es una fuente de variación admitida y trazable sobre el cálculo
  automático, protegida frente a recálculos.
- Q: ¿Sobre qué jornadas aplica la pausa y qué pasa con el total? → A: Solo sobre
  jornadas con horas efectivas a descontar: día `Laborable` con entrada y salida
  determinadas (por fichadas o por corrección manual). El total diario resultante
  nunca baja de `0` (si el descuento supera lo trabajado, se acota a cero, nunca
  negativo). En días `Feriado`, `No Laborable` o sin horas efectivas, no aplica. Se
  admiten varias pausas en un mismo día; se descuenta la suma de sus porciones dentro
  del horario efectivo.

### Session 2026-07-10 (modalidad de liquidación y categorías)

- Q: ¿Cómo se delimita una quincena para la modalidad de liquidación quincenal? → A:
  Dos mitades por mes calendario: días 1–15 (primera quincena) y días 16–último día
  del mes (segunda quincena). La segunda quincena varía de largo (13 a 16 días) según
  el mes. Las quincenas quedan anidadas dentro del mes calendario, de modo que el
  calendario institucional de días y feriados sigue siendo la base compartida.
- Q: ¿De dónde salen la categoría del empleado, su modalidad y sus parámetros? → A: La
  asignación legajo→categoría viene del padrón RRHH/Oracle (feature 003), de solo
  lectura; este sistema no la administra. La definición de cada categoría (su modalidad
  de liquidación y sus parámetros de jornada como las ventanas de entrada/salida) se
  configura dentro de este sistema de presentismo, sin depender de que RRHH modele
  conceptos de este dominio. Si el padrón reporta una categoría no configurada acá, es
  una anomalía a reportar (ver edge case).
- Q: ¿Qué parámetros de jornada puede redefinir una modalidad? → A: El juego completo:
  ventanas de entrada/salida, horas oficiales de apertura y cierre, y márgenes de
  tolerancia; por lo tanto, cada modalidad determina su propia jornada esperada. El
  esquema semanal de días laborables NO es propio de la modalidad: sigue siendo global
  e institucional (ver la aclaración sobre calendario compartido).
- Q: ¿El calendario de días y el período de liquidación son la misma entidad? → A: No,
  se separan. Existe un único Calendario del mes compartido (la clasificación de cada
  día y sus feriados, institucional, común a todas las modalidades). El Período de
  liquidación es un tramo de ese calendario —el mes completo para la modalidad mensual,
  o una quincena para la quincenal— y es la unidad sobre la que se acumulan horas y se
  emite el resumen. Así los feriados se cargan una sola vez y las quincenas quedan
  anidadas en el mes.
- Q: Si la categoría de un empleado cambia, ¿qué modalidad rige el cálculo del período?
  → A: Fuera de alcance por ahora. Se asume que la categoría de un empleado no cambia
  dentro de un período; el cálculo usa una única categoría/modalidad por empleado y
  período. Si en la práctica cambia dentro del período, se resuelve manualmente
  (corrección o reasignación fuera de este alcance). Esto preserva el determinismo del
  cálculo automático (FR-023).

### Session 2026-07-10

- Q: ¿Un día `Feriado` aporta jornada esperada al período o aporta cero horas
  esperadas, igual que un `No Laborable`? → A: Aporta la jornada esperada (9 hs con
  los parámetros por defecto) y se considera cumplida automáticamente, sin necesidad
  de fichadas. El saldo del empleado no se ve castigado por el feriado y las horas
  esperadas del mes no dependen de cuántos feriados haya. `Feriado` y `No Laborable`
  se diferencian precisamente en esto: el primero es un día pagado que no se trabaja,
  el segundo no existe para el cálculo.
- Q: En un día `Laborable` en el que solo se pudo determinar una punta (solo entrada o
  solo salida), ¿cuántas horas se computan? → A: Cero horas y jornada `Incompleta`
  con su motivo. Además, el sistema ofrece como sugerencia el valor que resultaría de
  completar la punta faltante con la hora oficial correspondiente; esa sugerencia no
  se aplica sola: solo la confirma un usuario responsable mediante una corrección
  auditable. Racional: no se computa lo que no está evidenciado, pero un olvido de
  fichada tiene una vía de resolución explícita y trazable.
- Q: Las fichadas en días `No Laborable` o `Feriado`, ¿suman al total de horas
  trabajadas del período? → A: No suman. Se registran y se reportan aparte. El total
  de horas del período mide únicamente cumplimiento de la jornada esperada; el trabajo
  en día no laborable queda visible pero se liquida por otra vía. Coherente con la
  decisión de no computar horas extra en esta feature.
- Q: ¿Los resultados del cálculo son inmutables? → A: No. En todos los casos un
  usuario responsable puede corregir manualmente el resultado de una jornada (horas,
  estado, elección de fichada de entrada o de salida). Toda corrección queda
  registrada con su autor, fecha, valor anterior, valor nuevo y motivo, y prevalece
  sobre el valor calculado hasta que se la revierta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Armar el calendario laboral del mes (Priority: P1)

Como responsable de administración de personal, quiero generar el Calendario del mes
(por ejemplo `202607`) con sus días ya preclasificados según el esquema semanal
habitual (Lunes a Viernes laborables), y luego corregir manualmente los días que no
siguen esa regla (un feriado nacional, un sábado que se trabaja, un día no laborable
por decisión interna), para tener el universo de días —único y compartido por todas
las modalidades— sobre el que se van a calcular las horas de cada empleado.

**Why this priority**: sin un calendario del período correcto, ningún cálculo de
horas es confiable: las horas esperadas, el saldo y la detección de ausencias se
derivan enteramente de la clasificación de cada día. Es el cimiento del dominio y
entrega valor por sí solo (un calendario laboral consultable y editable).

**Independent Test**: se puede probar completo generando el Calendario del mes
`202607`, verificando que los 31 días existen con la clasificación inicial esperada
(los Lunes a Viernes como `Laborable`, Sábados y Domingos como `No Laborable`), y
reclasificando un día concreto como `Feriado`. Entrega valor sin necesidad de
tener una sola fichada cargada.

**Acceptance Scenarios**:

1. **Given** que no existe el período `202607`, **When** se genera el período con
   el esquema semanal por defecto, **Then** se crean los 31 días del mes, cada
   Lunes a Viernes queda clasificado como `Laborable` y cada Sábado y Domingo como
   `No Laborable`.
2. **Given** el período `202607` generado, **When** se reclasifica el día `09` como
   `Feriado`, **Then** el día queda registrado como `Feriado` y los demás días
   conservan su clasificación previa.
3. **Given** un esquema semanal configurado como Lunes a Sábado, **When** se genera
   el período `202607`, **Then** los Sábados quedan clasificados como `Laborable`.
4. **Given** el período `202607` ya generado y con días reclasificados a mano,
   **When** se vuelve a solicitar la generación del mismo período, **Then** el
   sistema no duplica días ni descarta silenciosamente las reclasificaciones
   existentes.
5. **Given** una solicitud de generar el período `202613`, **When** se procesa,
   **Then** el sistema la rechaza indicando que el identificador de período no es
   un mes calendario válido.

---

### User Story 2 - Calcular las horas trabajadas de un empleado en el período (Priority: P2)

Como responsable de administración de personal, quiero obtener las horas trabajadas
por un empleado (identificado por su legajo) en su período de liquidación, calculadas
a partir de sus fichadas, de la clasificación de cada día y de los parámetros de
jornada de su modalidad, para saber cuántas horas cumplió frente a las horas esperadas
del período.

**Why this priority**: es el objetivo central de la feature. Depende del calendario
de la User Story 1, pero una vez que existe el calendario entrega el resultado que
motiva todo el trabajo: el total de horas del período y el saldo contra lo esperado.

**Independent Test**: se puede probar completo cargando un calendario mínimo (un
día `Laborable`) y un conjunto de fichadas de un legajo, y verificando las horas
trabajadas resultantes para cada combinación de horarios (dentro y fuera del
margen de tolerancia). No requiere interfaz de usuario ni conexión al reloj.

**Acceptance Scenarios**:

1. **Given** un día `Laborable` con una fichada del legajo `1234` a las `07:05` y
   otra a las `15:58`, **When** se calculan las horas del día, **Then** ambas caen
   dentro del margen de tolerancia, se computan las horas oficiales `07:00`–`16:00`
   y el resultado es `9:00` horas.
2. **Given** un día `Laborable` con fichadas del legajo `1234` a las `06:40` y a las
   `16:25`, **When** se calculan las horas del día, **Then** el resultado es `9:00`
   horas: la llegada temprana y la salida tardía no generan horas adicionales.
3. **Given** un día `Laborable` con fichadas del legajo `1234` a las `08:10` y a las
   `16:05`, **When** se calculan las horas del día, **Then** la entrada queda fuera
   del margen de apertura, se computa el horario parcial desde `08:10` hasta la hora
   oficial de cierre `16:00` y el resultado es `7:50` horas.
4. **Given** un día `Laborable` con fichadas del legajo `1234` a las `07:15` y a las
   `14:00`, **When** se calculan las horas del día, **Then** la salida queda fuera
   del margen de cierre, se computa el horario parcial desde la hora oficial de
   apertura `07:00` hasta `14:00` y el resultado es `7:00` horas.
5. **Given** un día `Laborable` con fichadas del legajo `1234` a las `08:30`, `11:00`
   y `14:45`, **When** se calculan las horas del día, **Then** se toma `08:30` como
   entrada y `14:45` como salida, la fichada intermedia de `11:00` se ignora para el
   cálculo y el resultado es `6:15` horas.
6. **Given** un día `Laborable` sin ninguna fichada del legajo `1234`, **When** se
   calculan las horas del día, **Then** el resultado es `0:00` horas y el día queda
   marcado como `Sin fichadas`.
7. **Given** un día `Feriado` sin fichadas del legajo `1234`, **When** se calcula la
   jornada, **Then** el día aporta la jornada esperada como cumplida (`9:00` horas) y
   no genera saldo negativo.
8. **Given** un día `No Laborable` con fichadas del legajo `1234` a las `09:00` y a
   las `13:00`, **When** se calcula el período, **Then** esas horas no suman al total
   trabajado y las fichadas se listan en el reporte de trabajo fuera de calendario.
9. **Given** el período `202607` con 22 días `Laborable` y 1 día `Feriado`, **When**
   se calcula el resumen del legajo `1234`, **Then** el resumen informa las horas
   esperadas del período (incluyendo las del feriado), las horas trabajadas acumuladas
   y el saldo entre ambas.
10. **Given** el legajo `1234` en una Categoría de modalidad `Quincenal` y el mes
    `202607`, **When** se calcula su presentismo, **Then** se producen dos resúmenes
    —primera quincena (días 1–15) y segunda quincena (días 16–31)— cada uno con horas
    esperadas y trabajadas acotadas a los días de su tramo.
11. **Given** dos empleados en el mismo día `Laborable`, uno en una modalidad con
    jornada `07:00`–`16:00` y otro en una modalidad con jornada `06:00`–`14:00`,
    **When** se calculan sus horas, **Then** cada uno se evalúa con las ventanas, horas
    oficiales y márgenes de su propia modalidad y sus jornadas esperadas difieren.
12. **Given** el legajo `1234` con una Categoría que no está configurada en el sistema,
    **When** se intenta calcular su presentismo, **Then** el empleado queda sin cálculo
    y la anomalía se reporta, sin inventar parámetros de jornada.

---

### User Story 3 - Corregir manualmente una jornada (Priority: P2)

Como responsable de administración de personal, quiero corregir a mano el resultado de
una jornada —las horas, el estado, o qué fichada se toma como entrada o salida— y
cargar excepcionalmente una pausa intermedia que descuente tiempo del total diario,
dejando registrado quién lo hizo y por qué, para resolver los casos que el cálculo
automático no puede cerrar solo: un olvido de fichada, una marcación errónea, un
acuerdo puntual con el empleado, o una interrupción de la jornada sin fichada que la
respalde.

**Why this priority**: sin esta capacidad, cualquier jornada incompleta bloquea la
liquidación y no hay salida dentro del sistema. Es lo que hace que la regla
conservadora de FR-015 (cero horas ante una punta faltante) sea operativamente
viable en vez de un obstáculo.

**Independent Test**: se puede probar completo tomando una jornada `Incompleta` con
`0:00` horas, aplicando una corrección con motivo, y verificando que el total del
período incorpora las horas corregidas, que el valor calculado original sigue visible
y que la corrección se puede revertir.

**Acceptance Scenarios**:

1. **Given** una jornada `Laborable` con una única fichada a las `07:02` y estado
   `Incompleta` con `0:00` horas, **When** se consulta la jornada, **Then** el sistema
   ofrece como sugerencia no aplicada las `9:00` horas que resultarían de completar la
   salida con la hora oficial de cierre, y el total del período sigue sin incluirlas.
2. **Given** esa misma jornada, **When** un usuario responsable confirma la corrección
   indicando un motivo, **Then** la jornada pasa a `9:00` horas, el total del período
   las incorpora, y quedan registrados autor, fecha, valor anterior, valor nuevo y
   motivo.
3. **Given** un intento de corregir una jornada sin indicar motivo, **When** se envía
   la corrección, **Then** el sistema la rechaza.
4. **Given** una jornada con una corrección manual vigente, **When** se recalcula el
   período porque llegaron fichadas nuevas de ese día, **Then** la corrección sigue
   vigente y la jornada queda señalada para revisión, sin sobrescribirse en silencio.
5. **Given** una jornada con una corrección manual vigente, **When** un usuario
   responsable la revierte, **Then** la jornada vuelve a su valor calculado
   automáticamente y la reversión queda registrada.
6. **Given** una jornada `Laborable` del legajo `1234` con `9:00` horas trabajadas
   (entrada efectiva `07:00`, salida efectiva `16:00`), **When** un usuario responsable
   carga una Pausa intermedia `12:00`–`13:00` con motivo, **Then** el total de la
   jornada pasa a `8:00` horas y la Pausa queda registrada con autor, intervalo y
   motivo, reportada aparte de las correcciones de entrada/salida.
7. **Given** esa jornada con la Pausa `12:00`–`13:00` cargada, **When** el usuario
   responsable la revierte, **Then** el total vuelve a `9:00` horas y la reversión
   queda registrada.
8. **Given** una jornada con `1:30` horas efectivas, **When** se carga una Pausa de
   `2:00` horas dentro del horario efectivo, **Then** el total de la jornada se acota a
   `0:00` y no queda negativo.

---

### User Story 4 - Auditar el detalle del cálculo de una jornada (Priority: P3)

Como auditor o responsable de liquidación, quiero ver, para un empleado y un día,
qué fichada concreta se tomó como entrada, cuál como salida, qué horas efectivas se
usaron tras aplicar la tolerancia y por qué un día quedó incompleto, para poder
justificar el número de horas frente al empleado o frente a una revisión.

**Why this priority**: no cambia el resultado del cálculo, pero es lo que lo hace
defendible. Las horas de presentismo impactan sobre la liquidación de haberes, y un
total sin trazabilidad no se puede discutir ni corregir. Se puede entregar después
de que el cálculo funcione.

**Independent Test**: se puede probar completo tomando una jornada ya calculada y
verificando que el detalle expone la fichada de entrada elegida, la de salida, las
horas efectivas aplicadas, las fichadas descartadas y el motivo de descarte.

**Acceptance Scenarios**:

1. **Given** una jornada calculada con fichadas a las `08:30`, `11:00` y `14:45`,
   **When** se consulta su detalle, **Then** el detalle indica `08:30` como fichada
   de entrada, `14:45` como fichada de salida, y `11:00` como fichada no utilizada
   para el cálculo.
2. **Given** una jornada `Laborable` con una única fichada a las `07:02`, **When** se
   consulta su detalle, **Then** el detalle indica que no se pudo determinar una
   salida y que por eso el día quedó en `0:00` horas e incompleto.
3. **Given** una jornada con entrada `07:20` normalizada a `07:00` por tolerancia,
   **When** se consulta su detalle, **Then** el detalle expone tanto la hora real
   fichada (`07:20`) como la hora efectiva computada (`07:00`).
4. **Given** una jornada con una corrección manual vigente, **When** se consulta su
   detalle, **Then** el detalle muestra el valor calculado automáticamente junto al
   valor corregido, con autor, fecha y motivo de la corrección.

---

### Edge Cases

- **Fichada sin fecha determinable**: el sistema no puede imputarla a ningún día del
  período; queda registrada como no imputada y se reporta, sin alterar el cálculo de
  ninguna jornada ni descartarse en silencio.
- **Corrección manual invalidada por un recálculo**: si tras corregir a mano una
  jornada llegan fichadas nuevas de ese día o se reclasifica el día, la corrección
  sigue vigente pero el sistema la señala para revisión, en vez de pisarla en silencio.
- **Corrección manual sobre una jornada de un día `No Laborable`**: es admisible, pero
  el sistema deja constancia de que las horas corregidas provienen de un día que no
  aporta jornada esperada.
- **Fichada exactamente en el límite de una ventana o de un margen**: los límites se
  tratan como inclusivos, de modo que una fichada a las `07:30` con margen de 30
  minutos sobre las `07:00` sigue considerándose dentro del margen.
- **Salida anterior a la entrada**: si la última fichada de la ventana de cierre no es
  posterior a la fichada tomada como entrada, no hay salida válida y el día queda
  incompleto con `0:00` horas, en vez de arrojar horas negativas.
- **La misma fichada cae en ambas ventanas**: una fichada nunca puede ser a la vez la
  entrada y la salida de la misma jornada; con una sola fichada el día no puede
  cerrarse.
- **Fichadas duplicadas** (el reloj reporta la misma fichada en ciclos sucesivos): se
  cuentan una sola vez y no alteran la elección de entrada ni de salida.
- **Fichadas fuera de toda ventana** (por ejemplo, a las `03:00`): no se toman como
  entrada ni como salida; quedan registradas en el día y visibles en el detalle.
- **Reclasificación de un día ya calculado**: pasar un día de `Laborable` a `Feriado`
  (o viceversa) recalcula el período sin perder ninguna fichada previamente imputada
  a ese día.
- **Empleado sin ninguna fichada en todo el período**: el resumen se emite igual, con
  `0:00` horas trabajadas y el total de horas esperadas como saldo negativo.
- **Cambio de los parámetros de jornada** (hora de apertura, cierre o márgenes de una
  modalidad) entre dos cálculos del mismo período: el resultado cambia; el resumen deja
  constancia de con qué modalidad y parámetros fue calculado.
- **Empleado con Categoría no configurada**: si el padrón asigna una Categoría que no
  existe en este sistema, el empleado queda sin cálculo (no se inventan parámetros) y
  la anomalía se registra y reporta hasta que la Categoría se configure.
- **Empleado sin Categoría en el padrón**: se trata igual que la Categoría no
  configurada: sin cálculo automático y anomalía reportada.
- **Cambio de Categoría dentro de un período**: fuera del cálculo automático; se asume
  Categoría estable dentro del período y, de haber cambio, se resuelve por corrección
  manual.
- **Feriado con jornada esperada según modalidad**: el crédito automático de un día
  `Feriado` usa la jornada esperada de la modalidad del empleado, por lo que un mismo
  feriado puede acreditar distinta cantidad de horas a empleados de modalidades
  distintas.
- **Pausa fuera del horario efectivo**: si el intervalo de una Pausa intermedia cae
  parcial o totalmente fuera de `[entrada efectiva, salida efectiva]`, solo descuenta
  la porción que se solapa; la parte de afuera no resta nada.
- **Pausa mayor que lo trabajado**: si el descuento de las pausas supera las horas
  trabajadas, el total diario se acota a `0:00`, nunca negativo.
- **Pausa sobre jornada sin horas efectivas**: cargar una Pausa sobre un día `Feriado`,
  `No Laborable` o una jornada `Incompleta`/`Sin fichadas` no aplica descuento (no hay
  horario efectivo del cual restar); el sistema lo indica en vez de descontar sobre la
  nada.
- **Pausa afectada por un recálculo**: si tras cargar una Pausa cambia el horario
  efectivo (nuevas fichadas o una corrección manual), la porción descontada puede
  variar; la Pausa sigue vigente y la jornada se señala para revisión.

## Requirements *(mandatory)*

### Functional Requirements

#### Calendario del mes (compartido)

- **FR-001**: El sistema DEBE permitir crear un Calendario del mes identificado por un
  mes calendario en formato `YYYYMM`, y DEBE rechazar identificadores que no
  correspondan a un mes válido. El Calendario del mes es único y compartido por todas
  las modalidades de liquidación.
- **FR-002**: Al crear un Calendario del mes, el sistema DEBE generar un Día por cada
  fecha del mes, clasificando inicialmente como `Laborable` todo día cuyo día de la
  semana pertenezca al esquema semanal configurado, y como `No Laborable` el resto.
- **FR-003**: El esquema semanal de días laborables por defecto DEBE ser configurable
  (por defecto, Lunes a Viernes) sin requerir cambios de código. El esquema semanal es
  institucional y común a todas las modalidades; NO se define por modalidad.
- **FR-004**: Los usuarios DEBEN poder reclasificar cualquier Día del Calendario del
  mes como `Laborable`, `No Laborable` o `Feriado`, y la clasificación efectiva de un
  día DEBE ser exactamente una de esas tres. La clasificación es institucional: rige
  por igual para todas las modalidades.
- **FR-005**: Reclasificar un Día DEBE recalcular las horas de todos los Períodos de
  liquidación que incluyen ese día, sin descartar ninguna fichada previamente imputada
  a él.
- **FR-006**: Regenerar un Calendario del mes ya existente NO DEBE duplicar días ni
  sobrescribir en silencio reclasificaciones manuales previas.

#### Modalidad de liquidación y período

- **FR-031**: El sistema DEBE soportar dos modalidades de liquidación: `Mensual` y
  `Quincenal`. Un Período de liquidación es un tramo del Calendario del mes: para
  `Mensual`, el mes completo; para `Quincenal`, una de dos quincenas: primera (días
  1–15) o segunda (días 16–último día del mes).
- **FR-032**: Cada Período de liquidación DEBE identificarse de forma única por su mes
  (`YYYYMM`) y su tramo (mes completo, primera quincena o segunda quincena), y DEBE
  acumular horas y emitir resumen únicamente sobre los días de su tramo.
- **FR-033**: El sistema DEBE permitir configurar Categorías. Cada Categoría define
  exactamente una modalidad de liquidación y su propio juego de parámetros de jornada.
  La definición de las Categorías vive en este sistema (no en el padrón).
- **FR-034**: Cada empleado DEBE pertenecer a exactamente una Categoría. La asignación
  legajo→Categoría se obtiene del padrón RRHH/Oracle (feature 003), de solo lectura;
  este sistema no la administra.
- **FR-035**: Si el padrón asigna a un empleado una Categoría que no está configurada
  en este sistema, el sistema NO DEBE calcular sus horas con parámetros inventados:
  DEBE registrar y reportar la anomalía, y dejar al empleado sin cálculo hasta que la
  Categoría se configure.
- **FR-036**: El cálculo de un empleado en un período DEBE usar una única
  Categoría/modalidad: la vigente para ese empleado al momento del cálculo. Se asume
  que la Categoría no cambia dentro de un período; un cambio dentro del período se
  resuelve manualmente y queda fuera del cálculo automático (preserva FR-023).

#### Fichadas e imputación

- **FR-007**: Cada Día DEBE poder contener entre cero y N fichadas, imputadas por la
  fecha de la fichada y asociadas al legajo del empleado que la generó.
- **FR-008**: Las fichadas cuya fecha no pueda determinarse NO DEBEN imputarse a
  ningún Día; el sistema DEBE registrarlas como no imputadas y reportarlas.
- **FR-009**: El sistema NO DEBE contar dos veces la misma fichada, aunque la fuente
  la reporte en más de una ocasión.

#### Parámetros de jornada

- **FR-010**: Cada modalidad de liquidación DEBE tener su propio juego de parámetros de
  jornada, configurable sin cambios de código: la hora oficial de apertura (por defecto
  `07:00`), la hora oficial de cierre (por defecto `16:00`), el margen de tolerancia de
  apertura (por defecto 30 minutos), el margen de tolerancia de cierre (por defecto 30
  minutos), la ventana de apertura y la ventana de cierre. Dos modalidades pueden tener
  parámetros distintos entre sí.
- **FR-011**: La jornada esperada de un día `Laborable` DEBE derivarse de las horas
  oficiales de apertura y cierre de la modalidad del empleado (con los valores por
  defecto, 9 horas), y no configurarse por separado. Empleados de modalidades distintas
  pueden tener jornadas esperadas distintas para el mismo día.

#### Cálculo de horas de una jornada

Una Jornada es la combinación de un Día del mes y un empleado.

- **FR-012**: El sistema DEBE tomar como fichada de entrada la primera fichada del
  empleado en ese día que caiga dentro de la ventana de apertura de su modalidad.
- **FR-013**: El sistema DEBE tomar como fichada de salida la última fichada del
  empleado en ese día que caiga dentro de la ventana de cierre de su modalidad y sea
  posterior a la fichada de entrada. Una misma fichada nunca puede ser entrada y salida.
- **FR-014**: El sistema DEBE computar las horas trabajadas de la jornada aplicando
  la tolerancia y sin generar horas extra, de la siguiente manera:
  - la **hora efectiva de entrada** es la hora oficial de apertura si la fichada de
    entrada ocurrió en cualquier momento anterior o igual a la hora oficial de
    apertura más el margen de apertura; en caso contrario, es la hora real de la
    fichada de entrada;
  - la **hora efectiva de salida** es la hora oficial de cierre si la fichada de
    salida ocurrió en cualquier momento posterior o igual a la hora oficial de cierre
    menos el margen de cierre; en caso contrario, es la hora real de la fichada de
    salida;
  - las **horas trabajadas** son la diferencia entre la hora efectiva de salida y la
    hora efectiva de entrada, nunca negativa y nunca superior a la jornada esperada.
- **FR-015**: Si en un día `Laborable` no se puede determinar una fichada de entrada o
  no se puede determinar una fichada de salida válida, el sistema DEBE computar `0:00`
  horas trabajadas y marcar la jornada como `Incompleta`, indicando cuál de las dos
  puntas falta. Junto con ese resultado, el sistema DEBE ofrecer como **sugerencia no
  aplicada** las horas que resultarían de completar la punta faltante con la hora
  oficial correspondiente (apertura o cierre). La sugerencia NO DEBE incorporarse al
  total del período mientras no la confirme un usuario responsable mediante una
  corrección manual (FR-026).
- **FR-016**: Un día `Laborable` sin ninguna fichada del empleado DEBE computar `0:00`
  horas trabajadas y marcarse con estado `Sin fichadas`.
- **FR-017**: Las fichadas del día que no fueron seleccionadas como entrada ni como
  salida NO DEBEN alterar el cálculo de horas, y DEBEN permanecer registradas y
  visibles en el detalle de la jornada.
- **FR-018**: Las fichadas registradas en días clasificados como `No Laborable` o
  `Feriado` NO DEBEN sumar horas al total de horas trabajadas del período. El sistema
  DEBE registrarlas igualmente y reportarlas por separado, identificando el día, el
  legajo y las fichadas involucradas, para que el trabajo fuera de calendario quede
  visible aunque se liquide por otra vía.

#### Resumen del período

- **FR-019**: El sistema DEBE producir, para un empleado y un Período de liquidación,
  un resumen que incluya: la modalidad aplicada, las horas esperadas del período, las
  horas trabajadas acumuladas, el saldo entre ambas, la cantidad de días `Laborable`,
  la cantidad de días con jornada completa, la cantidad de días con jornada incompleta
  y la cantidad de días sin fichadas, considerando únicamente los días del tramo del
  período.
- **FR-020**: Las horas esperadas del período DEBEN ser la suma de la jornada esperada
  de cada día `Laborable` y de cada día `Feriado`. Un día `Feriado` DEBE computarse
  como jornada esperada cumplida sin requerir fichadas, de modo que no genere saldo
  negativo. Un día `No Laborable` NO DEBE aportar horas esperadas.
- **FR-021**: El sistema DEBE exponer, para cada jornada, el detalle del cálculo:
  fichada tomada como entrada, fichada tomada como salida, hora real y hora efectiva
  de cada una, horas trabajadas resultantes, fichadas no utilizadas y motivo por el
  cual la jornada quedó incompleta, si corresponde.
- **FR-022**: El resumen DEBE dejar constancia de la modalidad y los parámetros de
  jornada con los que fue calculado (horas oficiales y márgenes vigentes), y DEBE
  distinguir dentro del total qué parte de las horas proviene del cálculo automático,
  qué parte de correcciones manuales y cuántas horas se descontaron por Pausas
  intermedias.

#### Corrección manual por usuario responsable

- **FR-026**: Un usuario responsable DEBE poder corregir manualmente el resultado de
  cualquier jornada, cualquiera sea su estado: las horas trabajadas, el estado de la
  jornada, y cuál fichada se toma como entrada y cuál como salida.
- **FR-027**: Toda corrección manual DEBE registrar autor, fecha y hora, valor
  anterior, valor nuevo y motivo. El motivo es obligatorio.
- **FR-028**: Una jornada corregida manualmente DEBE conservar visible el valor
  calculado automáticamente junto al valor corregido; la corrección prevalece sobre
  el cálculo a efectos del total del período.
- **FR-029**: Un recálculo del período (por reclasificación de un día, llegada de
  nuevas fichadas o cambio de parámetros) NO DEBE sobrescribir en silencio una
  corrección manual vigente. Si el valor calculado cambia por debajo de una
  corrección, el sistema DEBE señalarlo para revisión.
- **FR-030**: Un usuario responsable DEBE poder revertir una corrección manual, con lo
  cual la jornada vuelve a tomar su valor calculado automáticamente. La reversión
  también queda registrada.

#### Pausas intermedias

- **FR-037**: Un usuario responsable DEBE poder cargar a mano una o más Pausas
  intermedias sobre una jornada, cada una expresada como un intervalo horario `[desde,
  hasta]` dentro del mismo día. La carga es excepcional y no requiere que exista
  ninguna fichada que evidencie la pausa.
- **FR-038**: El sistema DEBE descontar del total de horas trabajadas de la jornada la
  porción de cada Pausa intermedia que caiga dentro del horario efectivo trabajado
  (la intersección del intervalo de la pausa con `[entrada efectiva, salida efectiva]`).
  La parte de una pausa fuera de ese horario no descuenta nada. Con varias pausas, se
  descuenta la suma de sus porciones dentro del horario efectivo.
- **FR-039**: Las Pausas intermedias SOLO DEBEN aplicar a jornadas con horas efectivas
  a descontar: día `Laborable` con entrada y salida determinadas (por fichadas o por
  corrección manual). NO DEBEN aplicar a días `Feriado`, `No Laborable` ni a jornadas
  sin horas efectivas. El total diario tras el descuento NUNCA DEBE ser negativo: si el
  descuento supera lo trabajado, el total se acota a `0:00`.
- **FR-040**: Cada Pausa intermedia DEBE registrar autor, fecha y hora, el intervalo
  cargado y un motivo obligatorio. Las Pausas se registran y reportan por separado de
  las correcciones de horas de entrada/salida.
- **FR-041**: Un usuario responsable DEBE poder revertir (eliminar) una Pausa
  intermedia, con lo cual su descuento deja de aplicarse; la reversión queda
  registrada. Un recálculo del período NO DEBE eliminar en silencio una Pausa vigente;
  si el horario efectivo cambia y altera la porción descontada, el sistema DEBE
  señalar la jornada para revisión (consistente con FR-029).

#### Calidad y trazabilidad

- **FR-023**: El cálculo automático DEBE ser determinista: para el mismo período, el
  mismo conjunto de fichadas y los mismos parámetros de jornada, el resultado DEBE ser
  siempre idéntico, sin depender de la fecha u hora en que se ejecuta el cálculo. Las
  correcciones manuales (FR-026) y las Pausas intermedias (FR-037) son las únicas
  fuentes de variación admitidas sobre ese resultado, y ambas son explícitas y
  trazables.
- **FR-024**: El cálculo automático NO DEBE computar horas extra: ninguna jornada
  calculada puede superar la jornada esperada, cualquiera sea el horario fichado. Una
  corrección manual puede exceder ese límite solo de forma explícita y con motivo
  registrado.
- **FR-025**: Las operaciones de generación de período, reclasificación de días,
  cálculo de horas y corrección manual DEBEN registrarse de forma estructurada y
  correlacionable por período, legajo y día, sin exponer datos biométricos ni
  credenciales.

### Key Entities

- **Calendario del mes**: un mes calendario identificado por `YYYYMM`. Contiene
  exactamente un Día por cada fecha del mes. Es único y compartido por todas las
  modalidades; es donde vive la clasificación institucional de cada día.
- **Día del mes**: una fecha del mes (`DD`) dentro del Calendario del mes, con
  exactamente una Clasificación. Agrupa las fichadas ocurridas en esa fecha. La
  clasificación es institucional: aplica a todos los empleados por igual.
- **Período de liquidación**: un tramo del Calendario del mes sobre el que se acumulan
  horas y se emite el resumen de un empleado. Según la modalidad de la Categoría del
  empleado, el tramo es el mes completo (`Mensual`) o una quincena —primera (días
  1–15) o segunda (días 16–fin de mes)— (`Quincenal`). Se identifica por mes y tramo.
- **Modalidad de liquidación**: uno de `Mensual` o `Quincenal`. Determina el tramo del
  período y el juego de parámetros de jornada aplicable.
- **Categoría**: agrupación de empleados definida en este sistema. Fija exactamente una
  Modalidad de liquidación y su propio juego de Parámetros de Jornada. La asignación
  legajo→Categoría proviene del padrón RRHH (solo lectura). Se prevé usar la Categoría
  para futuros cálculos además del presentismo.
- **Clasificación de Día**: uno de `Laborable`, `No Laborable` o `Feriado`. Determina
  si el día aporta jornada esperada y si sus fichadas se computan. `Laborable` aporta
  jornada esperada que hay que cumplir con fichadas; `Feriado` aporta jornada esperada
  que se considera cumplida sin fichadas; `No Laborable` no aporta jornada esperada.
- **Fichada**: un registro de marcación de un empleado, con legajo, fecha y hora. Es
  la unidad de evidencia; el dominio de presentismo la consume, no la produce.
- **Jornada**: la combinación de un Día del mes y un empleado. Es la unidad de
  cálculo: tiene una fichada de entrada, una de salida, horas efectivas, horas
  trabajadas y un estado (`Completa`, `Incompleta`, `Sin fichadas`, `Feriado
  cumplido`, `No aplica`). Puede tener asociada una Corrección Manual y una o más Pausas
  intermedias.
- **Corrección Manual**: la intervención de un usuario responsable sobre una Jornada.
  Registra autor, fecha y hora, valor calculado, valor corregido y motivo. Prevalece
  sobre el valor calculado hasta que se la revierta.
- **Pausa intermedia**: un intervalo horario `[desde, hasta]` cargado a mano por un
  usuario responsable sobre una Jornada, que descuenta del total diario la porción que
  cae dentro del horario efectivo trabajado. Registra autor, fecha y hora, el intervalo
  y un motivo obligatorio; es reversible y se reporta aparte de las Correcciones
  Manuales. Una Jornada puede tener varias.
- **Parámetros de Jornada**: hora oficial de apertura, hora oficial de cierre, margen
  de apertura, margen de cierre, ventana de apertura y ventana de cierre. Propios de
  cada Modalidad (dos modalidades pueden diferir). El esquema semanal de días
  laborables NO forma parte de esto: es institucional y global (ver Calendario del mes).
- **Resumen de Presentismo**: el resultado por empleado y Período de liquidación: horas
  esperadas, horas trabajadas (discriminando calculadas y corregidas), saldo, conteos
  de días por estado, fichadas en días no laborables, la modalidad aplicada y los
  parámetros usados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable de administración puede generar el calendario de un mes
  y dejarlo listo (con sus feriados y excepciones cargados) en menos de 5 minutos,
  sin editar archivos de configuración ni escribir código.
- **SC-002**: Para un mes completo de un empleado con jornadas mixtas (completas,
  parciales, incompletas y sin fichadas), el total de horas trabajadas coincide
  exactamente, al minuto, con el total calculado a mano sobre las mismas fichadas.
- **SC-003**: El cálculo del período de un empleado se resuelve en menos de 2 segundos
  para un mes con hasta 200 fichadas.
- **SC-004**: El cálculo de un período completo de la plantilla (hasta 500 empleados,
  un mes) se resuelve en menos de 30 segundos.
- **SC-005**: Ejecutar el mismo cálculo dos veces sobre los mismos datos y parámetros
  produce resultados idénticos en el 100% de los casos.
- **SC-006**: El 100% de las jornadas con horas distintas de la jornada esperada
  exponen el motivo (entrada tardía, salida temprana, jornada incompleta o sin
  fichadas) sin necesidad de inspeccionar registros técnicos.
- **SC-007**: El 100% de las fichadas de un período quedan explicadas: o bien están
  imputadas a un día y son visibles en el detalle de una jornada, o bien están
  listadas como no imputadas con su motivo.
- **SC-008**: Ninguna jornada calculada automáticamente devuelve horas negativas ni
  horas superiores a la jornada esperada, sobre el conjunto completo de casos de
  prueba.
- **SC-009**: El 100% de las correcciones manuales quedan registradas con autor,
  fecha, valor anterior, valor nuevo y motivo, y ninguna corrección puede registrarse
  sin motivo.
- **SC-010**: Un responsable puede resolver una jornada incompleta (revisar la
  sugerencia, confirmarla y ver el total del período actualizado) en menos de 1 minuto
  por jornada.
- **SC-011**: Ningún recálculo del período descarta una corrección manual vigente:
  sobre el conjunto completo de casos de prueba, el 100% de las correcciones sobreviven
  a un recálculo, señaladas para revisión cuando el valor calculado por debajo cambió.
- **SC-012**: Para un empleado de modalidad `Quincenal`, la suma de horas trabajadas y
  esperadas de sus dos quincenas coincide exactamente con la que tendría el mismo mes
  calculado como una sola unidad, sin días contados de más ni de menos en el corte
  15/16.
- **SC-013**: Dos empleados de modalidades distintas, con las mismas fichadas en los
  mismos días, obtienen resultados que reflejan sus parámetros de jornada respectivos
  (ventanas, horas oficiales, márgenes) en el 100% de los casos de prueba.
- **SC-014**: El 100% de los empleados cuya Categoría no está configurada quedan sin
  cálculo automático y con su anomalía reportada; ninguno se calcula con parámetros por
  defecto silenciosos.
- **SC-015**: El 100% de las Pausas intermedias descuentan exactamente la porción de su
  intervalo que se solapa con el horario efectivo trabajado, ningún total diario queda
  negativo por una pausa, y toda Pausa queda registrada con autor, intervalo y motivo.

## Assumptions

- **Ventanas de apertura y cierre**: se asume que la ventana de apertura abarca desde
  las `05:00` hasta las `12:00` y la de cierre desde las `12:00` hasta las `23:59`, de
  modo que una fichada se clasifica como candidata a entrada o a salida según caiga
  en una u otra. Ambas son configurables (FR-010); estos son los valores por defecto.
  La ventana define *qué fichada se considera* entrada o salida; el margen define
  *si se le aplica la tolerancia* que la lleva a la hora oficial.
- **Alcance del período de liquidación**: el Período de liquidación es un mes completo
  (modalidad `Mensual`) o una quincena anidada en el mes (modalidad `Quincenal`,
  cortes fijos 1–15 y 16–fin de mes). Ciclos de liquidación con cortes distintos (por
  ejemplo, del 21 al 20 del mes siguiente, o semanales) están fuera de alcance de esta
  feature.
- **Sin horas extra**: esta feature calcula cumplimiento de la jornada, no horas
  extraordinarias. Fichar antes de la apertura o después del cierre nunca suma horas,
  y el trabajo en días `No Laborable` o `Feriado` se reporta pero no suma al total. El
  registro y la liquidación de horas extra son un dominio aparte.
- **Usuario responsable**: se asume que existe (o existirá) un mecanismo de
  identificación de usuarios que permita atribuir una corrección manual a una persona
  concreta y distinguir quién tiene permiso para corregir. La definición del modelo de
  permisos y de la autenticación está fuera del alcance de esta feature; acá solo se
  exige que la corrección quede atribuida a un autor identificable.
- **Pausas intermedias solo por carga manual**: las fichadas intermedias del día
  (almuerzo, salidas transitorias) NO descuentan horas por sí solas; el cálculo
  automático sigue tomando únicamente la primera fichada de la ventana de apertura y la
  última de la de cierre. Un responsable puede, de forma excepcional, cargar a mano una
  Pausa intermedia (intervalo horario) que sí se descuenta del total diario, exista o
  no una fichada que la evidencie (ver FR-037 a FR-041).
- **Jornada dentro del mismo día**: no se contemplan jornadas que cruzan la
  medianoche (turnos nocturnos). Entrada y salida pertenecen a la misma fecha.
- **Parámetros de jornada por modalidad**: los parámetros de jornada (ventanas, horas
  oficiales, márgenes y por ende la jornada esperada) son propios de cada Modalidad de
  liquidación, no globales. Todos los empleados de una misma modalidad comparten
  parámetros; empleados de modalidades distintas pueden diferir. Horarios
  diferenciados por empleado individual (más allá de su modalidad) están fuera de
  alcance.
- **Categoría desde el padrón, definición local**: la asignación legajo→Categoría se
  lee del padrón RRHH/Oracle (feature 003); la definición de cada Categoría (su
  modalidad y sus parámetros de jornada) se configura en este sistema. Se asume que la
  Categoría de un empleado no cambia dentro de un mismo período de liquidación; si
  cambia, se resuelve manualmente. La Categoría se prevé reutilizar para futuros
  cálculos ajenos al presentismo.
- **Calendario institucional**: la clasificación de un día (`Laborable`, `No
  Laborable`, `Feriado`) aplica a todos los empleados por igual. Licencias,
  vacaciones y ausencias justificadas de un empleado individual son un dominio aparte
  y no forman parte de esta feature.
- **Sin huso horario ni horario de verano**: todas las horas se interpretan en la hora
  local del establecimiento, tal como las reporta el reloj.
- **Origen de las fichadas**: esta feature consume las fichadas ya decodificadas y
  deduplicadas que el sistema recolecta del reloj (features 001 y 002); no las lee del
  dispositivo ni redefine su formato.
- **Origen de los legajos**: el universo de empleados con el que se cruza el
  presentismo es el padrón de empleados activos ya existente (feature 003).
- **Dominio puro**: esta feature define el modelo y las reglas de cálculo. La interfaz
  de usuario para editar el calendario y visualizar los resúmenes se especifica por
  separado.
