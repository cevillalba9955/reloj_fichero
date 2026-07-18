# Feature Specification: Página "Resumen del Período"

**Feature Branch**: `011-resumen-periodo`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "pantalla resumen-periodo, muestra resumen fichadas de cada empleado en el periodo seleccionado, indicando total horas trabajadas, ausencias, llegadas tardes, etc. al seleccionar un empleado se abre dialog con detalle de fichadas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el resumen del período por empleado (Priority: P1)

Un administrador abre la página "Resumen del Período", elige un período de
liquidación (por defecto el más reciente disponible) y ve, para cada empleado
esperado en ese período, una fila con sus indicadores acumulados: total de
horas trabajadas, cantidad de jornadas completas, ausencias, llegadas tarde,
retiros anticipados y cantidad de correcciones manuales aplicadas.

**Why this priority**: Es el valor central de la funcionalidad: hoy el estado
acumulado de un período solo puede reconstruirse día por día desde la pantalla
de fichadas diarias o por CLI; esta vista lo consolida en una sola pantalla,
que es el insumo directo para revisar un período antes de liquidar.

**Independent Test**: Con fichadas, correcciones y pausas ya cargadas para un
período, se puede abrir la página, seleccionar ese período y verificar que
cada fila muestra los acumulados correctos, sin necesitar ninguna otra
funcionalidad.

**Acceptance Scenarios**:

1. **Given** un período con fichadas cargadas para varios empleados, **When**
   el administrador abre la página y selecciona ese período, **Then** ve una
   fila por empleado esperado con legajo, nombre, total de horas trabajadas,
   jornadas completas, ausencias, llegadas tarde, retiros anticipados y
   correcciones aplicadas.
2. **Given** un empleado con un día `Laborable` sin fichadas ni corrección en
   el período, **When** se muestra el resumen, **Then** ese día cuenta como
   una ausencia en su fila.
3. **Given** un empleado que fichó su entrada fuera del margen de tolerancia
   en dos días del período, **When** se muestra el resumen, **Then** su fila
   indica 2 llegadas tarde.
4. **Given** un empleado con una corrección manual vigente que modifica sus
   horas de un día, **When** se muestra el resumen, **Then** el total de horas
   refleja el valor corregido (no el calculado automáticamente) y la fila
   indica que tiene correcciones.
5. **Given** un empleado sin categoría de presentismo configurada (anomalía),
   **When** se muestra el resumen, **Then** su fila aparece señalada como
   anomalía, sin acumulados calculados como si fueran normales.
6. **Given** un período sin calendario generado, **When** el administrador
   intenta seleccionarlo, **Then** el sistema no lo ofrece entre los períodos
   disponibles.

---

### User Story 2 - Ver el detalle de fichadas de un empleado (Priority: P2)

Un administrador hace clic en la fila de un empleado del resumen y se abre un
diálogo modal con el detalle día por día de ese empleado en el período: fecha,
clasificación del día, hora de entrada, hora de salida, pausas, horas
trabajadas del día y estado de la jornada, señalando qué valores provienen de
correcciones manuales.

