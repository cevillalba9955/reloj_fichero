# Feature Specification: Control de Vacaciones Anual

**Feature Branch**: `015-control-vacaciones`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "vacaciones, vacaciones es un tipo de licencia particular, por lo que vamos a tratar de manera diferenciada. se estipula fecha de inicio, y cantidad de dias, corridos (sean habiles o no) y sin importar si cambian de periodo. para el dominio de asistencia es una justificacion NO PAGA. se debe generar una pagina para control de vacaciones anual, cada empleado tiene cierta cantidad de dias acumulados, automaticamente se incrementan anualmente en una fecha determinada configurable (ej 1ro de noviembre) segun su antiguedad, y se descuentan al asignarse (se permite saldo de dias negativo)"

## Clarifications

### Session 2026-07-22

- Q: ¿De dónde sale la fecha de ingreso / antigüedad de cada empleado, dato que hoy
  no se sincroniza al sistema (el padrón local solo trae legajo, categoría, nombre
  y activo)? → A: El dato ya existe en el padrón de Oracle RRHH; esta feature
  extiende la sincronización existente (feature 003) para traer también la fecha
  de ingreso de cada legajo al padrón local, en vez de cargarla manualmente.
- Q: ¿Qué escala de días de vacaciones según antigüedad debe usar el incremento
  automático anual? → A: La escala estándar de la Ley de Contrato de Trabajo
  argentina (Art. 150): menos de 5 años = 14 días, de 5 a menos de 10 años = 21
  días, de 10 a menos de 20 años = 28 días, 20 años o más = 35 días; todos corridos.
  La tabla se mantiene en un archivo de configuración editable, con el mismo patrón
  que el catálogo de motivos de ausencia (feature 012), para poder ajustarla sin
  cambios de código.
- Q: ¿Cómo deben reflejarse los días de una asignación de vacaciones en el
  calendario y el resumen de período que ya existen (features 004/011/012)? → A:
  Cada día del rango asignado queda marcado en el calendario del legajo como un día
  tipo `Vacaciones`, clasificado `No paga` (no acredita jornada esperada, cuenta
  como ausencia en el resumen de período), generado automáticamente por esta
  feature sin pasar por el catálogo genérico de motivos de Justificación (feature
  012) ni requerir carga manual día por día.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Asignar un período de vacaciones a un empleado (Priority: P1)

Como responsable de administración de personal, quiero asignarle a un empleado un
período de vacaciones indicando la fecha de inicio y la cantidad de días corridos,
para que ese período quede registrado, descontado de su saldo disponible y
reflejado como ausencia no paga en su calendario y en el resumen del período,
sin importar si los días son hábiles o no, ni si el período abarca más de un mes.

**Why this priority**: es el valor central de la feature: sin poder asignar
vacaciones, no hay nada que controlar ni mostrar en la página anual. Funciona de
forma independiente del resto de las historias.

**Independent Test**: se puede probar completo tomando un legajo con saldo
positivo de días, asignándole una fecha de inicio y una cantidad de días, y
verificando que el saldo se descuenta en esa cantidad, que cada día del rango
(incluidos fines de semana y feriados) queda marcado como `Vacaciones` en su
calendario, y que la asignación queda registrada con autor y fecha/hora de carga.

**Acceptance Scenarios**:

1. **Given** un legajo con saldo de 10 días disponibles, **When** un responsable
   asigna vacaciones con fecha de inicio y cantidad de 7 días, **Then** el saldo
   del legajo queda en 3 días, y los 7 días corridos a partir de la fecha de
   inicio quedan marcados como `Vacaciones` en su calendario, sean hábiles o no.
2. **Given** un legajo con saldo de 3 días disponibles, **When** un responsable le
   asigna 5 días de vacaciones, **Then** el sistema permite la asignación y el
   saldo del legajo queda en -2 días.
3. **Given** una asignación cuyo rango de fechas cruza de un mes calendario
   (período) a otro, **When** se confirma la asignación, **Then** todos los días
   del rango quedan marcados como `Vacaciones` en ambos períodos afectados, sin
   que la asignación se corte ni se rechace por el cambio de período.
4. **Given** un intento de asignar vacaciones sin fecha de inicio o sin una
   cantidad de días mayor a cero, **When** se envía la acción, **Then** el sistema
   la rechaza.
