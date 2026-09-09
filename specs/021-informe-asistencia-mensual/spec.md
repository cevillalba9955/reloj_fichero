# Feature Specification: Informe de Asistencia Mensual desde el Calendario

**Feature Branch**: `021-informe-asistencia-mensual`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Informe-asistencia-mensual : desde la pagina calendario, una vez cerrado el periodo mostrar boton para ver y descargar informe mensual. igual que los generados en Resumen periodo, pero esta vez unificando las quincenas."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver y descargar el informe mensual desde el Calendario (Priority: P1)

Un administrador está en la página **Calendario** viendo un mes cuyo período ya
está cerrado. En la propia página ve una acción para **ver en pantalla** y
**descargar** el informe de asistencia del mes. El informe tiene la misma
presentación y el mismo contenido que los informes que hoy se obtienen desde la
página "Resumen del Período" (informe de resumen de horas computadas + informe
de detalle de asistencia empleado por empleado), pero referido al **mes
calendario completo**: en una instalación quincenal consolida las dos quincenas
(Q1 y Q2) del mes en un único juego de informes; en una instalación mensual es
el informe de cierre de ese mes.

**Why this priority**: hoy, en una instalación quincenal, el responsable sólo
puede emitir informes por quincena y no dispone de una vista mensual
consolidada para archivar o entregar. Además, aunque el informe exista, hay que
ir a otra pantalla ("Resumen del Período") para obtenerlo; tenerlo a un clic
desde el Calendario —donde justamente se cierra el período— es el flujo
natural. Es el valor central de la feature.

**Independent Test**: con un mes cuyo período está cerrado y con fichadas,
correcciones y justificaciones cargadas, se abre la página Calendario en ese
mes, se usa la acción del informe mensual y se verifica que se puede ver en
pantalla y descargar un documento que lista a todos los empleados del período
con sus totales de horas y contadores del **mes completo**, con encabezado que
identifica el mes y el sello de emisión.

**Acceptance Scenarios**:

1. **Given** un mes con período cerrado y calendario generado, **When** el
   administrador abre la página Calendario en ese mes, **Then** ve, dentro de
   la página, una acción visible para **ver** y otra para **descargar** el
   informe de asistencia mensual.
2. **Given** la acción de ver el informe mensual, **When** el administrador la
   activa, **Then** se muestra en pantalla el informe de resumen de horas
   computadas (una fila por empleado del período con total de horas y
   contadores) y el informe de detalle de asistencia (una sección por empleado
   con su día por día), ambos acotados al mes calendario completo.
3. **Given** la acción de descargar el informe mensual, **When** el
   administrador la activa, **Then** obtiene un documento apto para imprimir y
   archivar con el mismo contenido que la vista en pantalla.
4. **Given** un empleado con una corrección manual o justificación vigente que
   modifica sus horas de un día del mes, **When** se ve o descarga el informe
   mensual, **Then** el total de horas de ese empleado refleja el valor
   ajustado y su fila queda señalada como que tiene ajustes aplicados.
5. **Given** el informe mensual de un mes cerrado, **When** un tercero lo mira,
   **Then** puede identificar a qué mes corresponde y cuándo y por quién fue
   emitido, sin conocer la aplicación.

---

### User Story 2 - El informe mensual unifica las quincenas (Priority: P2)

En una instalación configurada en modalidad quincenal, el informe que se obtiene
desde el Calendario cubre el **mes calendario completo** (días 1 a fin de mes)
para todos los empleados, cualquiera sea su modalidad, en lugar de un solo
tramo quincenal. Las cifras del mes coinciden con la suma de las dos quincenas
del mismo mes cerrado.

**Why this priority**: es la diferencia concreta que pide la feature respecto de
lo que ya existe ("unificando las quincenas"). Sin esto, el informe del
Calendario sería sólo un atajo a un informe quincenal ya disponible.

**Independent Test**: en una instalación quincenal, sobre un mes cerrado, se
emiten los informes de Q1 y de Q2 (flujo existente) y el informe mensual del
Calendario; para cada empleado, el total de horas y cada contador del informe
mensual son iguales a la suma de sus valores de Q1 y Q2.

**Acceptance Scenarios**:

1. **Given** una instalación quincenal y un mes cerrado, **When** se ve el
   informe mensual desde el Calendario, **Then** el detalle de cada empleado
   incluye todos los días del 1 al último del mes y el encabezado indica que el
   alcance es el mes completo (no un tramo quincenal).