**Why this priority**: El resumen acumulado dispara preguntas ("¿por qué tiene
3 ausencias?") que solo se responden viendo el detalle diario; sin este
diálogo el administrador tendría que volver a la pantalla de fichadas diarias
y navegar día por día.

**Independent Test**: Sobre el resumen ya visible (Historia 1), se puede
seleccionar un empleado y verificar que el diálogo muestra sus jornadas del
período completas y coherentes con los acumulados de la fila; cerrarlo (por
botón, tecla de escape o clic fuera) vuelve al resumen sin efecto alguno.

**Acceptance Scenarios**:

1. **Given** el resumen del período en pantalla, **When** el administrador
   selecciona la fila de un empleado, **Then** se abre un diálogo modal con
   una entrada por cada día del período mostrando fecha, clasificación,
   entrada, salida, pausas, horas del día y estado de la jornada.
2. **Given** el diálogo de detalle abierto, **When** un día tiene una
   corrección manual vigente, **Then** ese día se muestra señalado como
   corregido, distinguible de los días con datos automáticos.
3. **Given** el diálogo de detalle abierto, **When** el administrador lo
   cierra (botón cerrar, tecla de escape o clic fuera del diálogo), **Then**
   vuelve al resumen sin que se altere ningún dato.
4. **Given** un empleado con un retiro anticipado registrado en un día,
   **When** se abre su detalle, **Then** ese día muestra el retiro anticipado
   con su horario, distinguible de una pausa intermedia.

---

### User Story 3 - Cambiar de período (Priority: P3)

Un administrador cambia el período seleccionado (por ejemplo, del mes en curso
al anterior) y el resumen se actualiza con los acumulados de ese período, sin
recargar la aplicación.

**Why this priority**: El caso de uso típico es revisar el período que está
por cerrarse o comparar con el anterior; sin selector, la pantalla solo
serviría para el período más reciente.

**Independent Test**: Con dos períodos con datos, se puede alternar entre
ambos y verificar que la tabla refleja los acumulados de cada uno.

**Acceptance Scenarios**:

1. **Given** dos períodos con calendario generado y datos, **When** el
   administrador cambia la selección de período, **Then** la tabla se
   actualiza con los acumulados del período elegido.
2. **Given** un período con calendario pero sin fichadas cargadas, **When**
   se lo selecciona, **Then** la tabla muestra a los empleados esperados con
   acumulados en cero y las ausencias que correspondan según el calendario.

---

### Edge Cases

- Un día `No Laborable` o `Feriado` del período no cuenta como ausencia ni
  como jornada esperada para los acumulados (consistente con las reglas del
  calendario de 004).
- Un empleado dado de alta en el padrón después de iniciado el período se
  muestra con los acumulados de los días en que fue esperado; no se le
  imputan ausencias por días anteriores a su presencia en el padrón.
- El período en curso (aún incompleto) muestra acumulados parciales hasta el
  día actual; los días futuros del período no cuentan como ausencia.
- Un empleado con todas sus jornadas sin fichadas en un período `Laborable`
  muestra ausencias por cada día laborable vencido, no un error.
- Los acumulados del resumen y el detalle del diálogo provienen del mismo
  cálculo: no puede haber una fila cuyo acumulado no coincida con la suma de
  su detalle.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar, para el período seleccionado, una fila
  por empleado esperado con: legajo, nombre, total de horas trabajadas,
  cantidad de jornadas completas, cantidad de ausencias, cantidad de llegadas
  tarde, cantidad de retiros anticipados y cantidad de correcciones manuales
  vigentes.
- **FR-002**: El sistema MUST ofrecer como períodos seleccionables únicamente
  los períodos con calendario generado, seleccionando por defecto el más
  reciente.
- **FR-003**: El sistema MUST calcular los acumulados a partir de las mismas
  reglas de jornada, calendario y ajustes del dominio de presentismo
  (feature 004): una ausencia es un día `Laborable` vencido sin fichadas ni
  corrección; una llegada tarde es una entrada real fuera del margen de
  tolerancia; el total de horas respeta correcciones vigentes y descuento de
  pausas.
- **FR-004**: El sistema MUST abrir, al seleccionar un empleado del resumen,
  un diálogo modal con el detalle día por día del período: fecha,
  clasificación del día, entrada, salida, pausas (con su tipo), horas del día
  y estado de la jornada.
- **FR-005**: El sistema MUST señalar en el detalle qué días tienen
  corrección manual vigente y qué pausas son retiros anticipados,
  distinguibles del dato automático.
- **FR-006**: El diálogo de detalle MUST cerrarse por botón, tecla de escape
  o clic fuera, sin alterar ningún dato (la página es de solo consulta).
- **FR-007**: El sistema MUST señalar como anomalía a los empleados sin
  categoría de presentismo configurada, sin calcularles acumulados normales
  (mismo criterio que la pantalla de fichadas diarias, feature 010).
- **FR-008**: El sistema MUST excluir de los acumulados los días futuros del
  período en curso y los días `No Laborable`/`Feriado` (no cuentan como
  ausencia ni como jornada esperada).
- **FR-009**: El sistema MUST reflejar en el resumen los datos vigentes al
  momento de servir la vista (fichadas importadas, correcciones, pausas y
  retiros ya cargados por las features 002/010), sin un paso de
  sincronización propio de esta pantalla.
- **FR-010**: El sistema MUST NOT permitir editar datos desde esta página
  (sin correcciones, pausas ni retiros): toda edición se hace desde la
  pantalla de fichadas diarias (feature 010).
- **FR-011**: El sistema MUST NOT mostrar datos biométricos crudos (templates
  de huella, imágenes) en la página ni en el diálogo de detalle.

### Key Entities

- **Resumen de Período por Empleado**: proyección calculada (no persistida)
  con los acumulados del período de un legajo: horas totales, jornadas
  completas, ausencias, llegadas tarde, retiros anticipados, correcciones
  vigentes; derivada del resumen de jornadas ya calculado por el dominio de
  presentismo (feature 004).
- **Detalle de Jornada**: proyección por día del período para un legajo:
  fecha, clasificación, entrada/salida efectivas, pausas con tipo, horas del
  día, estado de la jornada y marca de corrección; misma fuente de cálculo
  que el resumen.
- **Período de liquidación**: mes con calendario generado (feature 004/008),
  identificado como `YYYYMM`; esta pantalla solo lo consume para seleccionar
  y acotar el cálculo.
- **Empleado esperado del período**: legajo y nombre del padrón de RRHH
  (feature 003), de solo lectura, con su categoría de presentismo
  (feature 004).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede ver los acumulados del período de todos
  los empleados esperados en una sola pantalla, sin reconstruirlos día por
  día ni usar herramientas externas.
- **SC-002**: El detalle diario de cualquier empleado se abre desde el
  resumen en una sola acción y sus valores suman exactamente los acumulados
  de la fila (0 discrepancias entre resumen y detalle).
- **SC-003**: Cambiar de período actualiza la tabla sin recargar la
  aplicación.
- **SC-004**: El resumen de un período de hasta 500 empleados se muestra en
  menos de 10 segundos.
- **SC-005**: Ninguna acción disponible en esta pantalla modifica datos:
  0 escrituras originadas desde el resumen o el detalle.

## Assumptions

- Los indicadores del "etc." del pedido se concretan en el conjunto: total de
  horas trabajadas, jornadas completas, ausencias, llegadas tarde, retiros
  anticipados y correcciones vigentes — los estados que el dominio de
  presentismo (004) ya calcula por jornada. Indicadores adicionales (p. ej.
  horas extra) quedan fuera de alcance hasta que el dominio los defina.
- La pantalla es de solo consulta: las correcciones, pausas y retiros se
  gestionan desde la pantalla de fichadas diarias (feature 010), que ya cubre
  el día en curso y días previos del período abierto. Evita duplicar flujos
  de edición y auditoría.
- "Llegada tarde" se define retrospectivamente igual que la situación `TARDE`
  de la feature 010: entrada real fuera del margen de tolerancia de apertura
  de la modalidad vigente ese día.
- El período se selecciona a nivel de mes (`YYYYMM`), consistente con el
  calendario de 004/008; para empleados de modalidad quincenal el detalle
  diario permite distinguir los tramos, sin un selector propio de quincena en
  esta primera versión.
- El acceso sigue el mismo esquema operativo que el resto de la aplicación
  web (sin capa de autenticación propia; deuda ya documentada en la feature
  010 para una futura feature de roles).
- El rendimiento se apoya en el cálculo por legajo ya existente en el dominio
  de presentismo (acotado por empleado); no se define un mecanismo de
  precálculo o caché en esta feature.
