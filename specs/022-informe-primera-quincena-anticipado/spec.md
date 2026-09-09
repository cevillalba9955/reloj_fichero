# Feature Specification: Informe de la Primera Quincena antes del Cierre del Mes

**Feature Branch**: `022-informe-primera-quincena-anticipado`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "permitir generar el informe de la primer quincena antes del cierre del mes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Emitir el informe de la primera quincena sin esperar al cierre del mes (Priority: P1)

En una instalación configurada en modalidad **quincenal**, el responsable de
administración de personal necesita entregar al área de liquidación el informe
de la **primera quincena** (Q1: días 1 a 15) apenas esa quincena termina y sus
datos están revisados, sin tener que esperar a que finalice y se cierre el mes
completo. Desde la aplicación dispara la emisión del juego de informes de Q1
—informe de resumen de horas computadas + informe de detalle de asistencia,
empleado por empleado, exactamente con la misma presentación que los informes
que hoy se obtienen al cierre del período— acotado a los días 1 a 15 del mes en
curso, aunque el mes todavía esté abierto.

**Why this priority**: hoy el juego de informes emitido (documento sellado, apto
para imprimir y archivar) sólo se puede obtener cuando el período del mes está
cerrado. En una instalación quincenal, la liquidación de la primera quincena se
procesa a mediados de mes, mucho antes del cierre; el responsable queda sin un
documento estable de Q1 para entregar y trabaja con una pantalla interactiva que
puede seguir cambiando. Poder emitir el informe de Q1 de forma anticipada es el
valor central de la feature.

**Independent Test**: en una instalación quincenal, sobre un mes en curso cuya
primera quincena ya transcurrió (estamos en el día 16 o posterior y el mes no
está cerrado), con fichadas, correcciones y justificaciones cargadas para los
días 1 a 15, se dispara la emisión del informe de la primera quincena y se
verifica que se obtiene —para ver en pantalla y descargar— un juego de informes
que lista a todos los empleados del padrón del período con sus totales de horas
y contadores acotados a los días 1 a 15, con encabezado que identifica el mes,
el tramo Q1 y el sello de emisión.

**Acceptance Scenarios**:

1. **Given** una instalación quincenal y un mes en curso no cerrado cuya primera
   quincena ya transcurrió, **When** el responsable dispara la emisión del
   informe de la primera quincena, **Then** obtiene el informe de resumen de
   horas computadas (una fila por empleado del período, con total de horas y
   contadores acotados a los días 1–15) y el informe de detalle de asistencia
   (una sección por empleado con su día por día del 1 al 15).
2. **Given** el informe de la primera quincena emitido de forma anticipada,
   **When** un tercero lo mira, **Then** puede identificar a qué mes y a qué
   tramo (primera quincena) corresponde, y cuándo y por quién fue emitido, sin
   conocer la aplicación.
3. **Given** un empleado con una corrección manual o justificación vigente sobre
   un día del 1 al 15, **When** se emite el informe de la primera quincena,
   **Then** el total de horas de ese empleado refleja el valor ajustado y su
   fila queda señalada como que tiene ajustes aplicados.
4. **Given** el informe de la primera quincena y la pantalla "Resumen del
   Período" para la misma quincena en curso, **When** se comparan las cifras,
   **Then** el total de horas y cada contador por empleado coinciden.
5. **Given** una instalación en modalidad **mensual**, **When** el responsable
   busca la acción de emitir el informe de la primera quincena, **Then** la
   acción no se ofrece (no hay quincenas: el informe del mes se emite al cierre,
   feature 021).

---

### User Story 2 - La primera quincena debe haber terminado para poder emitir su informe (Priority: P2)

La emisión anticipada del informe de la primera quincena se ofrece únicamente
cuando **todos los días del 1 al 15 del mes en curso ya transcurrieron** y el
mes **todavía no está cerrado**. Mientras la primera quincena está en curso, la
acción no se ofrece. Una vez que el mes se cierra, el informe de Q1 se obtiene
por el flujo de cierre ya existente (feature 018/021), no por esta acción
anticipada.

