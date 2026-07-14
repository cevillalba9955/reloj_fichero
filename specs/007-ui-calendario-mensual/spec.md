# Feature Specification: IU — Pantalla Principal: Calendario Mensual con Período Activo

**Feature Branch**: `007-ui-calendario-mensual`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "IU primer pantalla muestra calendario mensual, periodo actual activo, resaltando dias habiles y feriados"

## Clarifications

### Session 2026-07-14

- Q: ¿La primera pantalla es solo de lectura o permite reclasificar días? → A: Permite
  reclasificar. Desde esta misma pantalla el usuario puede cambiar la clasificación de un
  día entre `Laborable`, `No Laborable` y `Feriado`. El resto de la edición del dominio
  (generar el mes, correcciones de jornada, pausas intermedias) sigue fuera de alcance.
- Q: ¿Qué mes/período muestra la pantalla por defecto al abrirse ("período actual")? → A:
  El último calendario generado, entendido como el calendario del mes con el identificador
  `YYYYMM` más alto entre los meses ya generados (no necesariamente el mes que contiene la
  fecha de hoy). El período de liquidación activo es el de ese mes.
- Q: Al reclasificar un día desde la pantalla, ¿cómo se aplica el cambio? → A: Requiere
  confirmación explícita del usuario. Hasta que el usuario confirma, el cambio no se
  persiste ni recalcula. Al confirmar, se persiste a través del dominio (feature 004) y se
  dispara el recálculo de los períodos afectados (FR-005 de feature 004).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver de un vistazo el calendario laboral del mes (Priority: P1)

Como responsable de administración de personal, al abrir la aplicación quiero que la
primera pantalla me muestre el calendario del último mes generado como una grilla mensual,
con cada día clasificado y los días hábiles y feriados resaltados, para entender de un
vistazo cómo está armado el mes de trabajo sin tener que consultar archivos ni ejecutar
comandos.

**Why this priority**: es el propósito central de la feature y la puerta de entrada a la
aplicación. Sin esta vista, el calendario institucional (feature 004) solo es consultable
por medios técnicos; una pantalla de aterrizaje que lo muestre entrega valor por sí sola,
aunque no se agregue ninguna otra capacidad.

**Independent Test**: se puede probar completo abriendo la aplicación con al menos un
calendario ya generado y verificando que la grilla muestra todos los días del último mes
generado, cada uno con su clasificación visible, y que los días hábiles y los feriados se
distinguen a simple vista de los no laborables.

**Acceptance Scenarios**:

1. **Given** que existe al menos un calendario generado, **When** el usuario abre la
   aplicación, **Then** la primera pantalla muestra la grilla mensual del último mes
   generado (el `YYYYMM` más alto entre los generados), con todos sus días, cada uno con
   su número y su día de la semana.
2. **Given** el calendario del mes mostrado, **When** el usuario lo observa, **Then**
   cada día indica de forma visualmente distinguible si es `Laborable` (hábil),
   `No Laborable` o `Feriado`, sin depender solo del color para diferenciarlos.
3. **Given** el calendario del mes mostrado, **When** el usuario lo observa, **Then**
   los días hábiles y los feriados quedan resaltados respecto de los no laborables.
4. **Given** que el mes mostrado incluye la fecha de hoy, **When** el usuario busca hoy,
   **Then** el día correspondiente a la fecha actual está señalado dentro de la grilla.
5. **Given** que no existe ningún calendario generado, **When** el usuario abre la
   aplicación, **Then** la pantalla muestra un estado vacío claro indicando que aún no se
   generó ningún calendario, sin error ni pantalla en blanco.

---

### User Story 2 - Identificar el período de liquidación activo (Priority: P2)

Como responsable de administración de personal, quiero que la pantalla me indique cuál es
el período de liquidación activo —el del último mes generado, con su etiqueta y su rango de
fechas— y resalte dentro del calendario los días que le pertenecen, para saber sobre qué
tramo del mes estoy trabajando.

**Why this priority**: ubica al usuario en el tiempo de trabajo. Depende de que el
calendario del mes se muestre (US1), pero agrega la orientación necesaria para que la vista
no sea solo un almanaque, sino el contexto del trabajo en curso.