5. **Given** un día dentro del rango solicitado que ya tiene una asignación de
   vacaciones vigente o una Justificación vigente (feature 012) para ese legajo,
   **When** se intenta confirmar la asignación, **Then** el sistema rechaza la
   asignación completa e indica qué día(s) están en conflicto, sin crear un
   registro parcial.
6. **Given** un día futuro marcado como `Vacaciones` por una asignación vigente,
   **When** se calcula el resumen del período que contiene ese día, **Then** el
   día no acredita jornada esperada y cuenta como ausencia, igual que una
   Justificación `No paga` de la feature 012.

---

### User Story 2 - Consultar el saldo y el historial de vacaciones de cada empleado (Priority: P2)

Como responsable de administración de personal, quiero ver en una página anual el
saldo actual de días de vacaciones de cada empleado junto con su antigüedad y el
historial de incrementos y asignaciones, para poder planificar y auditar el uso de
vacaciones de todo el personal.

**Why this priority**: consultar el saldo no genera valor por sí sola sin poder
asignar vacaciones (User Story 1), pero es indispensable para poder decidir
cuántos días asignar y para responder consultas de los empleados o de auditoría.

**Independent Test**: se puede probar completo tomando un conjunto de legajos con
distintos saldos y antigüedades, abriendo la página de control de vacaciones, y
verificando que se muestra correctamente el saldo actual, la antigüedad calculada
y el historial de movimientos (incrementos y asignaciones) de cada legajo.

**Acceptance Scenarios**:

1. **Given** varios legajos activos con distinta fecha de ingreso, **When** se abre
   la página de control de vacaciones anual, **Then** se lista cada legajo con su
   antigüedad calculada a la fecha, su saldo actual de días y la fecha de su
   próximo incremento anual.
2. **Given** un legajo con incrementos anuales previos y asignaciones cargadas,
   **When** se consulta su historial, **Then** se muestra cada movimiento (alta por
   incremento anual o descuento por asignación) con fecha, cantidad de días y saldo
   resultante en ese momento.
3. **Given** un legajo sin fecha de ingreso cargada, **When** se consulta la
   página, **Then** el legajo se muestra señalado como pendiente de completar ese
   dato, sin antigüedad ni incremento automático calculado, y sin bloquear la
   visualización del resto de los legajos.

---

### User Story 3 - Incremento automático anual del saldo según antigüedad (Priority: P2)

Como responsable de administración de personal, quiero que el saldo de días de
vacaciones de cada empleado se incremente automáticamente una vez al año, en una
fecha configurable, según la cantidad de días que le correspondan por su
antigüedad a esa fecha, para no tener que cargar el incremento manualmente legajo
por legajo.

**Why this priority**: da sentido al control de saldo a lo largo del tiempo, pero
el sistema ya entrega valor con la asignación y consulta manual de saldos (User
Story 1 y 2) antes de que ocurra el primer incremento automático.

**Independent Test**: se puede probar completo configurando la fecha de incremento
anual en una fecha de prueba cercana, dejando que el sistema la alcance (o
simulando esa fecha), y verificando que cada legajo activo recibe la cantidad de
días correspondiente a su antigüedad a esa fecha, sumada a su saldo previo, quedando
registrado como un movimiento de incremento.

**Acceptance Scenarios**:

1. **Given** la fecha de incremento anual configurada en 1° de noviembre y un
   legajo con 6 años de antigüedad a esa fecha, **When** el sistema alcanza esa
   fecha, **Then** el saldo del legajo se incrementa en 21 días (según la escala
   configurada) y el movimiento queda registrado con fecha y cantidad.
2. **Given** un legajo con saldo negativo (-2 días) al momento del incremento
   anual, **When** se aplica el incremento que le corresponde (por ejemplo 14
   días), **Then** el saldo resultante es 12 días, sumando el incremento sobre el
   saldo negativo existente en vez de llevarlo a cero.
3. **Given** la fecha de incremento anual ya configurada, **When** un responsable
   la modifica a otra fecha antes de que se cumpla el próximo incremento, **Then**
   el sistema usa la nueva fecha configurada para calcular cuándo corresponde el
   próximo incremento de todos los legajos.