2. **Given** el mismo mes cerrado, **When** se comparan el informe mensual y
   los informes de Q1 y Q2, **Then** para cada empleado el total de horas del
   mes es igual a la suma de sus horas de Q1 y Q2, e igualmente para ausencias,
   llegadas tarde, retiros anticipados y jornadas completas e incompletas.
3. **Given** una instalación mensual, **When** se ve el informe mensual desde
   el Calendario, **Then** el informe es el informe de cierre de ese mes (no
   hay quincenas que unificar) y su contenido coincide con el que ya se obtiene
   desde "Resumen del Período" para ese mes.
4. **Given** un mes cerrado con empleados de más de una modalidad, **When** se
   ve el informe mensual, **Then** todos los empleados del período aparecen con
   su asistencia del mes completo, sin importar su modalidad.

---

### User Story 3 - La acción sólo está disponible con el período cerrado (Priority: P3)

En la página Calendario, la acción para ver y descargar el informe mensual se
ofrece únicamente cuando el período del mes mostrado está cerrado. Para un mes
en curso, o concluido pero todavía no cerrado, la acción no se ofrece. Si un mes
cerrado se reabre, el informe mensual guardado queda marcado como
desactualizado, igual que ocurre con los informes de cierre por quincena.

**Why this priority**: evita entregar un informe "mensual" sobre datos que
todavía pueden cambiar y mantiene coherencia con la regla ya vigente de que los
informes se emiten sobre períodos cerrados. Es un refuerzo de las Historias 1 y
2, no un flujo de valor independiente.

**Independent Test**: sobre un mes no cerrado, se abre la página Calendario en
ese mes y se verifica que no aparece la acción del informe mensual; se cierra el
período y la acción aparece; se reabre el período y el informe mensual queda
señalado como desactualizado.

**Acceptance Scenarios**:

1. **Given** un mes en curso o concluido pero no cerrado, **When** el
   administrador abre la página Calendario en ese mes, **Then** no se ofrece la
   acción de ver ni de descargar el informe mensual.
2. **Given** un mes cuyo período se acaba de cerrar, **When** la página
   Calendario refleja el cierre, **Then** aparece la acción del informe mensual
   y el informe ya está disponible sin un paso adicional del administrador.
3. **Given** un mes cerrado con informe mensual disponible, **When** el
   administrador reabre el período, **Then** el informe mensual guardado queda
   señalado como desactualizado y se regenera al volver a cerrar el período o
   al re-emitirlo a demanda.
4. **Given** un mes sin calendario generado, **When** el administrador abre la
   página Calendario en ese mes, **Then** no se ofrece la acción del informe
   mensual (no hay período que cerrar ni informe que emitir).

---

### Edge Cases

- **Mes sin empleados en el padrón del período**: el informe mensual se emite
  igual, indicando que no hay empleados en el período.
- **Empleado con vínculo parcial en el mes** (ingreso o egreso intra-mes,
  feature 017): se incluye en el informe mensual sólo con los días en que su
  vínculo estaba vigente; su total mensual sigue cuadrando con la suma de sus
  quincenas.
- **Empleado del padrón del período sin categoría de presentismo**: aparece
  señalado como anomalía en el informe mensual, sin acumulados calculados como
  si fueran normales, igual que en los informes por quincena.
- **Mes con una sola quincena cerrada y la otra con incidencias**: como el
  cierre es del período del mes (no por quincena), si el mes no está cerrado la
  acción no aparece; si está cerrado, el informe mensual cubre todo el mes.
- **Días no laborables, feriados, licencias y vacaciones**: aparecen en el
  detalle con su clasificación y sin contar como ausencia; se computan según
  las reglas de presentismo vigentes, igual que en los informes por quincena.
- **Copia impresa o descargada antes de una reapertura**: no se actualiza sola;
  queda a cargo del área que la recibió, igual que con los informes de cierre.
- **Usuario sin rol de edición**: puede ver y descargar el informe mensual si
  ya está disponible, pero no puede dispararlo ni re-emitirlo.
- **Mes en el que la instalación cambió de modalidad**: el informe mensual
  cubre el mes calendario completo según el estado del período cerrado; el
  alcance del documento es siempre el mes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La página Calendario MUST ofrecer, para el mes mostrado, una
  acción para **ver en pantalla** y una acción para **descargar** el informe de
  asistencia mensual, y MUST ofrecerlas únicamente cuando el período de ese mes
  está cerrado.
