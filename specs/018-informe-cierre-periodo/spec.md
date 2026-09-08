# Feature Specification: Informe al Cierre del Período

**Feature Branch**: `018-informe-cierre-periodo`

**Created**: 2026-09-08

**Status**: Draft

**Input**: User description: "informe al cierre del periodo, una vez completado el periodo, quincenal o mensual segun corresponda, emitir un informe con el resumen de las horas computadas, y otro informe con el detalle de asistencia, empleado por empleado"

## Clarifications

### Session 2026-09-08

- Q: ¿Qué dispara la emisión de los informes? → A: Ambos caminos. Al cerrar el
  período se generan y guardan automáticamente los dos informes; además existe
  una acción explícita para volver a emitirlos a demanda sobre un período
  cerrado. Cada emisión (automática o manual) reemplaza la copia guardada del
  período.
- Q: ¿En qué forma se entrega cada informe? → A: Un documento apto para imprimir
  y archivar, con una única presentación tipo reporte por informe (no se
  requiere exportación tabular para planilla en esta feature).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emitir el informe de resumen de horas computadas (Priority: P1)

Una vez que un período de liquidación (mensual o quincenal, según la modalidad
configurada en la instalación) está cerrado, el responsable de administración de
personal solicita la emisión del **informe de resumen de horas computadas**: un
documento con una fila por empleado del período que consolida el total de horas
computadas y los contadores acumulados (jornadas completas e incompletas,
ausencias, llegadas tarde, retiros anticipados y correcciones o justificaciones
aplicadas), más un encabezado que identifica el período, el tramo, la fecha y
hora de emisión y quién la realizó.

**Why this priority**: es el insumo directo para liquidar sueldos del período.
Hoy ese consolidado solo existe como pantalla interactiva; como documento
emitido al cierre no existe, y es lo que el área de liquidación necesita como
constancia estable de lo que se computó.

**Independent Test**: con un período ya cerrado que tiene fichadas, correcciones
y justificaciones cargadas, se solicita la emisión y se verifica que el
documento resultante lista a todos los empleados del período con sus totales de
horas y contadores correctos, y que su encabezado identifica período, tramo y
sello de emisión.

**Acceptance Scenarios**:

1. **Given** un período cerrado con fichadas cargadas para varios empleados,
   **When** el responsable solicita la emisión del informe de resumen, **Then**
   obtiene un documento con una fila por empleado del padrón del período
   (legajo, nombre, modalidad, total de horas computadas y contadores) y un
   total general de horas.
2. **Given** la instalación configurada en modalidad quincenal y el tramo Q1 de
   un mes ya cerrado, **When** se emite el informe de resumen, **Then** los
   totales y contadores se acotan a los días 1–15 de ese mes para todos los
   empleados, y el encabezado indica el tramo Q1.
3. **Given** un empleado con una corrección manual vigente que modifica sus
   horas de un día del período, **When** se emite el informe, **Then** el total
   de horas de ese empleado refleja el valor corregido y su fila indica que
   tiene correcciones aplicadas.
4. **Given** un empleado del padrón del período sin categoría de presentismo
   configurada, **When** se emite el informe, **Then** su fila aparece
   señalada como anomalía, sin acumulados calculados como si fueran normales.
5. **Given** un período que todavía no está cerrado, **When** el responsable
   intenta emitir el informe de resumen, **Then** el sistema no lo emite e
   informa que el período debe cerrarse primero.
6. **Given** el mismo período cerrado emitido dos veces sin cambios
   intermedios, **When** se comparan ambos documentos, **Then** las cifras por
   empleado y el total general coinciden.
7. **Given** un período recién cerrado, **When** se completa la acción de
   cerrar, **Then** ambos informes quedan generados y guardados para ese
   período sin que el responsable ejecute un paso adicional.
8. **Given** un período cerrado cuya copia guardada ya existe, **When** el
   responsable ejecuta la acción de re-emitir, **Then** la copia guardada se
   reemplaza por una nueva emisión con sello de emisión actualizado.

---

### User Story 2 - Emitir el informe de detalle de asistencia, empleado por empleado (Priority: P2)

Para el mismo período cerrado, el responsable solicita la emisión del **informe
de detalle de asistencia**: un documento que, empleado por empleado, presenta la
asistencia día por día del período (fecha, día de la semana, clasificación del
día, hora de entrada, hora de salida, pausas, horas computadas del día y estado
de la jornada), señalando qué valores provienen de una corrección manual o de
una justificación, con un subtotal por empleado que cuadra con su fila del
informe de resumen.