**Independent Test**: se puede probar completo mostrando el calendario de un mes con un
período activo definido y verificando que la pantalla nombra el período, muestra su rango
de fechas y distingue en la grilla los días incluidos en él de los que quedan fuera.

**Acceptance Scenarios**:

1. **Given** el calendario del mes mostrado con un período de liquidación activo, **When**
   el usuario abre la pantalla, **Then** se muestra la etiqueta del período activo y su
   rango de fechas.
2. **Given** un período activo que abarca el mes completo, **When** se muestra el
   calendario, **Then** todos los días del mes figuran como pertenecientes al período
   activo.
3. **Given** un período activo que abarca solo una quincena del mes, **When** se muestra
   el calendario, **Then** los días de esa quincena se distinguen visualmente de los días
   del mes que quedan fuera del período activo.
4. **Given** que no hay ningún período activo definido, **When** se muestra el
   calendario, **Then** la pantalla lo indica explícitamente (sin período activo) y aun
   así muestra la grilla del mes.

---

### User Story 3 - Reclasificar un día del calendario (Priority: P2)

Como responsable de administración de personal, quiero cambiar la clasificación de un día
—entre `Laborable`, `No Laborable` y `Feriado`— directamente desde el calendario que estoy
viendo, confirmando el cambio antes de que se aplique, para corregir un feriado, habilitar
un sábado de trabajo o marcar un día no laborable sin salir de la pantalla principal.

**Why this priority**: convierte la pantalla de una vista pasiva en la herramienta con la
que se mantiene el calendario institucional del que dependen todos los cálculos (feature
004). Depende de que el calendario se muestre (US1), pero es la acción que más valor
agrega sobre la simple visualización.

**Independent Test**: se puede probar completo tomando un día `Laborable` en el calendario
mostrado, iniciando su reclasificación a `Feriado`, verificando que nada cambia hasta
confirmar, confirmando, y comprobando que la grilla refleja la nueva clasificación y que
los períodos afectados quedaron recalculados.

**Acceptance Scenarios**:

1. **Given** un día `Laborable` en el calendario mostrado, **When** el usuario inicia su
   reclasificación a `Feriado` pero no la confirma, **Then** el día conserva su
   clasificación `Laborable`, no se persiste ningún cambio y no se recalcula ningún
   período.
2. **Given** esa misma reclasificación iniciada, **When** el usuario la confirma
   explícitamente, **Then** el día pasa a `Feriado`, la grilla refleja la nueva
   clasificación y los períodos de liquidación que incluyen ese día quedan recalculados
   (FR-005 de feature 004).
3. **Given** un día `No Laborable` (por ejemplo un sábado) en el calendario mostrado,
   **When** el usuario lo reclasifica a `Laborable` y confirma, **Then** el día queda como
   `Laborable` y su resaltado cambia en consecuencia.
4. **Given** un mes sin calendario generado (estado vacío), **When** el usuario está en esa
   pantalla, **Then** no se ofrece la acción de reclasificar, porque no hay días que
   reclasificar.

---

### User Story 4 - Consultar el calendario de otros meses (Priority: P3)

Como responsable de administración de personal, quiero poder moverme a meses anteriores y
posteriores desde la misma pantalla y volver fácilmente al mes que se abre por defecto,
para revisar cómo quedó armado un mes pasado o planificar uno futuro sin cambiar de
herramienta.

**Why this priority**: amplía la utilidad de la vista más allá del mes por defecto, pero no
es imprescindible para el valor inicial: la pantalla ya es útil mostrando solo el último
mes generado. Se puede entregar después de US1, US2 y US3.

**Independent Test**: se puede probar completo abriendo la pantalla en el mes por defecto,
navegando al mes anterior y al siguiente, verificando que la grilla y el resaltado se
actualizan al mes elegido, y volviendo al mes por defecto con un solo gesto.

**Acceptance Scenarios**:

1. **Given** la pantalla mostrando el mes por defecto, **When** el usuario avanza al mes
   siguiente, **Then** la grilla, las clasificaciones y el resaltado se actualizan al mes
   siguiente.
2. **Given** la pantalla mostrando un mes distinto del que se abre por defecto, **When** el
   usuario elige volver, **Then** la pantalla regresa al último mes generado.
