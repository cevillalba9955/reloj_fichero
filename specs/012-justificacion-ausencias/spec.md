# Feature Specification: Justificación de Ausencias

**Feature Branch**: `012-justificacion-ausencias`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Justificacion Ausencias : dias habiles, empleados sin fichadas, nueva accion : Justificacion. deja registro del motivo de la ausencia. Opciones selecionables de lista [Sin Aviso, Aviso Justificado, Enfermedad, ART, Nacimiento, Fallecimiento, Vacaciones, Matrimonio, Examen]. las opciones Sin Aviso, Aviso Justificado corresponden a dias NO PAGOS, el resto de las opciones se consideran AUSENCIAS PAGAS. crear archivo json para que sea extensible"

## Clarifications

### Session 2026-07-20

- Q: ¿La Justificación se carga día por día, o se debe poder seleccionar un rango de
  fechas para aplicar el mismo motivo a varios días en una sola acción? → A: Permite
  rango de fechas: una sola acción aplica el motivo a cada día `Laborable` elegible
  dentro del rango `[desde, hasta]`.
- Q: ¿Se puede registrar una Justificación para un día futuro, o solo una vez que el
  día ya pasó y quedó confirmado `Sin fichadas`? → A: Permite días futuros: cubre
  licencias planificadas con anticipación (Vacaciones, Matrimonio); cuando el día
  futuro llega y transcurre, el sistema valida igual que con cualquier día pasado.
- Q: ¿Una Justificación `Paga` acredita la jornada esperada como cumplida en el
  cálculo de horas/saldo del período (como un `Feriado` en la feature 004), o queda
  solo como dato informativo? → A: Acredita la jornada esperada como cumplida, igual
  que un `Feriado`; una Justificación `No paga` no acredita nada y el día sigue
  contando como ausencia en el saldo, ahora con motivo documentado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar el motivo de una ausencia (Priority: P1)

Como responsable de administración de personal, quiero registrar el motivo de la
ausencia de un empleado en uno o varios días hábiles —ya sea porque no tiene ninguna
fichada en un día que ya pasó, o porque se trata de una licencia planificada para
días futuros—, eligiéndolo de una lista cerrada de motivos, para dejar constancia
auditable de por qué faltó, si esa ausencia es paga o no paga, y que el período
refleje correctamente los días cubiertos.

**Why this priority**: hoy un día hábil sin fichadas queda como `Sin fichadas` sin
ninguna explicación registrada. Sin esta acción, administración de personal no tiene
forma de distinguir —dentro del propio sistema— una falta sin aviso de una licencia
por enfermedad o unas vacaciones, y esa distinción es la que después define si el día
se paga y si acredita jornada esperada. Es el valor central de la feature y funciona
de forma independiente.

**Independent Test**: se puede probar completo tomando un legajo con un día
`Laborable` sin ninguna fichada, ejecutando la acción "Justificación" con un motivo
de la lista (por ejemplo `Vacaciones`), y verificando que el día queda registrado con
ese motivo, su clasificación de pago (`Paga`/`No paga`) y quién y cuándo lo cargó.
También se puede probar cargando un rango de varios días futuros con el mismo motivo
en una sola acción y verificando que cada día `Laborable` del rango queda registrado
individualmente.

**Acceptance Scenarios**:

1. **Given** un día `Laborable` del legajo `1234` sin ninguna fichada, **When** un
   responsable registra una Justificación con motivo `Enfermedad`, **Then** el día
   queda con esa Justificación registrada, clasificada como `Paga`, con autor y
   fecha/hora de carga.
2. **Given** la misma situación, **When** el responsable registra una Justificación
   con motivo `Sin Aviso`, **Then** el día queda registrado con ese motivo,
   clasificado como `No paga`.
3. **Given** un intento de registrar una Justificación sin seleccionar ningún motivo,
   **When** se envía la acción, **Then** el sistema la rechaza.
4. **Given** un día `Laborable` que ya tiene al menos una fichada del legajo,
   **When** se intenta registrar una Justificación sobre ese día, **Then** el sistema
   la rechaza indicando que el día no está sin fichadas.
