# Feature Specification: Licencia Paga sobre Días con Fichadas y Retiro Anticipado como Salida

**Feature Branch**: `041-licencia-paga-con-fichadas`

**Created**: 2026-11-19

**Status**: Implemented (documentación retroactiva — el comportamiento ya está en la rama `040-ux-resumen-periodo`, commits `ca78d9d` y `9399a28`)

**Input**: User description: "Caso puntual: legajo 9, 02/11/26. Se pisan fichadas, retiro anticipado y licencia. Debe tomar como licencia las horas descontadas por el retiro. Automático: si hay justificación paga se completa el total de horas del día, incluso cuando el empleado ficha salida antes del horario normal, sin marcarlo como retiro. El retiro hace de salida."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Licencia Paga completa el día aunque haya fichadas (Priority: P1)

Un responsable de administración de personal carga una licencia paga (por ejemplo,
fallecimiento de un familiar) sobre un rango de días. Algunos días del rango ya
tienen fichadas porque el empleado se presentó parte de la jornada y luego se
retiró por la licencia. El responsable espera que esos días queden justificados
igual que los días sin fichadas, y que el empleado cobre la jornada completa:
las horas realmente trabajadas más, como licencia, lo que faltó hasta completar
la jornada esperada.

**Why this priority**: es el caso real que motivó el cambio. Antes, el día con
fichadas se rechazaba en la carga de la licencia y, al quedar sin justificar, el
empleado cobraba solo las horas fichadas (o ninguna, si faltaba la salida),
perjudicándolo en la liquidación por una licencia que le corresponde.

**Independent Test**: con un empleado que ficha entrada a las 07:00 y salida a
las 14:00 (jornada esperada de 9:00) en un día laborable, cargar una licencia
Paga sobre ese día; verificar que el día queda justificado y que el total a cobrar
es 9:00, de las cuales 7:00 son trabajadas y 2:00 son licencia.

**Acceptance Scenarios**:

1. **Given** un día laborable con fichadas de entrada y salida y la jornada
   incompleta respecto de la esperada, **When** se carga una licencia con motivo
   `Paga` sobre ese día, **Then** el sistema registra la justificación y el día
   pasa a acreditar la jornada esperada completa.
2. **Given** un rango de días con licencia `Paga` donde algunos días tienen
   fichadas y otros no, **When** se carga el rango, **Then** todos los días
   laborables del rango quedan justificados (los no laborables se omiten como
   hasta ahora) y los ya justificados se informan como no aplicables.
3. **Given** un día con licencia `Paga` donde el empleado ficha la salida antes
   del horario normal sin marcar un retiro anticipado, **When** se calcula el día,
   **Then** el total es la jornada esperada y la diferencia respecto de lo
   trabajado figura como licencia.
4. **Given** un día con licencia `Paga` donde las horas trabajadas igualan o
   superan la jornada esperada, **When** se calcula el día, **Then** el total no
   baja de lo trabajado y no se acredita licencia adicional.

---

### User Story 2 - Un retiro anticipado hace de salida cuando falta la fichada (Priority: P1)

Un administrador registra un retiro anticipado para un empleado que fichó la
entrada pero no fichó la salida (se fue sin marcar). El administrador espera que
el sistema tome la hora de inicio del retiro como la salida del empleado, en vez
de dejar el día incompleto y con cero horas.

**Why this priority**: sin esto el caso de referencia no se puede resolver: el
día queda "Incompleta" con 0 horas aunque exista un retiro cargado que dice
exactamente a qué hora se fue el empleado.

**Independent Test**: empleado con una fichada de entrada a las 06:49 y ninguna
de salida, más un retiro anticipado de 12:00 a 16:00; verificar que el día pasa a
Completa con 5:00 trabajadas (07:00 a 12:00).

**Acceptance Scenarios**:

1. **Given** un día laborable con entrada y sin salida, y un retiro anticipado
   vigente, **When** se calcula el día, **Then** el día queda Completa y las
   horas trabajadas son las comprendidas entre la entrada (ajustada por la
   tolerancia de apertura) y el inicio del retiro, truncadas a la grilla de 30
   minutos.
2. **Given** el mismo día con retiro, **When** el retiro empieza antes de la
   entrada efectiva, **Then** el día cuenta 0 horas trabajadas.