3. **Given** la navegación a un mes sin calendario generado, **When** se muestra ese mes,
   **Then** aparece el mismo estado vacío claro de US1, sin error y sin ofrecer
   reclasificación.

---

### Edge Cases

- **Sin ningún calendario generado**: si no hay ni un solo mes generado, no existe "último
  generado"; la pantalla muestra un estado vacío global que indica que aún no se generó
  ningún calendario. La generación de un mes queda fuera del alcance de esta pantalla.
- **Mes sin calendario generado (navegando)**: al moverse a un mes que no tiene calendario,
  la pantalla muestra el estado vacío de ese mes y no ofrece reclasificar, en lugar de una
  grilla ambigua, un error o una pantalla en blanco.
- **Mes mostrado no incluye la fecha de hoy**: como el mes por defecto es el último
  generado (no necesariamente el mes actual), es habitual que hoy no caiga en el mes
  mostrado; en ese caso la grilla no marca ningún día como "hoy", y eso es correcto.
- **Reclasificación cancelada**: si el usuario inicia una reclasificación y no la confirma
  (la cancela o abandona), no se persiste ni recalcula nada; el día conserva su
  clasificación previa.
- **Feriado en fin de semana**: un día `Feriado` que cae sábado o domingo se muestra como
  `Feriado` (su clasificación institucional prevalece sobre el día de la semana).
- **Mes con distinta cantidad de días (28/29/30/31)**: la grilla se adapta a la cantidad
  real de días del mes, incluyendo el 29 de febrero en años bisiestos.
- **Primer/último día del mes en mitad de semana**: la grilla ubica cada día en su día de
  la semana correcto, dejando visibles los huecos iniciales/finales sin inventar días de
  meses vecinos como parte de este mes.
- **Sin período activo definido**: la pantalla muestra la grilla del mes igual e indica
  que no hay período activo, en lugar de quedar bloqueada.
- **Reclasificación de un día ya cubierto por correcciones/pausas**: la reclasificación del
  día se aplica y el dominio recalcula los períodos afectados (feature 004) preservando las
  correcciones manuales y pausas vigentes según sus propias reglas; esta pantalla no las
  descarta ni las administra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La primera pantalla de la aplicación DEBE mostrar, al iniciarse, el
  calendario del **último mes generado**, entendido como el calendario del mes con el
  identificador `YYYYMM` más alto entre los meses ya generados. Si no existe ningún
  calendario generado, DEBE mostrar el estado vacío global (FR-011).
- **FR-002**: El calendario DEBE presentarse como una grilla mensual que muestre todos los
  días del mes, cada uno con su número de día y ubicado en su día de la semana
  correspondiente.
- **FR-003**: Cada día DEBE mostrar de forma visualmente distinguible su clasificación
  institucional vigente (`Laborable`/hábil, `No Laborable` o `Feriado`), reflejando las
  reclasificaciones cuando existan.
- **FR-004**: La distinción entre clasificaciones NO DEBE depender únicamente del color:
  DEBE apoyarse también en otro recurso perceptible (etiqueta, ícono, patrón o texto) para
  ser accesible a personas con dificultades de percepción del color.
- **FR-005**: Los días hábiles (`Laborable`) y los feriados (`Feriado`) DEBEN resaltarse
  respecto de los días `No Laborable`, de modo que se identifiquen a simple vista.
- **FR-006**: La pantalla DEBE incluir una leyenda que explique el significado de cada
  distinción visual usada (hábil, no laborable, feriado, día de hoy y pertenencia al
  período activo).
- **FR-007**: Cuando el mes mostrado incluye la fecha actual, la pantalla DEBE señalar el
  día correspondiente a hoy dentro de la grilla, de forma distinguible de las
  clasificaciones. Cuando el mes mostrado no incluye la fecha actual, no se marca ningún
  día como hoy.
- **FR-008**: La pantalla DEBE identificar el período de liquidación activo —el
  correspondiente al último mes generado— mostrando su etiqueta y su rango de fechas.
- **FR-009**: Los días de la grilla que pertenecen al período activo DEBEN distinguirse de
  los que no pertenecen, contemplando tanto un período que abarca el mes completo como uno
  que abarca solo una quincena.