**Why this priority**: evita entregar como "informe de la primera quincena" un
documento sobre días que todavía no ocurrieron. Acota la ventana de uso de la
emisión anticipada al intervalo entre el fin de Q1 y el cierre del mes, y evita
solapamiento con el flujo de cierre. Es un refuerzo de la Historia 1.

**Independent Test**: sobre un mes en curso cuya primera quincena aún no terminó
(estamos en día 1–15), se verifica que la acción de emitir el informe anticipado
de Q1 no se ofrece; al pasar el día 15 la acción aparece; al cerrar el mes la
acción anticipada deja de ofrecerse y el informe de Q1 pasa a estar disponible
por el flujo de cierre.

**Acceptance Scenarios**:

1. **Given** una instalación quincenal y un mes en curso en el que aún no
   terminó la primera quincena, **When** el responsable abre la pantalla
   "Resumen del Período" en la primera quincena de ese mes, **Then** la acción
   de emitir el informe anticipado de la primera quincena no se ofrece.
2. **Given** un mes en curso cuya primera quincena ya terminó y que no está
   cerrado, **When** el responsable abre la pantalla "Resumen del Período" en la
   primera quincena de ese mes, **Then** la acción de emitir el informe
   anticipado de la primera quincena se ofrece.
3. **Given** un mes cuyo período ya está cerrado, **When** el responsable busca
   la acción de emisión anticipada de Q1 en "Resumen del Período", **Then** la
   acción anticipada no se ofrece y el informe de la primera quincena se obtiene
   por el flujo de cierre (feature 018/021).
4. **Given** un mes sin calendario generado, **When** el responsable abre la
   pantalla "Resumen del Período" en ese mes, **Then** la acción de emitir el
   informe anticipado de Q1 no se ofrece (no hay período ni padrón sobre el cual
   emitir).

---

### User Story 3 - El informe anticipado se distingue del informe de cierre y se mantiene coherente (Priority: P3)

El informe de la primera quincena emitido antes del cierre del mes se identifica
de forma visible como una emisión **anticipada** (sobre un mes todavía abierto),
para que el área que lo recibe sepa que las cifras de Q1 podrían ajustarse hasta
el cierre. El sistema guarda la última copia emitida del informe anticipado de
Q1 del mes en curso y permite volver a emitirlo a demanda mientras el mes siga
abierto. Cuando el mes finalmente se cierra, la emisión de cierre de Q1 (feature
018/021) reemplaza esa copia por la versión de cierre.

**Why this priority**: da trazabilidad sobre qué versión del informe de Q1 tiene
cada área (anticipada vs. de cierre) y evita que una copia anticipada se
confunda con la definitiva. No es un flujo de valor independiente: refuerza las
Historias 1 y 2.

**Independent Test**: se emite el informe anticipado de Q1 de un mes abierto y se
verifica que el documento se identifica como emisión anticipada; se carga una
corrección sobre un día 1–15 y se vuelve a emitir a demanda: la nueva copia
anticipada refleja el ajuste. Se cierra el mes y se emite el cierre de Q1: la
copia guardada de Q1 pasa a ser la de cierre y ya no se identifica como
anticipada.

**Acceptance Scenarios**:

1. **Given** un mes abierto cuya primera quincena terminó, **When** se emite el
   informe anticipado de Q1, **Then** el documento exhibe de forma visible que
   es una emisión anticipada sobre un mes aún no cerrado, además del sello de
   emisión habitual (mes, tramo Q1, fecha y hora, responsable).
2. **Given** un informe anticipado de Q1 ya emitido para el mes en curso,
   **When** se carga una corrección o justificación sobre un día del 1 al 15 y
   se vuelve a emitir a demanda, **Then** la copia guardada del informe
   anticipado de Q1 se reemplaza por una nueva emisión con las cifras
   actualizadas y sello de emisión nuevo.