- **FR-002**: El informe de asistencia mensual MUST tener la misma presentación
  y el mismo contenido que los informes que hoy se obtienen desde la página
  "Resumen del Período" (informe de resumen de horas computadas + informe de
  detalle de asistencia empleado por empleado), referido al mes calendario
  completo.
- **FR-003**: En una instalación en modalidad quincenal, el informe mensual
  MUST consolidar las dos quincenas (Q1 y Q2) del mes: sus cálculos y su
  detalle MUST cubrir los días 1 a fin de mes para todos los empleados del
  período, cualquiera sea su modalidad.
- **FR-004**: Para cada empleado, cada cifra del informe mensual (total de
  horas computadas, ausencias, llegadas tarde, retiros anticipados y jornadas
  completas e incompletas) MUST ser igual a la suma de sus valores de Q1 y Q2
  del mismo mes cerrado; el subtotal de horas del detalle de cada empleado MUST
  cuadrar con su fila del resumen mensual.
- **FR-005**: En una instalación en modalidad mensual, la acción del Calendario
  MUST entregar el informe de cierre de ese mes, con contenido idéntico al que
  se obtiene para ese mes desde "Resumen del Período".
- **FR-006**: Las cifras del informe mensual MUST aplicar las mismas reglas de
  cálculo ya vigentes: una corrección manual o justificación vigente prevalece
  sobre la fichada original, y el margen de tolerancia sólo interviene en el
  cálculo de horas, no en las horas mostradas (hora real o corregida).
- **FR-007**: El universo de empleados del informe mensual MUST ser el padrón
  del período (la foto de empleados tomada para ese mes), no el padrón vigente
  al momento de la emisión.
- **FR-008**: El informe mensual MUST exhibir de forma visible un sello de
  emisión con la identificación del mes, el alcance (mes completo), la fecha y
  hora de emisión y el responsable, y MUST señalar explícitamente los
  pendientes del mes (jornadas incompletas, empleados sin categoría de
  presentismo y días con corrección o justificación), o indicar que no hay
  pendientes.
- **FR-009**: El sistema MUST generar y guardar el informe mensual
  automáticamente al cerrar el período del mes, y MUST ofrecer una acción
  explícita para re-emitirlo a demanda sobre un mes que ya está cerrado. Cada
  emisión reemplaza la copia guardada del mes; el sistema conserva sólo la
  última copia emitida.
- **FR-010**: Reabrir un mes cerrado MUST invalidar la copia guardada de su
  informe mensual (queda señalada como desactualizada). Al volver a cerrar el
  mes, o al re-emitir a demanda, la nueva emisión MUST reflejar los valores
  actualizados.
- **FR-011**: Ver y descargar un informe mensual ya disponible MUST estar
  abierto a cualquier usuario que acceda a la página; disparar o re-emitir el
  informe mensual MUST estar restringido a los roles con permiso de edición o
  configuración (feature 016).
- **FR-012**: El informe mensual MUST entregarse como un documento apto para
  imprimir y archivar, con una única presentación tipo reporte. Una exportación
  tabular para procesar en planilla queda fuera de alcance.
- **FR-013**: El sistema MUST registrar en el log estructurado cada emisión del
  informe mensual (mes, alcance, responsable y momento), sin exponer datos
  biométricos ni credenciales.
- **FR-014**: Cuando el mes mostrado no tiene calendario generado o su período
  no está cerrado, la página Calendario MUST NOT ofrecer la acción del informe
  mensual.

### Key Entities *(include if feature involves data)*

- **Informe de Asistencia Mensual**: juego de documentos emitido para un mes
  cerrado —informe de resumen de horas computadas + informe de detalle de
  asistencia—, con alcance el mes calendario completo. Incluye el sello de
  emisión, una fila de resumen por empleado, el total general de horas, el
  detalle día por día por empleado y la lista de pendientes del mes. El sistema
  guarda la última copia emitida por mes.
- **Período del Mes (cerrado)**: el calendario del mes marcado como solo
  lectura; precondición para ofrecer y emitir el informe mensual. En modalidad
  quincenal, un único cierre del mes habilita el informe mensual que consolida
  Q1 y Q2.
- **Padrón del Período**: foto de los empleados correspondientes al mes; define
  el universo de filas y secciones del informe mensual.