- **FR-010**: Si no hay ningún período activo definido, la pantalla DEBE indicarlo
  explícitamente y aun así mostrar la grilla del mes.
- **FR-011**: Si no existe un calendario generado para el mes que se intenta mostrar (o no
  existe ningún calendario), la pantalla DEBE presentar un estado vacío claro que indique
  que el calendario aún no fue generado, sin arrojar un error ni quedar en blanco, y sin
  ofrecer la acción de reclasificar.
- **FR-012**: Los usuarios DEBEN poder navegar a meses anteriores y posteriores desde la
  pantalla y volver al mes por defecto (el último mes generado) con un único gesto (P3).
- **FR-013**: La pantalla DEBE obtener la clasificación de los días y la definición del
  período activo desde el dominio ya calculado (feature 004), sin reimplementar reglas de
  negocio, sin acceder directamente a la base de datos y sin comunicarse con el reloj
  biométrico (Principio I de la constitución).
- **FR-014**: La pantalla NO DEBE exponer datos personales de empleados (nombres, legajos)
  ni fichadas individuales: esta vista es del calendario institucional del mes, común a
  todos los empleados, y no de la asistencia de una persona (Principio V, minimización).
- **FR-015**: Los usuarios DEBEN poder reclasificar cualquier día del calendario mostrado
  entre las tres clasificaciones institucionales (`Laborable`, `No Laborable`, `Feriado`)
  directamente desde la pantalla.
- **FR-016**: Toda reclasificación iniciada desde la pantalla DEBE requerir una
  confirmación explícita del usuario antes de aplicarse. Mientras el usuario no confirme,
  el cambio NO DEBE persistirse ni disparar recálculo alguno, y el día DEBE conservar su
  clasificación previa.
- **FR-017**: Al confirmarse una reclasificación, el cambio DEBE persistirse a través del
  dominio (feature 004) y DEBE disparar el recálculo de los períodos de liquidación
  afectados (FR-005 de feature 004); la grilla DEBE reflejar la nueva clasificación una vez
  aplicada.
- **FR-018**: La reclasificación NO DEBE estar disponible sobre un mes sin calendario
  generado (estado vacío), dado que no existen días que reclasificar.
- **FR-019**: Las reclasificaciones iniciadas desde la pantalla DEBEN registrarse de forma
  estructurada y correlacionable (mes y día afectados, clasificación anterior y nueva), sin
  exponer datos biométricos ni credenciales (Principio V; consistente con FR-025 de feature
  004).

### Key Entities *(include if feature involves data)*

- **Vista de Calendario del mes**: proyección de solo lectura del Calendario del mes
  (feature 004) para presentación: el mes (`YYYYMM`), la lista de sus días y, por cada día,
  su número, su día de la semana y su clasificación vigente. No recalcula reglas del
  dominio; las muestra y permite iniciar una reclasificación que el dominio persiste.
- **Día mostrado**: un día del mes tal como se presenta en la grilla, con su número, su
  clasificación (`Laborable`, `No Laborable`, `Feriado`), la indicación de si es hoy y la
  indicación de si pertenece al período activo. Es el objeto sobre el que se inicia una
  reclasificación.
- **Período activo mostrado**: proyección del período de liquidación activo (el del último
  mes generado): su etiqueta, su rango de fechas y el conjunto de días del mes que lo
  componen. Puede no existir (sin período activo).
- **Acción de reclasificación**: la intención del usuario de cambiar la clasificación de un
  Día mostrado a una de las tres clasificaciones. Requiere confirmación explícita; una vez
  confirmada, la ejecuta el dominio (feature 004), que persiste el cambio y recalcula los
  períodos afectados. Antes de confirmar no produce ningún efecto.
- **Leyenda**: el conjunto de claves visuales y su significado (hábil, no laborable,
  feriado, hoy, período activo), presentado junto al calendario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al abrir la aplicación, el calendario del mes por defecto queda visible en
  menos de 3 segundos en condiciones normales de uso.
- **SC-002**: El 100% de los días del mes mostrado exhiben su clasificación vigente, y un
  usuario puede diferenciar hábil, no laborable y feriado sin consultar ninguna otra
  pantalla ni documentación.