**Why this priority**: el resumen consolidado dispara preguntas ("¿por qué este
empleado tiene 3 ausencias y 148 horas?") que solo se responden con el detalle
diario. Sin este segundo informe, el área de liquidación tendría que volver a la
aplicación y navegar día por día para auditar cada fila del resumen.

**Independent Test**: sobre un período cerrado, se emite el informe de detalle y
se verifica que para cada empleado del período aparece su asistencia completa
día por día, que las jornadas con corrección o justificación quedan señaladas y
que el subtotal de horas de cada empleado coincide con el informe de resumen.

**Acceptance Scenarios**:

1. **Given** un período cerrado, **When** se emite el informe de detalle,
   **Then** por cada empleado del padrón del período se listan todos los días
   del período con su fecha, día de la semana, clasificación, entrada, salida,
   pausas, horas computadas y estado de jornada.
2. **Given** un día con entrada fichada y sin salida en el período, **When** se
   emite el detalle, **Then** ese día figura como jornada incompleta en la
   sección del empleado.
3. **Given** un día `Laborable` sin fichadas ni corrección, **When** se emite el
   detalle, **Then** ese día figura como ausencia en la sección del empleado.
4. **Given** un día con corrección manual o justificación vigente, **When** se
   emite el detalle, **Then** ese renglón muestra el valor ajustado y una marca
   visible de que proviene de una corrección o justificación.
5. **Given** el informe de detalle de un empleado, **When** se suman las horas
   computadas de todos sus días, **Then** el resultado coincide con el total de
   horas de ese empleado en el informe de resumen del mismo período.
6. **Given** las horas de entrada y salida mostradas en el detalle, **When** se
   comparan con las fichadas reales (o corregidas), **Then** son la hora real o
   la corregida, nunca la hora "efectiva" ajustada por el margen de tolerancia.

---

### User Story 3 - Advertir sobre pendientes antes de liquidar (Priority: P3)

Ambos informes señalan de forma explícita los puntos del período que requieren
revisión antes de liquidar: jornadas incompletas, empleados sin categoría de
presentismo, y días con correcciones o justificaciones aplicadas. El responsable
puede así decidir si liquida sobre esos datos o vuelve a revisar el período
antes de emitir la versión definitiva.

**Why this priority**: emitir el informe no garantiza que el período esté
"limpio". Sin una señal clara de pendientes, se corre el riesgo de liquidar
sobre jornadas sin cerrar o empleados mal configurados. Es un refuerzo de las
Historias 1 y 2, no un flujo independiente de valor.

**Independent Test**: con un período cerrado que contiene al menos una jornada
incompleta y un empleado sin categoría, se emiten ambos informes y se verifica
que ambos casos aparecen listados/señalados como pendientes de revisión.

**Acceptance Scenarios**:

1. **Given** un período cerrado con 2 jornadas incompletas, **When** se emite
   cualquiera de los dos informes, **Then** el informe indica que hay 2
   jornadas incompletas y a qué empleados y días corresponden.
2. **Given** un período cerrado con un empleado sin categoría de presentismo,
   **When** se emiten los informes, **Then** ese empleado aparece señalado como
   anomalía en ambos.
3. **Given** un período cerrado sin pendientes (sin jornadas incompletas ni
   anomalías), **When** se emiten los informes, **Then** el informe indica
   explícitamente que no hay pendientes de revisión.

---

### Edge Cases

- **Período reabierto y recalculado**: si un período cerrado se reabre (feature
  013), la copia guardada de sus informes queda desactualizada; al ajustarlo y
  volver a cerrarlo (o al re-emitir a demanda), la nueva emisión refleja los
  valores actualizados. Las copias impresas o descargadas antes del reajuste no
  se actualizan solas.
- **Período sin calendario generado**: no puede cerrarse ni, por lo tanto,
  emitir informes; el sistema no lo ofrece.
- **Empleado con vínculo parcial en el período** (ingreso o egreso a mitad del
  período, feature 017): se incluye en ambos informes solo con los días en que
  su vínculo estaba vigente.
- **Empleado presente en el padrón del período pero sin ninguna fichada**:
  aparece en ambos informes con sus días clasificados (ausencias en los días
  laborables, etc.).
- **Período sin empleados en su padrón**: los informes se emiten igualmente,
  indicando que no hay empleados en el período.
- **Días no laborables, feriados y vacaciones**: aparecen en el detalle con su
  clasificación y sin contar como ausencia; se computan según las reglas de
  presentismo vigentes.
- **Modalidad quincenal, quincena en curso**: solo se puede emitir sobre una
  quincena ya cerrada; la quincena en curso no está disponible.
- **Usuario sin permiso de edición/configuración**: no puede emitir informes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir emitir, para un período de liquidación,
  dos informes separados: (a) un informe de **resumen de horas computadas** y
  (b) un informe de **detalle de asistencia**, empleado por empleado.
- **FR-002**: El sistema MUST permitir la emisión de estos informes únicamente
  cuando el período está cerrado (solo lectura, feature 013). Para un período
  abierto, la emisión no se realiza y el sistema informa que el período debe
  cerrarse primero.
- **FR-003**: El sistema MUST generar y guardar ambos informes automáticamente
  al cerrar el período, y MUST además ofrecer una acción explícita para volver a
  emitirlos a demanda sobre un período que ya está cerrado. Cada emisión
  (automática o manual) reemplaza la copia guardada del período; el sistema
  conserva la última copia emitida, no un archivo histórico de emisiones
  previas.
- **FR-004**: Ambos informes MUST respetar la granularidad del período
  configurada en la instalación (mensual o quincenal) y acotar cálculos y
  detalle al tramo del período elegido (mes completo, primera o segunda
  quincena) para todos los empleados, cualquiera sea su modalidad.
- **FR-005**: El universo de empleados de ambos informes MUST ser el padrón del
  período (la foto de empleados tomada para ese período), no el padrón vigente
  al momento de la emisión.
- **FR-006**: Las cifras de ambos informes (horas computadas, ausencias,
  llegadas tarde, retiros anticipados, jornadas completas e incompletas) MUST
  coincidir con lo que la pantalla "Resumen del Período" muestra para el mismo
  período cerrado, aplicando las mismas reglas: una corrección manual o
  justificación vigente prevalece sobre la fichada original, y el margen de
  tolerancia solo interviene en el cálculo de horas, no en las horas mostradas.
- **FR-007**: El informe de resumen MUST incluir, por empleado: legajo, nombre,
  modalidad, total de horas computadas del período y los contadores de jornadas
  completas, jornadas incompletas, ausencias, llegadas tarde, retiros
  anticipados y correcciones o justificaciones aplicadas; y MUST incluir un
  total general de horas y la cantidad de empleados del período.
- **FR-008**: El informe de detalle MUST incluir, por empleado y por cada día
  del período: fecha, día de la semana, clasificación del día, hora de entrada,
  hora de salida, pausas, horas computadas del día y estado de la jornada;
  MUST señalar los valores que provienen de una corrección manual o de una
  justificación; y MUST incluir un subtotal de horas por empleado que cuadra
  con la fila de ese empleado en el informe de resumen.
- **FR-009**: Cada informe MUST exhibir de forma visible un sello de emisión con
  la identificación del período, el tramo, la fecha y hora de emisión y el
  responsable que la realizó.
- **FR-010**: Ambos informes MUST señalar explícitamente los pendientes del
  período —jornadas incompletas, empleados sin categoría de presentismo y días
  con correcciones o justificaciones aplicadas—, indicando a qué empleados y
  días corresponden; y MUST indicar cuando no hay pendientes.
- **FR-011**: Cada informe MUST entregarse como un documento apto para imprimir
  y archivar, con una única presentación tipo reporte. Una exportación tabular
  para procesar en planilla queda fuera de alcance de esta feature.
- **FR-012**: La emisión de informes MUST estar restringida a los roles con
  permiso de edición o configuración (feature 016); un usuario solo lector no
  puede emitirlos.
- **FR-013**: Reabrir un período cerrado MUST invalidar la copia guardada de sus
  informes (queda desactualizada). Al volver a cerrar el período, o al ejecutar
  la acción explícita de re-emisión, la nueva emisión MUST reflejar los valores
  actualizados.
- **FR-014**: El sistema MUST registrar en el log estructurado cada emisión de
  informe (período, tramo, responsable y momento), sin exponer datos
  biométricos ni credenciales (Principio V de la constitución).
- **FR-015**: Los empleados con vínculo parcial en el período (ingreso o egreso
  intra-período) MUST incluirse en ambos informes solo con los días en que su
  vínculo estaba vigente.

### Key Entities *(include if feature involves data)*

- **Informe de Resumen de Horas Computadas**: documento emitido para un período
  cerrado; contiene el sello de emisión, una fila de resumen por empleado, el
  total general de horas y la lista de pendientes del período. El sistema
  guarda la última copia emitida por período.
- **Informe de Detalle de Asistencia**: documento emitido para un período
  cerrado; contiene el sello de emisión y, por cada empleado del período, su
  asistencia día por día con subtotal de horas y las marcas de corrección o
  justificación. El sistema guarda la última copia emitida por período.
- **Período de Liquidación (cerrado)**: recorte del calendario del mes por
  tramo (mes completo, Q1 o Q2) que está marcado como solo lectura; precondición
  para emitir cualquiera de los dos informes.
- **Padrón del Período**: foto de los empleados correspondientes al período;
  define el universo de filas y secciones de ambos informes.
- **Fila de Resumen por Empleado**: legajo, nombre, modalidad, total de horas
  computadas y contadores acumulados del empleado en el período.
- **Renglón de Detalle Diario**: un día del período para un empleado: fecha, día
  de la semana, clasificación, entrada, salida, pausas, horas computadas, estado
  de la jornada y marcas de ajuste.
- **Sello de Emisión**: período, tramo, fecha y hora de emisión y responsable;
  presente en ambos informes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El responsable obtiene ambos informes de un período cerrado en
  menos de 1 minuto desde que solicita la emisión.
- **SC-002**: Para cada empleado, el total de horas computadas del informe de
  resumen coincide exactamente con la suma de las horas computadas de sus días
  en el informe de detalle del mismo período (cuadre 100%).
- **SC-003**: El informe de resumen incluye al 100% de los empleados del padrón
  del período, sin omisiones ni duplicados.
- **SC-004**: El 100% de los días del período con jornada incompleta, con
  corrección o justificación aplicada, o con empleado sin categoría de
  presentismo, aparece señalado como pendiente en ambos informes.
- **SC-005**: Un usuario sin rol de edición o configuración no logra emitir
  informes en el 100% de los intentos.
- **SC-006**: Tras reabrir un período, ajustar una jornada y volver a cerrarlo,
  una nueva emisión refleja el cambio en ambos informes en el 100% de los
  casos.
- **SC-007**: El 100% de los informes emitidos permite a un tercero identificar,
  con solo mirar el documento, a qué período y tramo corresponde y cuándo y por
  quién fue emitido.
- **SC-008**: Las cifras del informe de resumen para un período cerrado
  coinciden con la pantalla "Resumen del Período" del mismo período en el 100%
  de los empleados y contadores.

## Assumptions

- Los informes se construyen sobre el estado ya persistido del período
  (calendario, fichadas, correcciones, justificaciones y padrón del período).
  Esta feature NO introduce la escritura a un esquema Oracle de datos de
  liquidación prevista en el Principio VI de la constitución: ese registro
  autoritativo para nómina es un trabajo separado; aquí solo se emiten
  documentos legibles a partir del estado local del período.
- La feature se apoya en el mecanismo de "cerrar período" ya existente (feature
  013) como precondición; no redefine qué dispara el cierre ni cómo se reabre.
- Las reglas de cálculo de horas, ausencias, llegadas tarde, retiros
  anticipados y estado de jornada son las ya definidas por el dominio de
  presentismo (feature 004) y la pantalla "Resumen del Período" (feature 011);
  esta feature no las modifica, solo las presenta como documento.
- La granularidad del período (mensual o quincenal) proviene de la
  configuración existente de la instalación; el período por defecto ofrecido
  para emitir es el período cerrado más reciente.
- El control de acceso usa los roles ya existentes (feature 016).
- El sistema guarda una única copia de cada informe por período (la última
  emitida), regenerada al cerrar el período y en cada re-emisión manual. No
  conserva un archivo histórico de emisiones anteriores; mantener copias
  previas ya impresas o descargadas es responsabilidad del área que las recibe.
- El idioma de los informes es español y la instalación opera en un único huso
  horario local.
- El envío de los informes por correo u otro canal externo queda fuera de
  alcance: la salida es un documento que el responsable obtiene desde la
  aplicación.

## Dependencies

- **Feature 013 (Reestructurar almacenamiento por período / cierre de período)**:
  provee el concepto de período cerrado (solo lectura) y el padrón fechado por
  período.
- **Feature 011 (Resumen del Período)** y **Feature 004 (Dominio de
  presentismo)**: proveen el cálculo por empleado (horas computadas y
  contadores) que ambos informes consolidan.
- **Feature 017 (Fecha de ingreso / sincronización de padrón)**: necesaria para
  acotar los días de empleados con vínculo parcial en el período.
- **Feature 016 (Control de acceso por roles)**: define quién puede emitir los
  informes.