- **Fila de Resumen Mensual por Empleado**: legajo, nombre, modalidad, total de
  horas computadas del mes y contadores acumulados del mes.
- **Sello de Emisión**: mes, alcance (mes completo), fecha y hora de emisión y
  responsable; presente en el informe mensual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Desde la página Calendario, sobre un mes cerrado, el
  administrador obtiene el informe mensual (verlo y descargarlo) en menos de 1
  minuto y sin salir de la página.
- **SC-002**: En una instalación quincenal, para el 100% de los empleados del
  período, el total de horas y cada contador del informe mensual coinciden
  exactamente con la suma de sus valores de Q1 y Q2 del mismo mes cerrado.
- **SC-003**: Para cada empleado, el total de horas del resumen mensual coincide
  exactamente con la suma de las horas de sus días en el detalle mensual
  (cuadre 100%).
- **SC-004**: El informe mensual incluye al 100% de los empleados del padrón del
  período, sin omisiones ni duplicados.
- **SC-005**: El 100% de los días del mes con jornada incompleta, con corrección
  o justificación aplicada, o con empleado sin categoría de presentismo, aparece
  señalado como pendiente en el informe mensual.
- **SC-006**: La acción del informe mensual aparece en la página Calendario en
  el 100% de los meses con período cerrado y calendario generado, y no aparece
  en el 100% de los meses sin cerrar o sin calendario.
- **SC-007**: Tras reabrir un mes, ajustar una jornada y volver a cerrarlo, una
  nueva emisión refleja el cambio en el informe mensual en el 100% de los casos.
- **SC-008**: El 100% de los informes mensuales emitidos permite a un tercero
  identificar, con sólo mirar el documento, a qué mes corresponde y cuándo y por
  quién fue emitido.
- **SC-009**: Un usuario sin rol de edición o configuración no logra disparar ni
  re-emitir el informe mensual en el 100% de los intentos, pero sí puede verlo y
  descargarlo cuando ya está disponible.

## Assumptions

- La feature se apoya en el mecanismo de "cerrar período" ya existente (feature
  013) como precondición; en modalidad quincenal, el cierre es del período del
  mes (un solo estado `cerrado` por mes), y ese cierre habilita el informe
  mensual que unifica Q1 y Q2. La feature no redefine qué dispara el cierre ni
  cómo se reabre.
- El informe mensual se construye sobre el estado ya persistido del mes
  (calendario, fichadas, correcciones, justificaciones y padrón del período),
  reutilizando el mismo cálculo por empleado de las features 004 y 011. No
  introduce escritura a un esquema Oracle de liquidación (Principio VI): la
  salida es un documento legible obtenido desde la aplicación.
- El informe mensual reutiliza la misma presentación tipo reporte de los
  informes de cierre por quincena (feature 018), aplicada al alcance "mes
  completo".
- El sistema guarda una única copia del informe mensual por mes (la última
  emitida), regenerada al cerrar el mes y en cada re-emisión manual. No conserva
  un archivo histórico de emisiones anteriores.
- El período por defecto sobre el que se ofrece el informe mensual es el mes que
  el administrador está viendo en la página Calendario.
- El control de acceso usa los roles ya existentes (feature 016): lectura del
  documento abierta, emisión/re-emisión restringida a edición o configuración.
- El idioma del informe es español y la instalación opera en un único huso
  horario local.
- El envío del informe por correo u otro canal externo queda fuera de alcance:
  la salida es un documento que el administrador obtiene desde la aplicación.

## Dependencies

- **Feature 018 (Informe al Cierre del Período)**: provee la presentación tipo
  reporte y el mecanismo de emisión/guardado/re-emisión que esta feature
  extiende al alcance "mes completo".
- **Feature 013 (Reestructurar almacenamiento por período / cierre de período)**:
  provee el concepto de período del mes cerrado (solo lectura) y el padrón
  fechado por período.
- **Feature 011 (Resumen del Período)** y **Feature 004 (Dominio de
  presentismo)**: proveen el cálculo por empleado (horas computadas y
  contadores) que el informe mensual consolida.
- **Feature 017 (Fecha de ingreso / sincronización de padrón)**: necesaria para
  acotar los días de empleados con vínculo parcial en el mes.
- **Feature 016 (Control de acceso por roles)**: define quién puede disparar y
  re-emitir el informe mensual.
- **Feature 007 (UI Calendario mensual)**: provee la página Calendario donde se
  agrega la acción de ver y descargar el informe mensual.