4. **Given** un legajo dado de baja (inactivo) antes de la fecha de incremento
   anual, **When** el sistema aplica el incremento a los legajos activos, **Then**
   ese legajo inactivo no recibe el incremento.

---

### User Story 4 - Revertir una asignación de vacaciones cargada por error (Priority: P3)

Como responsable de administración de personal, quiero poder revertir una
asignación de vacaciones que cargué con datos equivocados (fecha o cantidad de
días), dejando constancia de la reversión, para poder corregir el error sin perder
trazabilidad y recuperando el saldo descontado.

**Why this priority**: no bloquea el valor central de asignar y controlar
vacaciones, pero es necesaria para operar con confianza ante errores de carga, sin
dejar saldos ni calendarios inconsistentes de forma manual.

**Independent Test**: se puede probar completo tomando una asignación vigente,
revirtiéndola, y verificando que el saldo del legajo recupera los días
descontados, que los días del rango dejan de estar marcados como `Vacaciones` en
el calendario, y que la asignación original queda visible como revertida (no
vigente).

**Acceptance Scenarios**:

1. **Given** una asignación vigente de 5 días que dejó el saldo de un legajo en 2
   días, **When** el responsable la revierte, **Then** el saldo vuelve a 7 días,
   los 5 días dejan de estar marcados como `Vacaciones` en el calendario, y la
   asignación queda visible como revertida con quién y cuándo la revirtió.
2. **Given** una asignación de vacaciones ya revertida, **When** se intenta
   revertirla nuevamente, **Then** el sistema rechaza la acción indicando que ya
   no está vigente.

---

### Edge Cases

- **Cambio de antigüedad dentro del propio año de incremento**: la antigüedad usada
  para calcular el incremento anual es la que corresponde al legajo en la fecha
  configurada de incremento (no la del momento en que se consulta la página), de
  modo que dos consultas en distintos días del año antes del incremento muestran el
  mismo próximo incremento previsto.
- **Fecha de ingreso cargada o corregida después de que ya pasó la fecha de
  incremento del año en curso**: el sistema no aplica retroactivamente el
  incremento de ese año; el legajo queda habilitado recién para el incremento del
  próximo ciclo, y esa situación se señala para revisión de un responsable.
- **Asignación que se solapa parcialmente con un feriado o fin de semana**: todos
  los días corridos del rango se descuentan y se marcan igual, sin distinción entre
  hábiles, feriados o fines de semana (a diferencia de la Justificación genérica de
  la feature 012, que solo aplica a días `Laborable`).
- **Fichadas que llegan durante un día marcado como `Vacaciones`**: el sistema no
  descarta la marca `Vacaciones` en silencio; señala el día para revisión de un
  responsable, igual que el tratamiento existente para Justificaciones (feature
  012) y Correcciones Manuales (feature 004).
- **Escala de antigüedad incompleta o inválida en el archivo de configuración**: el
  sistema no ejecuta el incremento automático para los legajos afectados por el
  tramo inválido y reporta la anomalía de configuración, en vez de aplicar un valor
  arbitrario.
- **Legajo nuevo sin ningún incremento anual todavía recibido**: su saldo inicial es
  0 días hasta el primer incremento que le corresponda; puede igualmente
  asignársele vacaciones antes de ese primer incremento, quedando su saldo en
  negativo si se le asignan días.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE incorporar, para cada legajo, la fecha de ingreso
  proveniente del padrón de Oracle RRHH (extendiendo la sincronización de la
  feature 003), de la cual se deriva su antigüedad a cualquier fecha dada.
- **FR-002**: El sistema DEBE ofrecer una acción para asignar a un legajo un
  período de vacaciones indicando fecha de inicio y cantidad de días, contados como
  días corridos (calendario) a partir de la fecha de inicio, sin distinguir entre
  días hábiles, no hábiles o feriados.
- **FR-003**: El sistema DEBE rechazar una asignación de vacaciones sin fecha de
  inicio o con una cantidad de días menor o igual a cero.
- **FR-004**: Al confirmarse una asignación de vacaciones, el sistema DEBE
  descontar del saldo del legajo la cantidad de días asignada, permitiendo que el
  saldo resultante quede en un valor negativo.