5. **Given** un día `No Laborable` o `Feriado`, **When** se intenta registrar una
   Justificación sobre ese día, **Then** el sistema la rechaza indicando que la
   acción no aplica a ese tipo de día.
6. **Given** un rango de fechas futuras que incluye 5 días `Laborable` y 2 días
   `No Laborable` (un fin de semana), **When** el responsable registra una
   Justificación con motivo `Vacaciones` para ese rango, **Then** los 5 días
   `Laborable` quedan registrados con esa Justificación y los 2 días
   `No Laborable` se omiten automáticamente, sin generar error.
7. **Given** un rango de fechas que incluye un día futuro `Laborable` y un día
   pasado `Laborable` que ya tiene fichadas del legajo, **When** el responsable
   registra la Justificación para ese rango, **Then** el día futuro queda
   registrado y el día con fichadas se informa como no aplicable, sin bloquear la
   carga del resto del rango.
8. **Given** un día futuro justificado como `Paga` por `Vacaciones`, **When** se
   calcula el resumen del período que contiene ese día, **Then** el día acredita la
   jornada esperada como cumplida, igual que un `Feriado`, y no genera saldo
   negativo.

---

### User Story 2 - Consultar el motivo y la condición de pago de una ausencia (Priority: P2)

Como responsable de liquidación o auditor, quiero ver, para cada día justificado de
un empleado, qué motivo se cargó, si corresponde a una ausencia paga o no paga, y
quién lo registró, para poder liquidar el período correctamente y responder cualquier
consulta sobre una ausencia puntual.

**Why this priority**: registrar el motivo (User Story 1) no genera valor si después
no se puede consultar de forma clara junto con el resto de la información del
empleado y del período. Depende de que existan Justificaciones cargadas.

**Independent Test**: se puede probar completo tomando un empleado con uno o más días
justificados con distintos motivos, y verificando que el detalle del empleado y el
resumen del período muestran, para cada día, el motivo, la clasificación de pago y
los datos de auditoría de la carga.

**Acceptance Scenarios**:

1. **Given** un legajo con un día justificado por `Vacaciones`, **When** se consulta
   el detalle de ese empleado, **Then** el día muestra el motivo `Vacaciones` y su
   clasificación `Paga`.
2. **Given** un período con varios legajos con días justificados por distintos
   motivos, **When** se consulta el resumen del período, **Then** se puede
   distinguir, para cada legajo, cuántos días de ausencia son pagos y cuántos no
   pagos.

---

### User Story 3 - Revertir una Justificación cargada por error (Priority: P3)

Como responsable de administración de personal, quiero poder revertir una
Justificación que cargué con el motivo equivocado, dejando constancia de la
reversión, para poder corregir un error sin perder la trazabilidad de lo que pasó.

**Why this priority**: no bloquea el valor central de la feature (registrar y
consultar motivos), pero es necesario para operar con confianza: un error de tipeo
o de selección no debe quedar irreversible ni debe borrarse en silencio.

**Independent Test**: se puede probar completo tomando un día con una Justificación
vigente, revirtiéndola, y verificando que el día vuelve a quedar `Sin fichadas` sin
motivo vigente, con la reversión registrada (quién y cuándo) y la Justificación
original visible como no vigente.

**Acceptance Scenarios**:

1. **Given** un día con una Justificación vigente por `Aviso Justificado`, **When**
   el responsable la revierte, **Then** el día deja de tener una Justificación
   vigente, la anterior queda visible como revertida (no vigente) con quién y cuándo
   la revirtió, y el sistema permite cargar una nueva Justificación sobre ese día.
2. **Given** un día sin ninguna Justificación vigente, **When** se intenta
   revertir, **Then** el sistema rechaza la acción indicando que no hay nada que
   revertir.

---

### Edge Cases

- **Día ya justificado**: si el legajo y el día ya tienen una Justificación vigente,
  el sistema rechaza cargar una segunda sin revertir antes la existente (evita
  motivos contradictorios sobre el mismo día). En una carga por rango, ese día
  puntual se informa como no aplicable y el resto del rango se procesa igual.