3. **Given** un informe anticipado de Q1 guardado para el mes en curso, **When**
   el período del mes se cierra y se emite el informe de cierre de Q1, **Then**
   la copia guardada de Q1 del mes pasa a ser la de cierre y deja de
   identificarse como emisión anticipada.
4. **Given** un usuario sin rol de edición o configuración, **When** intenta
   disparar o re-emitir el informe anticipado de Q1, **Then** el sistema no se
   lo permite; pero si el informe anticipado ya está disponible, puede verlo y
   descargarlo.

---

### Edge Cases

- **Instalación mensual**: la feature no aplica; la acción de emisión anticipada
  de Q1 nunca se ofrece.
- **Mes en curso, primera quincena en curso (día 1–15)**: la acción no se
  ofrece hasta que termina el día 15.
- **Corrección o justificación sobre un día 1–15 después de emitido el informe
  anticipado**: como el mes sigue abierto, esos días siguen siendo editables; la
  copia anticipada guardada queda desactualizada hasta la siguiente emisión a
  demanda o hasta el cierre.
- **Segunda quincena (Q2)**: queda fuera de alcance de la emisión anticipada;
  Q2 termina con el mes y su informe se obtiene al cierre por el flujo existente.
- **Empleado con vínculo parcial dentro de los días 1–15** (ingreso o egreso
  intra-quincena, feature 017): se incluye en el informe anticipado sólo con los
  días 1–15 en que su vínculo estaba vigente.
- **Empleado del padrón del período sin categoría de presentismo**: aparece
  señalado como anomalía en el informe anticipado, sin acumulados calculados
  como si fueran normales, igual que en los informes de cierre.
- **Días no laborables, feriados, licencias y vacaciones dentro del 1–15**:
  aparecen en el detalle con su clasificación y sin contar como ausencia, según
  las reglas de presentismo vigentes.
- **Mes en el que la instalación cambió de modalidad**: la acción de emisión
  anticipada de Q1 se ofrece según la modalidad quincenal vigente; el alcance
  del documento son los días 1–15 del mes en curso.
- **Copia impresa o descargada del informe anticipado antes de un ajuste o del
  cierre**: no se actualiza sola; queda a cargo del área que la recibió, igual
  que con los informes de cierre.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: En una instalación en modalidad quincenal, el sistema MUST ofrecer
  —desde la pantalla "Resumen del Período" (ver FR-017)— una acción para
  **emitir** y luego **ver en pantalla** y **descargar** el juego de informes de
  la **primera quincena** (Q1: días 1–15) del mes en curso, sin requerir que el
  período del mes esté cerrado.
- **FR-002**: El sistema MUST ofrecer esa acción únicamente cuando se cumplen
  todas estas condiciones: la instalación está en modalidad quincenal, el mes en
  curso tiene calendario generado, todos los días del 1 al 15 de ese mes ya
  transcurrieron, y el período del mes todavía NO está cerrado.
- **FR-003**: En una instalación en modalidad mensual, el sistema MUST NOT
  ofrecer la acción de emisión anticipada de la primera quincena.
- **FR-004**: El juego de informes de la primera quincena emitido de forma
  anticipada MUST tener la misma presentación y el mismo contenido que los
  informes de cierre por quincena (feature 018): un informe de resumen de horas
  computadas (una fila por empleado del período con total de horas y contadores)
  y un informe de detalle de asistencia (una sección por empleado con su día por
  día), acotados a los días 1–15 del mes en curso para todos los empleados,
  cualquiera sea su modalidad.
- **FR-005**: Las cifras del informe anticipado de Q1 MUST aplicar las mismas
  reglas de cálculo ya vigentes (features 004 y 011): una corrección manual o
  justificación vigente prevalece sobre la fichada original, y el margen de
  tolerancia sólo interviene en el cálculo de horas, no en las horas mostradas
  (hora real o corregida). Para cada empleado, el subtotal de horas del detalle
  MUST cuadrar con su fila del resumen.