- **FR-005**: Una asignación de vacaciones DEBE poder abarcar días de más de un
  período (mes calendario) sin restricción ni corte por el cambio de período.
- **FR-006**: Cada día comprendido en una asignación de vacaciones vigente DEBE
  quedar marcado en el calendario del legajo como un día tipo `Vacaciones`,
  clasificado `No paga`: no acredita la jornada esperada de ese día y cuenta como
  ausencia en el cálculo de horas/saldo del período (feature 004) y en el resumen
  del período (feature 011), de forma independiente del catálogo de motivos de
  Justificación de la feature 012.
- **FR-007**: El sistema DEBE rechazar una asignación de vacaciones si algún día
  del rango solicitado ya tiene una asignación de vacaciones vigente o una
  Justificación vigente (feature 012) para ese legajo, indicando qué día(s) están
  en conflicto, sin crear un registro parcial.
- **FR-008**: El sistema DEBE ofrecer una página de control de vacaciones anual que
  liste, para cada legajo activo, su antigüedad calculada a la fecha, su saldo
  actual de días y la fecha de su próximo incremento anual.
- **FR-009**: La página de control de vacaciones DEBE mostrar, por legajo, el
  historial de movimientos de su saldo (incrementos anuales y descuentos por
  asignación), cada uno con fecha, cantidad de días y saldo resultante.
- **FR-010**: El sistema DEBE incrementar automáticamente, una vez al año en una
  fecha configurable (por ejemplo 1° de noviembre), el saldo de cada legajo activo
  en la cantidad de días que le corresponda según su antigüedad a esa fecha, de
  acuerdo con una escala configurable de antigüedad → días.
  - La escala inicial DEBE ser: menos de 5 años de antigüedad = 14 días; de 5 años
    (inclusive) a menos de 10 = 21 días; de 10 (inclusive) a menos de 20 = 28 días;
    20 años (inclusive) o más = 35 días.
- **FR-011**: Tanto la fecha configurable de incremento anual como la escala de
  antigüedad → días DEBEN mantenerse en un archivo de configuración externo y
  editable, sin requerir cambios de código ni una nueva versión del sistema para
  modificarlas.
- **FR-012**: El incremento automático anual NO DEBE aplicarse a legajos inactivos
  ni a legajos sin fecha de ingreso cargada; estos últimos DEBEN señalarse en la
  página de control como pendientes de completar ese dato.
- **FR-013**: El incremento automático anual DEBE sumarse al saldo existente del
  legajo, incluyendo saldos negativos, sin llevarlo a cero ni a un mínimo antes de
  sumar.
- **FR-014**: Un usuario responsable DEBE poder revertir una asignación de
  vacaciones vigente; la reversión DEBE restituir al saldo del legajo la cantidad
  de días que esa asignación había descontado, DEBE quitar la marca `Vacaciones`
  de los días de su calendario, y DEBE quedar registrada (autor y fecha/hora),
  permaneciendo la asignación original visible como no vigente en vez de
  eliminarse.
- **FR-015**: El sistema DEBE rechazar la reversión de una asignación de
  vacaciones que ya no está vigente.
- **FR-016**: Registrar una asignación de vacaciones DEBE dejar constancia de:
  legajo, fecha de inicio, cantidad de días, fecha de fin resultante, autor de la
  carga y fecha/hora de la carga.
- **FR-017**: Si llegan fichadas nuevas de un legajo para un día marcado como
  `Vacaciones` por una asignación vigente, el sistema DEBE señalar ese día para
  revisión de un responsable en lugar de descartar la marca o las fichadas en
  silencio.
- **FR-018**: El sistema DEBE deshabilitar la entrada `vacaciones` del catálogo de
  motivos de Justificación (feature 012) para nuevas cargas, de modo que una
  ausencia por vacaciones solo pueda registrarse a través de esta feature; las
  Justificaciones ya cargadas con ese motivo antes de este cambio DEBEN conservar
  su registro y clasificación de pago histórica sin alteración.

### Key Entities *(include if feature involves data)*

- **Antigüedad de Empleado**: fecha de ingreso asociada a un legajo, de la cual se
  deriva la antigüedad a cualquier fecha dada. Proviene de la sincronización
  extendida del padrón de Oracle RRHH (feature 003); no se carga manualmente en el
  flujo normal.
