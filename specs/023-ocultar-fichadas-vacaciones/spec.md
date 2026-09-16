# Feature Specification: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature Branch**: `023-ocultar-fichadas-vacaciones`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Caso excepcional, fichadas durante vacaciones asignadas. el comportamiento en la pagina fichadas-hoy y resumen-periodo es correcto, pero quiero ocultar las fichadas en los informes generados."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emitir un informe de detalle sin fichadas de días de vacaciones (Priority: P1)

Un responsable de administración de personal emite el informe de detalle de
asistencia (al cierre del período, en el informe mensual, o en el anticipado de
la primera quincena) de un período en el que un empleado tuvo, dentro de una
asignación de vacaciones vigente, fichadas registradas por el reloj biométrico
(caso excepcional: el empleado marcó entrada/salida un día que ya tenía
vacaciones asignadas). El responsable espera que ese día figure en el
documento como un día de vacaciones común, sin mostrar las horas de
entrada/salida ni ningún rastro de esas fichadas.

**Why this priority**: el informe de detalle es un documento de archivo que se
usa para liquidar sueldos y queda como constancia. Mostrar horarios fichados en
un día pagado como vacaciones genera dudas evitables en liquidación ("¿trabajó
este día o no?") y no aporta valor al documento, ya que esas fichadas nunca
acreditan jornada ni afectan el cómputo de horas (feature 015). La revisión de
esas fichadas ya tiene su propio canal en las pantallas interactivas.

**Independent Test**: con un período que tiene, para al menos un empleado, un
día marcado `Vacaciones` por una asignación vigente y con fichadas registradas
ese día, se emite el informe de detalle de asistencia y se verifica que ese día
aparece clasificado `Vacaciones` sin horas de entrada, salida ni pausas, igual
que un día de vacaciones sin ninguna fichada.

**Acceptance Scenarios**:

1. **Given** un día marcado `Vacaciones` por una asignación vigente y con
   fichadas de entrada y salida registradas ese día, **When** se emite el
   informe de detalle de asistencia del período, **Then** el renglón de ese día
   muestra la clasificación `Vacaciones` con las horas de entrada, salida y
   pausas vacías, sin ningún indicio de las fichadas registradas.
2. **Given** un día marcado `Vacaciones` con una fichada de entrada sin salida
   registrada, **When** se emite el informe de detalle, **Then** ese día
   figura igual que un día de vacaciones sin fichadas (sin marcarlo como
   jornada incompleta ni como pendiente de revisión).
3. **Given** un día marcado `Vacaciones` sin ninguna fichada registrada,
   **When** se emite el informe de detalle, **Then** el renglón es idéntico al
   de un día `Vacaciones` que sí tuvo fichadas ocultas (misma presentación en
   ambos casos).
4. **Given** el informe de resumen de horas computadas del mismo período,
   **When** se emite junto con el informe de detalle, **Then** sus contadores
   no cambian por la presencia o ausencia de fichadas en días de vacaciones: el
   día sigue contando en la columna `vacaciones`, nunca en `ausencias` ni en
   horas computadas (comportamiento ya vigente, feature 015).

---

### User Story 2 - Mantener sin cambios la revisión en las pantallas interactivas (Priority: P2)

Un administrador que trabaja en las pantallas "Fichadas de Hoy" (feature 010) y
"Resumen del Período" (feature 011) sigue viendo, igual que hoy, las fichadas
excepcionales registradas en días de vacaciones y la señal de revisión
correspondiente (feature 015, FR-017). Este comportamiento ya es correcto y no
se modifica: el ocultamiento aplica únicamente a los documentos de informe
generados, no a la consulta interactiva.

**Why this priority**: es la garantía de que esta feature no reduce la
capacidad de un administrador de detectar y resolver el caso excepcional; sólo
cambia lo que se imprime/archiva como constancia. Sin esta historia, existe el
riesgo de ocultar la fichada también en la pantalla de revisión, perdiendo la
señal que necesita un responsable para resolver la anomalía.

**Independent Test**: con el mismo período y el mismo día excepcional de la
Historia 1, se navega a "Fichadas de Hoy" y a "Resumen del Período" y se
verifica que las fichadas y la señal de revisión siguen visibles exactamente
como antes de esta feature.

**Acceptance Scenarios**:

1. **Given** un día marcado `Vacaciones` con fichadas registradas, **When** un
   administrador lo consulta en "Fichadas de Hoy", **Then** ve las fichadas y
   la señal de revisión igual que hoy.
2. **Given** el mismo día, **When** un administrador abre el detalle de ese
   empleado en "Resumen del Período", **Then** ve las fichadas y la señal de
   revisión igual que hoy.

---

### Edge Cases

- **Informe ya emitido antes de esta feature, con fichadas de vacaciones
  visibles en su copia guardada**: no se regenera solo; una nueva emisión (a
  demanda o en un futuro cierre) ya aplica el ocultamiento, siguiendo el mismo
  criterio que otras correcciones de presentación de los informes (features
  018/021/022: la copia impresa o descargada no se actualiza sola).
- **Asignación de vacaciones revertida (feature 015, FR-014) después de que se
  registraron las fichadas, antes de emitir el informe**: al no haber
  asignación vigente ese día, deja de clasificarse `Vacaciones`; el día se
  evalúa con las reglas normales del período (puede mostrar sus fichadas como
  cualquier otro día laborable) — el ocultamiento aplica sólo mientras el día
  está clasificado `Vacaciones` por una asignación vigente.
- **Varias fichadas el mismo día de vacaciones** (por ejemplo entrada, pausa,
  retorno y salida): todas se ocultan por igual; ninguna fracción de la
  jornada fichada aparece en el informe.
- **Día de vacaciones que además cae en feriado o fin de semana**: sigue
  mostrándose con su clasificación habitual (comportamiento ya vigente de las
  features 018/021/022); el ocultamiento de fichadas no cambia esa
  clasificación, sólo suprime horas que pudieran existir igualmente.
- **Informe de resumen de horas computadas**: no muestra horas de entrada ni
  salida por día (es un consolidado), por lo que no requiere cambios; sus
  contadores ya excluyen los días de vacaciones de `ausencias` y de horas
  computadas (feature 015) independientemente de si hubo fichadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: En el informe de detalle de asistencia (día por día, empleado por
  empleado) de los informes de cierre de período (feature 018), informe
  mensual (feature 021) e informe anticipado de la primera quincena (feature
  022), el sistema MUST NOT mostrar hora de entrada, hora de salida ni pausas
  provenientes de fichadas registradas en un día clasificado `Vacaciones` por
  una asignación de vacaciones vigente ese día.
- **FR-002**: Un día clasificado `Vacaciones` MUST presentarse en el informe de
  detalle de forma idéntica exista o no una fichada excepcional registrada ese
  día: misma clasificación, mismas columnas vacías de entrada/salida/pausas,
  sin marca de jornada incompleta ni de pendiente de revisión originada en esa
  fichada.
- **FR-003**: El ocultamiento de fichadas en los informes generados MUST NOT
  alterar el cómputo de horas, contadores ni clasificación del día: un día
  `Vacaciones` con fichadas ocultas sigue sin acreditar horas, sigue sin cargar
  como `ausencia` y sigue contando en la columna `vacaciones` del informe de
  resumen, igual que si nunca hubiera tenido fichadas (comportamiento ya
  vigente, feature 015).
- **FR-004**: El ocultamiento MUST aplicarse únicamente a los documentos de
  informe generados (informe de resumen e informe de detalle de las features
  018, 021 y 022); las pantallas interactivas "Fichadas de Hoy" (feature 010) y
  "Resumen del Período" (feature 011) MUST seguir mostrando esas fichadas y la
  señal de revisión existente (feature 015, FR-017) sin cambios.
- **FR-005**: El sistema MUST seguir conservando el registro de las fichadas
  ocultas (no se eliminan ni se descartan datos); el ocultamiento es
  exclusivamente de presentación en el documento del informe generado.
- **FR-006**: El sistema MUST aplicar el ocultamiento a todo día que esté
  clasificado `Vacaciones` por tener una asignación de vacaciones vigente para
  ese día en el momento de emitir el informe, sin importar cuántas fichadas
  tenga registradas ni si tiene entrada sin salida (jornada excepcional
  incompleta).
- **FR-007**: Si la asignación de vacaciones de un día ya no está vigente al
  momento de emitir el informe (por ejemplo, fue revertida), el sistema MUST
  evaluar y presentar ese día con las reglas normales del período (sin aplicar
  el ocultamiento de esta feature), igual que cualquier día que no está
  clasificado `Vacaciones`.

## Key Entities *(include if feature involves data)*

- **Día de calendario del legajo**: unidad ya existente (features 004/015) con
  su clasificación (`Vacaciones`, `Laborable`, etc.); esta feature no agrega un
  atributo nuevo, sólo cambia cómo se presenta en los informes generados
  cuando su clasificación es `Vacaciones` y tiene fichadas asociadas.
- **Fichada**: registro ya existente del reloj biométrico (legajo, fecha/hora);
  esta feature no cambia su almacenamiento ni su tratamiento en las pantallas
  interactivas, sólo su visibilidad dentro del documento de informe generado
  cuando corresponde a un día `Vacaciones`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los días clasificados `Vacaciones` en un informe de
  detalle generado se presentan sin horas de entrada, salida ni pausas,
  independientemente de si tuvieron fichadas registradas.
- **SC-002**: Un responsable de liquidación que revisa el informe de detalle no
  puede distinguir, a partir del documento, si un día de vacaciones tuvo o no
  una fichada excepcional: ambos casos se ven idénticos.
- **SC-003**: Ningún cambio de esta feature modifica el total de horas
  computadas ni los contadores (`ausencias`, `vacaciones`, etc.) de ningún
  informe respecto de lo que ya mostraban antes de esta feature.
- **SC-004**: Las pantallas "Fichadas de Hoy" y "Resumen del Período" siguen
  mostrando el 100% de las fichadas y señales de revisión de días de
  vacaciones exactamente como antes de esta feature (cero regresión).

## Assumptions

- El ocultamiento aplica a los tres informes que comparten el formato de
  detalle día por día (features 018, 021 y 022), ya que la 021 y la 022 ya
  declaran reutilizar la presentación y contenido de la 018.
- El informe de resumen de horas computadas no requiere cambios porque ya es
  un consolidado sin columnas de entrada/salida por día, y sus contadores ya
  excluyen los días `Vacaciones` de `ausencias` y de horas computadas
  (feature 015) sin importar si hubo fichadas.
- La señal de "pendiente de revisión" para un responsable (feature 015,
  FR-017) es una herramienta de trabajo de las pantallas interactivas, no un
  contenido que deba aparecer en el documento de informe generado; por eso se
  oculta junto con la fichada en el informe, sin necesitar un reemplazo visual
  en el documento.
- No se requiere regenerar automáticamente informes ya emitidos/guardados
  antes de esta feature; se sigue el mismo criterio ya vigente de que una copia
  emitida no se actualiza sola.