- **FR-006**: Las cifras del informe anticipado de Q1 MUST coincidir, por
  empleado y por contador, con lo que la pantalla "Resumen del Período" (feature
  011) muestra para la primera quincena del mismo mes en el mismo momento.
- **FR-007**: El universo de empleados del informe anticipado de Q1 MUST ser el
  padrón del período (la foto de empleados tomada para ese mes), no el padrón
  vigente al momento de la emisión. Los empleados con vínculo parcial dentro de
  los días 1–15 MUST incluirse sólo con los días en que su vínculo estaba
  vigente.
- **FR-008**: El informe anticipado de Q1 MUST exhibir de forma visible un sello
  de emisión con la identificación del mes, el tramo (primera quincena), la
  fecha y hora de emisión y el responsable; y MUST identificarse de forma
  visible como una **emisión anticipada** sobre un mes todavía no cerrado.
- **FR-009**: El informe anticipado de Q1 MUST señalar explícitamente los
  pendientes de los días 1–15 —jornadas incompletas, empleados sin categoría de
  presentismo y días con corrección o justificación aplicada—, indicando a qué
  empleados y días corresponden, o indicar que no hay pendientes.
- **FR-010**: El sistema MUST guardar la última copia emitida del informe
  anticipado de Q1 del mes en curso y MUST ofrecer una acción explícita para
  volver a emitirlo a demanda mientras el mes siga abierto. Cada emisión
  reemplaza la copia guardada; el sistema conserva sólo la última copia.
- **FR-011**: Como los días 1–15 de un mes abierto siguen siendo modificables,
  el sistema MUST tratar la copia guardada del informe anticipado de Q1 como
  potencialmente desactualizada tras cualquier cambio sobre esos días, y la
  siguiente emisión a demanda (o la emisión de cierre) MUST reflejar los valores
  actualizados. La emisión anticipada del informe de Q1 MUST NOT impedir ni
  bloquear correcciones, pausas, justificaciones ni reclasificaciones sobre los
  días 1–15 mientras el mes siga abierto.
- **FR-012**: Al cerrar el período del mes, la emisión del informe de cierre de
  Q1 (feature 018/021) MUST reemplazar la copia guardada del informe de Q1 del
  mes; a partir del cierre, el informe de Q1 MUST dejar de identificarse como
  emisión anticipada y MUST obtenerse por el flujo de cierre, no por la acción
  anticipada.
- **FR-013**: Ver y descargar un informe anticipado de Q1 ya disponible MUST
  estar abierto a cualquier usuario que acceda a la pantalla; disparar o
  re-emitir el informe anticipado de Q1 MUST estar restringido a los roles con
  permiso de edición o configuración (feature 016).
- **FR-014**: El informe anticipado de Q1 MUST entregarse como un documento apto
  para imprimir y archivar, con una única presentación tipo reporte. Una
  exportación tabular para procesar en planilla queda fuera de alcance.
- **FR-015**: El sistema MUST registrar en el log estructurado cada emisión del
  informe anticipado de Q1 (mes, tramo, responsable, momento y condición de
  emisión anticipada), sin exponer datos biométricos ni credenciales (Principio
  V de la constitución).
- **FR-016**: La emisión anticipada del informe de Q1 MUST construirse sobre el
  estado ya persistido del período (calendario, fichadas, correcciones,
  justificaciones y padrón del período) y MUST NOT introducir escritura a un
  esquema Oracle de liquidación (Principio VI): la salida es un documento
  legible obtenido desde la aplicación.
- **FR-017**: La acción de emisión anticipada del informe de Q1 MUST ofrecerse
  desde la pantalla **"Resumen del Período"** (feature 011), junto a la vista
  interactiva de la primera quincena en curso. La página Calendario (feature
  021) sigue reservada a los informes del mes ya cerrado.