3. **Given** un día con entrada y sin salida y **sin** retiro anticipado,
   **When** se calcula el día, **Then** sigue Incompleta, sin cambios.
4. **Given** un día con corrección manual vigente, **When** se calcula el día,
   **Then** la corrección prevalece y el retiro no altera su resultado.

---

### User Story 3 - La licencia No paga mantiene sus reglas (Priority: P2)

Un responsable carga una justificación con motivo `No paga` (por ejemplo,
ausencia sin aviso). Sigue valiendo que solo puede aplicarse a días sin fichadas
y que nunca acredita horas; si llegan fichadas a un día ya justificado como No
paga, el día se señala para revisión y no cuenta como presente.

**Why this priority**: acota el cambio de la historia 1 a las licencias pagas y
evita que una carga No paga anule horas realmente trabajadas.

**Independent Test**: intentar cargar un motivo No paga sobre un día con
fichadas y verificar que se rechaza como "no aplicable".

**Acceptance Scenarios**:

1. **Given** un día laborable con fichadas, **When** se intenta cargar una
   justificación `No paga`, **Then** el sistema la rechaza como no aplicable.
2. **Given** un día con justificación `No paga` vigente al que llegan fichadas
   después, **When** se calcula el día, **Then** cuenta 0 horas, no cuenta como
   presente y queda señalado para revisión.

---

### User Story 4 - El resumen del período separa lo trabajado de la licencia (Priority: P1)

Un responsable consulta el resumen del período. Espera ver, para un día con
licencia sobre fichadas, las horas trabajadas en la columna Presentes y las
horas acreditadas por licencia en la columna Licencia, de modo que ambas sumen
las "Horas a cobrar" y no se dupliquen.

**Why this priority**: sin esta separación, el día se contaría completo en
ambas columnas y las columnas no cerrarían contra el total.

**Independent Test**: el caso de referencia (ver abajo) debe mostrar Presentes
`1 (5:00)`, Licencia `1 (4:00)` y Horas a cobrar 9:00.

**Acceptance Scenarios**:

1. **Given** el caso de referencia (legajo 9, 02/11/2026: entrada 06:49, sin
   salida, retiro anticipado 12:00–16:00, licencia por fallecimiento `Paga`),
   **When** se consulta el resumen del período, **Then** el día aporta 5:00 a
   Presentes, 4:00 a Licencia, 9:00 a Horas a cobrar y 4 horas de descuento a
   Retiros.
2. **Given** un período con días con licencia sobre fichadas, **When** se
   calcula el presentismo individual, **Then** el numerador cuenta solo las horas
   trabajadas, sin las horas acreditadas por licencia.

---

### Edge Cases

- Licencia `Paga` sobre un día `Feriado` con fichadas descartadas: el total no
  baja de la jornada esperada y no se acredita licencia adicional (el feriado ya
  acredita la jornada).
- Retiro anticipado con más de una pausa de retiro en el día: la salida es el
  inicio del retiro más temprano.
- Licencia `Paga` sobre un día sin fichadas: se mantiene el comportamiento previo
  (se acredita la jornada esperada completa como licencia).
- Día con corrección manual de horario o de total: la corrección prevalece sobre
  la licencia y el retiro, igual que antes.
- Las licencias ya cargadas antes de este cambio no se modifican: los días con
  fichadas que habían quedado sin justificar requieren volver a cargar la
  licencia sobre ese rango para aplicarse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir cargar una justificación con motivo `Paga`
  sobre un día laborable que ya tiene fichadas del empleado, tanto en la carga de
  un día único como de un rango.
- **FR-002**: El sistema DEBE seguir rechazando como no aplicable una
  justificación con motivo `No paga` sobre un día laborable con fichadas.
- **FR-003**: Un día con justificación `Paga` vigente y con fichadas DEBE
  acreditar como total la jornada esperada, o las horas trabajadas si estas la
  superan; nunca menos que lo trabajado.
- **FR-004**: Para un día con justificación `Paga` y fichadas, el sistema DEBE
  registrar por separado las horas trabajadas y las horas acreditadas como
  licencia, con licencia = total − trabajado.
- **FR-005**: El comportamiento de FR-003 DEBE aplicar también cuando el empleado
  fichó la salida antes del horario normal sin marcar un retiro anticipado.