- **Fichadas que llegan después de justificar**: si tras registrar una Justificación
  (pasada o futura) aparecen fichadas de ese legajo para ese día, el sistema no
  descarta la Justificación en silencio; señala el día para revisión de un
  responsable, ya que el empleado terminó presentándose pese a estar justificado.
- **Rango de fechas sin ningún día elegible**: si el rango solicitado no contiene
  ningún día `Laborable` elegible (todo `No Laborable`/`Feriado`, o todos con
  fichadas o ya justificados), el sistema rechaza la acción completa e indica que no
  hay días para justificar, en vez de crear un registro vacío.
- **Motivo eliminado o desactivado del catálogo**: las Justificaciones ya cargadas
  con ese motivo conservan su etiqueta y clasificación de pago tal como se cargaron;
  el motivo desactivado deja de ofrecerse para nuevas Justificaciones.
- **Catálogo de motivos vacío o inválido**: el sistema no permite registrar nuevas
  Justificaciones y reporta la anomalía de configuración, en vez de aceptar un
  motivo libre.
- **Reclasificación del día** (de `Laborable` a `No Laborable` o `Feriado`) con una
  Justificación vigente: el sistema señala el día para revisión de un responsable,
  igual que ante una reclasificación con una Corrección Manual vigente.
- **Justificación futura sobre un día que termina siendo `Feriado`**: si entre la
  carga y la fecha el día se reclasifica de `Laborable` a `Feriado`, aplica el mismo
  tratamiento que la reclasificación general: el día queda señalado para revisión en
  vez de mantener silenciosamente una Justificación sobre un día que ya no es
  `Laborable`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer una acción "Justificación" para registrar el
  motivo de una ausencia sobre un día `Laborable` de un legajo, ya sea un día pasado
  cuyo estado de jornada sea `Sin fichadas`, o un día futuro todavía no transcurrido
  (licencia planificada con anticipación).
- **FR-002**: El sistema DEBE rechazar la acción "Justificación" sobre un día
  `No Laborable`, `Feriado`, o sobre un día pasado `Laborable` que ya tiene al menos
  una fichada del legajo (estado `Incompleta` o `Completa`).
- **FR-003**: El motivo DEBE seleccionarse de una lista cerrada (catálogo de
  motivos), no como texto libre, y el sistema DEBE rechazar la acción si no se
  selecciona ningún motivo.
- **FR-003a**: El sistema DEBE permitir registrar una Justificación sobre un rango de
  fechas `[desde, hasta]` con un único motivo, aplicando un registro por cada día
  `Laborable` elegible dentro del rango; los días `No Laborable`/`Feriado` del rango
  se omiten automáticamente y los días no elegibles (ya con fichadas o ya
  justificados) se informan como no aplicables sin bloquear el resto del rango.
- **FR-004**: El catálogo de motivos, en su carga inicial, DEBE incluir exactamente
  estas opciones: `Sin Aviso`, `Aviso Justificado`, `Enfermedad`, `ART`,
  `Nacimiento`, `Fallecimiento`, `Vacaciones`, `Matrimonio`, `Examen`.
- **FR-005**: Cada motivo del catálogo DEBE tener asociada una clasificación de pago
  fija: `No paga` para `Sin Aviso` y `Aviso Justificado`; `Paga` para el resto
  (`Enfermedad`, `ART`, `Nacimiento`, `Fallecimiento`, `Vacaciones`, `Matrimonio`,
  `Examen`).
- **FR-006**: El catálogo de motivos DEBE mantenerse en un archivo de configuración
  externo y editable (agregar, renombrar o reclasificar motivos como `Paga`/`No
  paga`) sin requerir cambios de código ni una nueva versión del sistema.
- **FR-007**: Registrar una Justificación DEBE dejar constancia de: legajo, fecha del
  día justificado, motivo elegido, clasificación de pago resultante, autor de la
  carga y fecha/hora de la carga.
- **FR-008**: El sistema DEBE impedir que un mismo día de un legajo tenga más de una
  Justificación vigente al mismo tiempo.
- **FR-009**: Un usuario responsable DEBE poder revertir una Justificación vigente;
  la reversión DEBE quedar registrada (autor y fecha/hora) y la Justificación
  original DEBE permanecer visible como no vigente, sin eliminarse.