- **Saldo de Vacaciones**: cantidad de días de vacaciones disponibles de un legajo
  en un momento dado. Puede ser negativo. Resulta de acumular los incrementos
  anuales y restar los días de las asignaciones vigentes.
- **Movimiento de Saldo de Vacaciones**: registro individual que modifica el saldo
  de un legajo (incremento anual o descuento por asignación/reversión), con fecha,
  cantidad de días (positiva o negativa) y saldo resultante. Compone el historial
  de la página de control.
- **Asignación de Vacaciones**: registro que vincula un legajo con un período de
  vacaciones (fecha de inicio, cantidad de días corridos, fecha de fin derivada),
  quién la cargó y cuándo, y si está vigente o fue revertida (y por quién/cuándo).
  Genera un día tipo `Vacaciones` (`No paga`) en el calendario del legajo para
  cada día del rango.
- **Escala de Antigüedad → Días**: tabla configurable que define, para cada tramo
  de antigüedad, la cantidad de días de vacaciones que corresponde acreditar en el
  incremento anual.
- **Configuración de Incremento Anual**: fecha (día y mes) en la que el sistema
  aplica el incremento automático de saldo a todos los legajos activos con fecha
  de ingreso cargada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable puede asignar un período de vacaciones a un empleado
  (fecha de inicio y cantidad de días) en menos de 1 minuto.
- **SC-002**: El 100% de las asignaciones de vacaciones vigentes quedan reflejadas
  correctamente tanto en el saldo del legajo como en su calendario (marca
  `Vacaciones` en cada día del rango), sin necesidad de un paso manual adicional.
- **SC-003**: El incremento automático anual se aplica, en la fecha configurada, al
  100% de los legajos activos con fecha de ingreso cargada, sin intervención manual
  legajo por legajo.
- **SC-004**: Un responsable puede consultar el saldo actual y la antigüedad de
  cualquier legajo, junto con el historial completo de movimientos que explican ese
  saldo, en una única página.
- **SC-005**: Modificar la fecha de incremento anual o la escala de antigüedad →
  días no requiere ninguna intervención de desarrollo ni una nueva versión
  desplegada del sistema.

## Assumptions

- El rol habilitado para asignar vacaciones, configurar la escala/fecha de
  incremento y revertir asignaciones es el mismo responsable de administración de
  personal que ya opera las Justificaciones (feature 012) y las Correcciones
  Manuales (feature 004); no se introduce un rol nuevo, en línea con que el
  sistema hoy no tiene autenticación ni permisos diferenciados (feature 014).
- La tabla de escala de antigüedad → días y la configuración de fecha de
  incremento anual se implementan como archivos de configuración editables,
  siguiendo el mismo patrón que `config/categorias.json` y
  `config/motivos-ausencia.json`.
- Esta feature no reutiliza el catálogo de motivos de Justificación (`config/
  motivos-ausencia.json`, feature 012) para marcar los días de vacaciones: genera
  el día tipo `Vacaciones` de forma automática y directa (FR-006), sin pasar por
  ese catálogo. Para evitar que una misma ausencia pueda registrarse por dos
  caminos distintos (esta feature y la Justificación genérica), la entrada
  `vacaciones` del catálogo de motivos queda deshabilitada para nuevas
  Justificaciones a partir de esta feature; las Justificaciones ya cargadas con ese
  motivo antes de esta feature conservan su registro y clasificación histórica
  (`Paga`) sin cambios.
- El ajuste manual del saldo de vacaciones (por fuera del incremento anual
  automático y del descuento por asignación/reversión) queda fuera de alcance de
  esta primera versión; cualquier corrección de saldo se resuelve revirtiendo y
  volviendo a cargar la asignación correspondiente.
- No se contempla un límite máximo de saldo negativo ni un paso de aprobación
  adicional cuando una asignación deja el saldo en negativo: el sistema la permite
  siempre que la fecha de inicio y la cantidad de días sean válidas.
- La generación de los días de calendario para meses futuros necesarios para
  reflejar una asignación de vacaciones se apoya en el mecanismo de calendario ya
  existente (features 007/008), sin cambios adicionales a esa generación.