- **FR-006**: Un día con justificación `No paga` vigente y con fichadas DEBE
  contar 0 horas, no contar como presente y quedar señalado para revisión; no se
  acredita licencia.
- **FR-007**: Cuando un día laborable tiene entrada, no tiene salida y tiene al
  menos un retiro anticipado vigente, el sistema DEBE tomar el inicio del retiro
  más temprano como hora de salida: el día pasa a Completa y sus horas son las
  comprendidas entre la entrada efectiva y esa salida, truncadas a múltiplos de
  30 minutos y acotadas a la jornada esperada.
- **FR-008**: Si el retiro empieza antes de la entrada efectiva, el día DEBE
  contar 0 horas trabajadas.
- **FR-009**: Una corrección manual vigente DEBE prevalecer sobre FR-007 y
  FR-003; el retiro no modifica el resultado de un día corregido.
- **FR-010**: En el resumen del período, la columna Licencia DEBE mostrar los
  días con justificación `Paga` y, entre paréntesis, las horas acreditadas como
  licencia; la columna Presentes DEBE mostrar los días completos y, entre
  paréntesis, solo las horas trabajadas.
- **FR-011**: Las horas a cobrar de un período DEBEN incluir las horas
  trabajadas y las acreditadas por licencia; el presentismo individual DEBE
  calcularse únicamente con las horas trabajadas.
- **FR-012**: El descuento mostrado para Retiros y para Llegadas tarde DEBE
  seguir calculándose como antes (redondeado hacia arriba a la grilla de 30
  minutos y acotado a la jornada esperada), por lo que en el caso de un retiro
  cubierto por licencia el descuento y la licencia se compensan.

### Key Entities *(include if feature involves data)*

- **Justificación de Ausencia**: registro de un motivo (`Paga`/`No paga`) sobre
  un día laborable de un legajo; ahora puede existir sobre un día con fichadas
  cuando es `Paga`.
- **Jornada del día**: resultado del cálculo diario de un legajo; incorpora la
  parte de las horas acreditada como licencia, además del total y del estado.
- **Retiro anticipado**: pausa que indica la hora desde la cual el empleado deja
  de trabajar; cuando falta la fichada de salida, define la salida del día.
- **Fila del resumen del período**: acumulados por legajo; separa horas
  trabajadas, horas de licencia y descuentos por tardanza o retiro.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el caso de referencia (legajo 9, 02/11/2026), el resumen muestra
  5:00 trabajadas, 4:00 de licencia y 9:00 a cobrar, sin intervención manual
  posterior a cargar la licencia.
- **SC-002**: El 100 % de los días laborables con licencia `Paga` y fichadas
  acreditan al menos la jornada esperada completa.
- **SC-003**: Para cualquier período, Presentes + Feriados + Licencia (en horas)
  coincide con las Horas a cobrar, salvo días en curso o de vacaciones que no
  muestran horas propias.
- **SC-004**: Ninguna justificación `No paga` se registra sobre un día con
  fichadas, y ningún día con licencia `No paga` acredita horas.
- **SC-005**: Ningún empleado con licencia paga pierde horas por haber fichado
  parte de la jornada: el total a cobrar nunca es menor que antes del cambio
  para esos días.

## Assumptions

- Las reglas previas de la feature 012 se mantienen salvo su FR-002 (rechazo de
  justificar días con fichadas), que ahora aplica solo a motivos `No paga`.
- El retiro anticipado como salida (FR-007) aplica a cualquier día laborable
  incompleto con retiro, tenga o no licencia: fue confirmado por el solicitante
  como regla general.
- La jornada esperada y la grilla de 30 minutos son las ya configuradas por
  modalidad; no se introducen parámetros nuevos.
- Las licencias ya cargadas no se migran: para aplicar el cambio a días con
  fichadas ya omitidos, se vuelve a cargar la licencia sobre el rango.
- Componentes alcanzados (referencia para trazabilidad): cálculo de la jornada,
  elegibilidad de justificaciones, proyección del resumen del período y servicio
  de carga de justificaciones.
- Fuera de alcance: cambios en el informe de cierre y en la pantalla de fichadas
  de hoy; la presentación del resumen del período se documenta en el issue #40.
