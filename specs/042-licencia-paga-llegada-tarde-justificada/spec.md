# Feature Specification: Llegada Tarde Justificada con Licencia Paga

**Feature Branch**: `042-licencia-paga-llegada-tarde-justificada`

**Created**: 2026-11-24

**Status**: Implemented (documentación retroactiva — extiende la feature 041)

**Input**: User description: "Caso 20-11-2026, legajos 10 y 53. Ambos tenían turno de examen médico; la llegada tarde es justificada (paga). El legajo 10 fichó a las 12:20 y el 53 no fichó la entrada; ambos se retiran a horario. Deben computarse las horas trabajadas + las horas de licencia sumando la jornada diaria completa." Errores detectados: (1) la fichada de las 12:20 se interpretaba como salida y la pisaba la de las 16:02; (2) con fichada de entrada desaparecía el botón para justificar; (3) con la ausencia justificada no se podía corregir el horario de entrada. Ajustes posteriores: los días justificados no figuran como llegada tarde en el resumen, y no debe aparecer la alerta "revisar" en un día con licencia Paga y jornada completa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrada tardía fuera de la ventana de apertura (Priority: P1)

Un empleado ficha su primera entrada después del fin de la ventana de apertura
(ej. 12:20, con ventana hasta las 12:00) y ficha la salida más tarde. La primera
fichada debe ser la entrada, no una salida pisada por la fichada posterior.

**Why this priority**: sin esto el día queda incompleto y las horas trabajadas son incorrectas.

**Acceptance Scenarios**:

1. **Given** fichadas 12:20 y 16:02 en un día laborable, **When** se calcula la jornada, **Then** entrada = 12:20, salida = 16:02 y la jornada es Completa.
2. **Given** una sola fichada fuera de la ventana de apertura, **When** se calcula, **Then** se conserva el comportamiento previo (no se infiere entrada).

---

### User Story 2 - Justificar y corregir días con fichadas o con licencia Paga (Priority: P1)

El responsable puede justificar un día que ya tiene fichadas (desde la fila de
la tabla y no solo desde el botón general) y corregir el horario de un día con
licencia Paga, de modo que trabajado + licencia completen la jornada esperada.

**Acceptance Scenarios**:

1. **Given** una fila con fichada de entrada, **When** se muestra la tabla de fichadas del día, **Then** el botón "Justificación" está disponible (salvo días No aplica, Feriado cumplido o Anomalía, o ya justificados).
2. **Given** una fila con licencia Paga (no Vacaciones), **When** se muestra la tabla, **Then** el botón "Corregir" está disponible.
3. **Given** licencia Paga y una corrección de entrada sin valor de total explícito, **When** se calcula la jornada, **Then** total = max(jornada esperada, trabajado corregido) y horas de licencia = total − trabajado; la justificación se conserva.
4. **Given** licencia No paga o Vacaciones con corrección, **Then** se mantiene el comportamiento previo (la justificación se descarta).

---

### User Story 3 - La llegada tarde justificada no cuenta como tarde (Priority: P2)

En el resumen del período, un día con justificación vigente no suma a la
columna Llegadas tarde ni genera descuento por tardanza.

**Acceptance Scenarios**:

1. **Given** un día con entrada fuera de tolerancia y justificación vigente, **When** se proyecta el resumen, **Then** no cuenta como llegada tarde.

---

### User Story 4 - Sin alerta de revisión en licencia Paga con jornada completa (Priority: P2)

Un día con licencia Paga cuyas fichadas dan una jornada Completa no se señala
para revisión.

**Acceptance Scenarios**:

1. **Given** licencia Paga y fichadas de entrada y salida, **Then** `requiereJustificacionRevision` es falso.
2. **Given** licencia Paga con fichadas incompletas, o licencia No paga/Vacaciones con fichadas, **Then** el día sigue señalado para revisión.

## Requirements *(mandatory)*

- **FR-001**: Si no hay fichada dentro de la ventana de apertura y hay una fichada de salida posterior, la primera fichada del día DEBE tomarse como entrada.
- **FR-002**: La acción de justificar DEBE estar disponible en toda fila sin justificación vigente, salvo situaciones No aplica, Feriado cumplido y Anomalía.
- **FR-003**: La acción de corregir horario DEBE estar disponible en filas con licencia Paga (excepto Vacaciones).
- **FR-004**: Con licencia Paga y corrección de horario sin total explícito, el total DEBE ser el mayor entre la jornada esperada y lo trabajado corregido, con licencia = total − trabajado, conservando la justificación (extiende 041 FR-003/FR-004/FR-009).
- **FR-005**: Un día con justificación vigente NO DEBE contar como llegada tarde ni generar descuento por tardanza en el resumen del período (ajusta 041 FR-012 para días justificados).
- **FR-006**: Un día con licencia Paga y jornada Completa NO DEBE señalarse para revisión por fichadas posteriores a la justificación; los demás casos de 012 FR-010/FR-017 se mantienen.

## Success Criteria *(mandatory)*

- **SC-001**: En el caso de referencia (20-11-2026, legajos 10 y 53), cada legajo computa trabajadas + licencia = jornada diaria completa.
- **SC-002**: El legajo 10 muestra entrada 12:20 y salida 16:02, sin alerta de revisión ni llegada tarde en el resumen.
- **SC-003**: El legajo 53 puede corregir su horario de entrada con la licencia vigente.

## Assumptions

- Las reglas de la feature 041 se mantienen salvo lo indicado arriba.
- Componentes alcanzados: cálculo de la jornada (`jornada.js`), proyección del resumen (`resumen-periodo.js`) y tabla de fichadas del día (`TablaFichadasHoy.jsx`).
- Los datos ya cargados no se migran; el recálculo es automático al consultar.