- **SC-003**: Un usuario que ve la pantalla por primera vez identifica correctamente
  cuáles son los días hábiles y feriados del mes (y hoy, si el mes lo incluye) en menos de
  15 segundos, apoyándose en la leyenda.
- **SC-004**: El 100% de las distinciones visuales de la pantalla siguen siendo
  interpretables sin percibir color (verificado con una vista en escala de grises o
  simulación de daltonismo), gracias a un segundo recurso perceptible por distinción.
- **SC-005**: Cuando existe un período activo, el 100% de los usuarios de prueba pueden
  nombrar su rango de fechas e indicar qué días del mes le pertenecen a partir de lo que
  muestra la pantalla.
- **SC-006**: El 100% de los meses sin calendario generado muestran el estado vacío
  explicativo y ninguno produce un error visible o una pantalla en blanco.
- **SC-007**: La grilla muestra la cantidad exacta de días del mes (28, 29, 30 o 31 según
  corresponda) y ubica cada día en su día de la semana correcto en el 100% de los meses
  probados, incluidos febrero y años bisiestos.
- **SC-008**: Al abrir la aplicación existiendo al menos un calendario generado, la
  pantalla muestra el mes con el `YYYYMM` más alto entre los generados en el 100% de los
  casos.
- **SC-009**: Ninguna reclasificación se aplica sin confirmación explícita; tras confirmar,
  la grilla refleja la nueva clasificación y los períodos afectados quedan recalculados, en
  el 100% de los casos de prueba. Una reclasificación cancelada deja el día y los períodos
  sin cambios en el 100% de los casos.

## Assumptions

- **Vista con reclasificación**: esta feature cubre la visualización de la primera pantalla
  y además la reclasificación de días (`Laborable`/`No Laborable`/`Feriado`) con
  confirmación explícita, delegando la persistencia y el recálculo al dominio (feature
  004). El resto de la edición del dominio (generar el mes, correcciones de jornada, pausas
  intermedias, cierre de período) queda fuera del alcance de esta pantalla.
- **Mes/período por defecto**: la pantalla abre por defecto el último calendario generado,
  definido como el mes con el identificador `YYYYMM` más alto entre los generados (no el
  mes que contiene la fecha de hoy). El período de liquidación activo es el de ese mes.
- **Origen de los datos**: la clasificación de los días, los feriados y la definición del
  período activo provienen del dominio de presentismo ya existente (feature 004), accedido
  a través de la capa de servicios/API; la pantalla no reimplementa reglas ni accede a
  Oracle o al reloj directamente (Principio I). El recálculo posterior a una reclasificación
  lo realiza el dominio, no la pantalla.
- **Calendario institucional, no por empleado**: la pantalla muestra el calendario común a
  todos los empleados (clasificación de días y feriados), no la asistencia ni el resumen de
  presentismo de un empleado concreto; esas vistas se especifican por separado.
- **Alcance de la navegación**: navegar entre meses (US4) se limita a consultar y, sobre
  meses ya generados, reclasificar días; no incluye crear ni generar meses. Un mes futuro o
  pasado sin calendario generado se muestra con el estado vacío y sin acción de
  reclasificar.
- **Reclasificación sin motivo obligatorio**: a diferencia de las correcciones manuales de
  jornada (feature 004), la reclasificación de un día no exige un motivo escrito; sí queda
  registrada de forma estructurada (FR-019). Si más adelante se requiere motivo o control
  de permisos específico para reclasificar, se especifica por separado.
- **Plataforma y responsividad**: se asume una aplicación de escritorio/navegador estándar;
  el diseño responsivo para móviles y la impresión del calendario están fuera del alcance
  de esta primera pantalla salvo indicación posterior.
- **Internacionalización**: los rótulos (días de la semana, nombres de meses) se muestran
  en español, acorde al resto del sistema; el soporte multi-idioma queda fuera de alcance.
- **Autenticación y permisos**: se asume que el acceso a la aplicación ya está resuelto por
  el mecanismo general del sistema; esta pantalla no define login ni control de acceso. La
  atribución de quién reclasifica se apoya en ese mecanismo general (consistente con el
  supuesto de "usuario responsable" de la feature 004).