- **FR-010**: Si llegan fichadas nuevas de un legajo para un día con una
  Justificación vigente, el sistema DEBE señalar ese día para revisión de un
  responsable en lugar de descartar la Justificación o las fichadas en silencio.
- **FR-011**: El detalle de un empleado y el resumen de un período DEBEN mostrar,
  para cada día justificado, el motivo y su clasificación de pago (`Paga`/`No
  paga`).
- **FR-012**: El resumen de un período DEBE permitir distinguir, por legajo, la
  cantidad de días de ausencia justificados como `Paga` y como `No paga`.
- **FR-013**: Un día con una Justificación vigente clasificada como `Paga` DEBE
  acreditar la jornada esperada de ese día como cumplida en el cálculo de horas del
  período (mismo tratamiento que un día `Feriado` en la feature 004), sin generar
  saldo negativo por ese día.
- **FR-014**: Un día con una Justificación vigente clasificada como `No paga` NO DEBE
  acreditar jornada esperada; el día sigue contando como ausencia en el saldo de
  horas del período, ahora con el motivo documentado en vez de quedar sin explicar.

### Key Entities *(include if feature involves data)*

- **Justificación de Ausencia**: registro que vincula un legajo y un día `Laborable`
  con un motivo del catálogo, su clasificación de pago (`Paga`/`No paga`), quién la
  cargó y cuándo, y si está vigente o fue revertida (y por quién/cuándo). Es
  análoga en su modelo de auditoría a la Corrección Manual de 004, pero sustituye
  al vacío de un día `Sin fichadas` en vez de corregir horas ya calculadas.
- **Motivo de Ausencia (catálogo)**: entrada configurable con una etiqueta visible
  (por ejemplo `Vacaciones`) y una clasificación de pago fija (`Paga` o `No paga`).
  El catálogo es extensible: se pueden agregar, renombrar o reclasificar motivos sin
  cambiar código.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un responsable puede registrar la Justificación de una ausencia
  (seleccionar motivo y confirmar) en menos de 1 minuto.
- **SC-002**: El 100% de las Justificaciones registradas quedan con motivo, autor y
  fecha/hora trazables al consultarlas posteriormente.
- **SC-003**: Agregar o modificar un motivo del catálogo (etiqueta o clasificación
  de pago) no requiere ninguna intervención de desarrollo ni una nueva versión
  desplegada del sistema.
- **SC-004**: El resumen de un período distingue, para el 100% de los días
  justificados de un legajo, si la ausencia es paga o no paga, sin cálculo manual
  adicional por parte del responsable de liquidación.

## Assumptions

- La acción "Justificación" aplica a días `Laborable`: días pasados cuyo estado de
  jornada calculado es `Sin fichadas` (ninguna fichada del legajo ese día), o días
  futuros aún no transcurridos. Un día pasado `Incompleta` (con alguna fichada) se
  resuelve con la Corrección Manual existente (feature 004), no con esta acción.
- El catálogo de motivos se implementa como un archivo de configuración editable,
  siguiendo el mismo estilo que el catálogo de categorías/modalidades ya existente
  en el sistema (`config/categorias.json`).
- El rol habilitado para registrar y revertir una Justificación es el mismo
  responsable de administración de personal que hoy puede aplicar una Corrección
  Manual (feature 004); no se introduce un rol nuevo.
- Solo puede haber una Justificación vigente por legajo y día; para cambiar de
  motivo hay que revertir la vigente y cargar una nueva (mismo patrón que la
  Corrección Manual: vigente + reversión auditada, nunca sobrescritura silenciosa).
- Una carga por rango de fechas produce un registro de Justificación por cada día
  `Laborable` elegible dentro del rango (no un único registro que abarque varios
  días); esto mantiene el mismo modelo por día que ya usan el Calendario del mes y
  la Corrección Manual de la feature 004.
- Acreditar la jornada esperada de un día con Justificación `Paga` (FR-013) modifica
  el cálculo de horas/saldo del período de la feature 004 y su resumen (feature
  011): ambas quedan como dependencia de esta feature para la parte de cálculo,
  aunque el registro del motivo en sí (User Story 1 y 2) es independiente y
  entregable primero.