- **FR-018**: La emisión anticipada del informe de Q1 MUST ser siempre una
  acción manual explícita del responsable ("emitir informe de la primera
  quincena"), tanto la primera emisión como cada re-emisión a demanda mientras
  el mes siga abierto. El sistema MUST NOT generar la copia anticipada de forma
  automática al cumplirse las condiciones de FR-002: mientras no exista una
  emisión manual, no hay copia guardada del informe anticipado de Q1.

### Key Entities *(include if feature involves data)*

- **Informe Anticipado de la Primera Quincena**: juego de documentos (informe de
  resumen de horas computadas + informe de detalle de asistencia) emitido
  manualmente para la primera quincena (días 1–15) de un mes que todavía NO está
  cerrado, en una instalación quincenal. Incluye el sello de emisión, la marca
  de emisión anticipada, una fila de resumen por empleado, el total general de
  horas, el detalle día por día por empleado (días 1–15) y la lista de
  pendientes de la quincena. El sistema guarda la última copia emitida por mes
  en curso; mientras no haya una emisión manual, no existe copia guardada.
- **Ventana de Emisión Anticipada**: intervalo en el que la acción está
  disponible: desde que terminan todos los días 1–15 del mes en curso hasta que
  el período del mes se cierra. Fuera de esa ventana la acción no se ofrece.
- **Padrón del Período**: foto de los empleados correspondientes al mes; define
  el universo de filas y secciones del informe anticipado de Q1.
- **Sello de Emisión**: mes, tramo (primera quincena), fecha y hora de emisión y
  responsable; presente en el informe anticipado, junto con la marca de emisión
  anticipada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En una instalación quincenal, el responsable obtiene el informe de
  la primera quincena (verlo y descargarlo) sin esperar al cierre del mes, en
  menos de 1 minuto desde que solicita la emisión, en cualquier momento entre el
  fin de Q1 y el cierre del mes.
- **SC-002**: Para el 100% de los empleados del padrón del período, el total de
  horas y cada contador del informe anticipado de Q1 coinciden con los que la
  pantalla "Resumen del Período" muestra para la primera quincena del mismo mes
  en el mismo momento.
- **SC-003**: Para cada empleado, el total de horas del resumen del informe
  anticipado de Q1 coincide exactamente con la suma de las horas de sus días
  1–15 en el detalle (cuadre 100%).
- **SC-004**: El informe anticipado de Q1 incluye al 100% de los empleados del
  padrón del período, sin omisiones ni duplicados.
- **SC-005**: El 100% de los días 1–15 con jornada incompleta, con corrección o
  justificación aplicada, o con empleado sin categoría de presentismo, aparece
  señalado como pendiente en el informe anticipado de Q1.
- **SC-006**: La acción de emisión anticipada de Q1 aparece en el 100% de los
  meses en curso de una instalación quincenal cuya primera quincena ya terminó y
  cuyo período no está cerrado, y no aparece en el 100% de los meses con Q1 en
  curso, de los meses ya cerrados, ni en instalaciones mensuales.
- **SC-007**: El 100% de los informes anticipados de Q1 emitidos permite a un
  tercero identificar, con sólo mirar el documento, a qué mes y tramo
  corresponde, que es una emisión anticipada sobre un mes no cerrado, y cuándo y
  por quién fue emitido.
- **SC-008**: Tras cargar una corrección sobre un día 1–15 y volver a emitir a
  demanda, la nueva copia del informe anticipado de Q1 refleja el cambio en el
  100% de los casos.
- **SC-009**: Un usuario sin rol de edición o configuración no logra disparar ni
  re-emitir el informe anticipado de Q1 en el 100% de los intentos, pero sí
  puede verlo y descargarlo cuando ya está disponible.

## Assumptions

- La feature aplica sólo a instalaciones en modalidad **quincenal**
  (configuración existente de la instalación, features 011/013). En modalidad
  mensual no hay "primera quincena" que emitir de forma anticipada.
- La primera quincena es siempre **días 1 a 15** del mes y la segunda quincena
  **días 16 a fin de mes**, según la definición ya vigente (features 004/011).
- "La primera quincena ya terminó" significa que la fecha actual del sistema es
  posterior al día 15 del mes en curso; la instalación opera en un único huso
  horario local.
- El juego de informes anticipado reutiliza íntegramente la presentación tipo
  reporte y el contenido de los informes de cierre por quincena (feature 018),
  cambiando sólo la precondición (mes abierto en lugar de cerrado) y agregando
  la marca visible de emisión anticipada.
- La acción vive en la pantalla "Resumen del Período" (feature 011), donde el
  responsable ya elige y revisa la primera quincena en curso; la página
  Calendario (feature 021) no cambia.
- La emisión anticipada es siempre manual: no se genera una copia automática al
  terminar Q1. El responsable decide cuándo Q1 está revisada y lista para
  entregar, y re-emite a demanda si los días 1–15 cambian antes del cierre.
- El informe anticipado de Q1 se construye sobre el estado ya persistido del
  período, reutilizando el mismo cálculo por empleado de las features 004 y 011.
  No introduce escritura a un esquema Oracle de liquidación (Principio VI): la
  salida es un documento legible obtenido desde la aplicación.
- El sistema guarda una única copia del informe anticipado de Q1 por mes en
  curso (la última emitida). No conserva un archivo histórico de emisiones
  anteriores; mantener copias previas ya impresas o descargadas es
  responsabilidad del área que las recibe.
- Al cerrar el mes, el flujo de cierre existente (feature 018/021) emite y
  guarda el informe de Q1 de cierre; esta feature no redefine el cierre ni la
  emisión de cierre, sólo agrega la emisión anticipada previa.
- El control de acceso usa los roles ya existentes (feature 016): lectura del
  documento abierta, emisión/re-emisión restringida a edición o configuración.
- El idioma del informe es español.
- El envío del informe por correo u otro canal externo queda fuera de alcance:
  la salida es un documento que el responsable obtiene desde la aplicación.
- La emisión anticipada de la **segunda quincena (Q2)** queda fuera de alcance:
  Q2 termina junto con el mes y su informe se obtiene por el flujo de cierre.

## Dependencies

- **Feature 018 (Informe al Cierre del Período)**: provee la presentación tipo
  reporte, el contenido de ambos informes por quincena y el mecanismo de
  emisión/guardado/re-emisión que esta feature adelanta al período abierto.
- **Feature 021 (Informe de Asistencia Mensual desde el Calendario)**: comparte
  el criterio de "última copia emitida por mes" y la presentación tipo reporte;
  el informe de Q1 de cierre convive con el informe mensual una vez cerrado el
  mes. La página Calendario queda reservada a los informes del mes cerrado; la
  emisión anticipada de Q1 vive en "Resumen del Período".
- **Feature 013 (Reestructurar almacenamiento por período / cierre de período)**:
  provee el concepto de período del mes (abierto/cerrado) y el padrón fechado
  por período; esta feature emite justamente mientras el período sigue abierto.
- **Feature 011 (Resumen del Período)** y **Feature 004 (Dominio de
  presentismo)**: proveen el cálculo por empleado (horas computadas y
  contadores) y el recorte por quincena (Q1: días 1–15) que el informe
  anticipado usa.
- **Feature 017 (Fecha de ingreso / sincronización de padrón)**: necesaria para
  acotar los días de empleados con vínculo parcial dentro de la primera
  quincena.
- **Feature 016 (Control de acceso por roles)**: define quién puede disparar y
  re-emitir el informe anticipado de Q1.
- **Feature 011 (pantalla "Resumen del Período")**: pantalla donde se ofrece la
  acción de emisión anticipada de Q1 y donde ya vive el selector y la vista
  interactiva de la primera quincena en curso (ver FR-017).
