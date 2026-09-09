# Feature Specification: Cálculo del porcentaje de presentismo del informe de cierre

**Feature Branch**: `019-calculo-presentismo`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Documentar el cálculo del porcentaje de presentismo del informe de cierre de período. Regla: el presentismo individual de un empleado = horas efectivamente trabajadas / horas esperadas, sobre los días LABORABLES del tramo. Días que NO cuentan ni en el numerador ni en el denominador: feriados, vacaciones, días No Laborables. Días de LICENCIA PAGA (ART, enfermedad, etc.) SÍ cuentan en el denominador (eran días laborables donde se esperaba trabajo) pero NO en el numerador (no se trabajó): penalizan el presentismo. Un día laborable ausente sin justificar también pesa en el denominador y no en el numerador. Si el empleado fichó realmente pese a tener una justificación, esas horas sí cuentan como trabajadas. El presentismo es null solo si no hubo horas esperadas (todo el tramo No Laborable o de vacaciones); un tramo entero de licencia paga da 0%, no null. El presentismo general del informe = suma de horas trabajadas de todos los empleados / suma de horas esperadas. La columna \"Horas\" del informe y la liquidación NO cambian: siguen incluyendo el crédito fijo de feriados y licencias pagas (solo el cálculo del % de presentismo los excluye del numerador). Ejemplo de referencia: legajo 35, 2da quincena agosto 2026: 45 horas trabajadas / 90 horas esperadas = 50%."

## Clarifications

### Session 2026-09-09

- Q: ¿Los días de licencia paga (ART, enfermedad) bajan el presentismo o son
  neutrales como las vacaciones? → A: Bajan el presentismo. El denominador
  sigue contemplando el total de horas esperadas del tramo, incluidos los días
  de licencia paga; el numerador solo cuenta horas efectivamente trabajadas.
  Las vacaciones, en cambio, se excluyen de ambos lados (el empleado no debía
  presentarse).
- Q: ¿Los feriados aportan al cálculo? → A: No. El feriado no se cuenta ni en
  horas esperadas ni en horas trabajadas del presentismo, aunque su crédito
  fijo de jornada siga sumando a la columna "Horas" y a la liquidación.
- Q: ¿Qué muestra el presentismo de un empleado que estuvo todo el tramo de
  licencia paga? → A: 0 %. Había horas esperadas (días laborables) y no se
  trabajaron. El valor "sin dato" (—) queda reservado para cuando no hubo
  ninguna hora esperada (tramo entero No Laborable o de vacaciones).
- Q: Si un empleado con una justificación vigente igual fichó ese día, ¿esas
  horas cuentan? → A: Sí. Si hubo jornada real (Completa o Incompleta), sus
  horas trabajadas cuentan en el numerador; el crédito fijo de una
  justificación sin fichadas no.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Leer el presentismo individual de un empleado en el informe de cierre (Priority: P1)

Quien revisa el informe de cierre de un período abre la grilla de resumen y,
por cada empleado, ve una columna "Presentismo" con un porcentaje (o "—" si no
aplica). Ese porcentaje responde a una única pregunta: **de las horas que se
esperaba que trabajara en los días laborables del tramo, ¿qué proporción
efectivamente trabajó?**

**Why this priority**: Es el indicador que se usa para liquidar el adicional
por presentismo. Si el número no es auditable y estable, cada cierre se
discute a mano. Sin esta historia no hay funcionalidad.

**Independent Test**: Tomar un empleado con una mezcla conocida de días
(trabajados, ausente sin aviso, licencia paga, feriado, vacaciones), calcular
a mano horas trabajadas y horas esperadas según las reglas de este documento,
y verificar que la columna "Presentismo" del informe muestra ese cociente.

**Acceptance Scenarios**:

1. **Given** un empleado que en el tramo tuvo 5 días laborables trabajados a
   jornada completa y 5 días laborables de licencia paga (ART),
   **When** se consulta su presentismo individual,
   **Then** el resultado es `horas trabajadas / horas esperadas` = 50 %
   (5 jornadas trabajadas sobre 10 jornadas laborables esperadas), y su
   columna "Horas" sigue mostrando las 10 jornadas (trabajo + crédito de
   licencia).
2. **Given** un empleado que trabajó todos sus días laborables del tramo,
   **When** se consulta su presentismo individual,
   **Then** el resultado es 100 %, sin importar cuántos feriados o días No
   Laborables tuvo el tramo.
3. **Given** un empleado con un día laborable "Sin fichadas" sin justificación,
   **When** se consulta su presentismo,
   **Then** ese día suma jornada esperada al denominador y 0 al numerador
   (baja el porcentaje).
4. **Given** un empleado que tuvo una justificación vigente un día pero igual
   registró entrada y salida,
   **When** se consulta su presentismo,
   **Then** las horas reales de esa jornada cuentan como trabajadas.
5. **Given** un empleado que pasó el tramo completo de vacaciones,
   **When** se consulta su presentismo,
   **Then** el valor es "sin dato" (—), no 0 %.
6. **Given** un empleado que pasó el tramo completo de licencia paga,
   **When** se consulta su presentismo,
   **Then** el valor es 0 % (hubo horas esperadas y no se trabajaron).

---

### User Story 2 - Leer el presentismo general del período (Priority: P2)

Quien revisa el informe de cierre ve, en el pie de la grilla y en la leyenda,
un presentismo general del período: la proporción agregada de horas trabajadas
sobre horas esperadas de todos los empleados del padrón del tramo.

**Why this priority**: Da una lectura de un vistazo de cómo cerró el período
antes de entrar empleado por empleado. Depende de que el cálculo individual
(US1) ya esté definido.

**Independent Test**: Sumar las horas trabajadas y las horas esperadas de cada
empleado del tramo (con las reglas de US1) y verificar que el presentismo
general del informe es el cociente de esos dos totales.

**Acceptance Scenarios**:

1. **Given** un período con varios empleados, cada uno con su cálculo
   individual de horas trabajadas y esperadas,
   **When** se consulta el presentismo general,
   **Then** es `Σ horas trabajadas / Σ horas esperadas` de todos los empleados
   (no el promedio de los porcentajes individuales).
2. **Given** empleados con filas de anomalía (sin categoría de presentismo),
   **When** se calcula el presentismo general,
   **Then** esas filas no aportan ni horas trabajadas ni horas esperadas.
3. **Given** un tramo donde ningún empleado tuvo horas esperadas,
   **When** se consulta el presentismo general,
   **Then** el valor es "sin dato" (—).

---

### User Story 3 - Consistencia entre presentismo y columna "Horas" (Priority: P3)

Quien revisa el informe entiende, por la leyenda, que la columna "Horas" y el
porcentaje de presentismo responden a preguntas distintas y por eso pueden no
coincidir: "Horas" es lo que se liquida (incluye el crédito de feriados y de
licencias pagas); el presentismo mide solo trabajo efectivo sobre lo esperado.

**Why this priority**: Evita el reclamo "trabajó 99 horas y el presentismo dice
50 %". Es una aclaración de presentación, no un cálculo nuevo.

**Independent Test**: Verificar que la leyenda del informe describe qué entra y
qué no en cada número, y que el subtotal de horas del detalle de un empleado
sigue coincidiendo con su columna "Horas" (no con el numerador del
presentismo).

**Acceptance Scenarios**:

1. **Given** un empleado con días de licencia paga o feriados en el tramo,
   **When** se compara su columna "Horas" con el numerador de su presentismo,
   **Then** "Horas" es mayor o igual (incluye créditos que el presentismo
   excluye) y la leyenda explica la diferencia.
2. **Given** el detalle día por día de un empleado,
   **When** se suman las horas de cada día,
   **Then** el subtotal coincide con la columna "Horas" de su fila en el
   resumen.

---

### Edge Cases

- **Tramo en curso**: los días posteriores a "hoy" no se proyectan; el
  presentismo se calcula solo sobre los días ya transcurridos del tramo.
- **Empleado sin categoría de presentismo (anomalía)**: no tiene cálculo;
  presentismo "sin dato" y no aporta a los totales generales.
- **Jornada incompleta** (entrada sin salida): las horas efectivas de ese día
  (habitualmente 0) son las que cuentan en el numerador; el día sigue pesando
  la jornada esperada completa en el denominador.
- **Justificación "No paga"** (p. ej. "Sin Aviso"): se trata como ausencia a
  efectos del presentismo — jornada esperada en el denominador, 0 en el
  numerador.
- **Feriado "cumplido"** con crédito de jornada: el crédito va a "Horas" pero
  no al presentismo (ni numerador ni denominador).
- **Día de vacaciones que cae en feriado o fin de semana**: no aporta a
  ninguno de los dos lados (ya lo excluían tanto la regla de vacaciones como
  la de no laborable / feriado).
- **Redondeo**: el porcentaje se deriva de un cociente sin redondear; la
  presentación como "%" es responsabilidad de la interfaz.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE calcular, por empleado y por tramo del informe de
  cierre, un **presentismo individual** = `horas trabajadas / horas esperadas`.
- **FR-002**: Las **horas esperadas** (denominador) DEBEN sumar la jornada
  esperada del empleado por cada día **Laborable** del tramo, excluyendo los
  días de **vacaciones**.
- **FR-003**: Los días **Feriado** y los días **No Laborables** NO DEBEN sumar
  a las horas esperadas del presentismo.
- **FR-004**: Los días de **licencia paga** (cualquier justificación de tipo de
  pago "Paga": ART, enfermedad, etc.) DEBEN sumar jornada esperada al
  denominador (eran días laborables con trabajo esperado).
- **FR-005**: Las **horas trabajadas** (numerador) DEBEN sumar únicamente las
  horas efectivas de jornadas **Completas o Incompletas** en días Laborables no
  vacacionales. Un día sin jornada real aporta 0, aunque tenga crédito fijo por
  justificación paga o por feriado.
- **FR-006**: Si un día tiene una justificación vigente pero además hubo
  fichadas reales que produjeron una jornada Completa o Incompleta, esas horas
  reales DEBEN contar en el numerador.
- **FR-007**: El presentismo individual DEBE ser "sin dato" (valor nulo)
  **solo** cuando las horas esperadas del tramo son 0 (tramo entero No
  Laborable o de vacaciones). Con horas esperadas > 0 y 0 trabajadas, el
  resultado DEBE ser 0 %, no "sin dato".
- **FR-008**: El sistema DEBE calcular un **presentismo general** del tramo =
  `Σ horas trabajadas / Σ horas esperadas` sobre todos los empleados del padrón
  del período, con las mismas reglas de FR-002..FR-006.
- **FR-009**: El presentismo general DEBE ser "sin dato" cuando la suma de
  horas esperadas es 0.
- **FR-010**: Las filas de **anomalía** (empleado sin categoría de presentismo)
  NO DEBEN aportar horas trabajadas ni horas esperadas al presentismo general,
  y su presentismo individual DEBE ser "sin dato".
- **FR-011**: La columna "Horas" del informe y el subtotal de horas del detalle
  por empleado NO DEBEN cambiar por estas reglas: siguen incluyendo el crédito
  fijo de feriados y de licencias pagas y siguen cuadrando entre sí.
- **FR-012**: El informe DEBE mostrar una leyenda que aclare qué días entran y
  cuáles no en el cálculo del presentismo (excluye feriados y vacaciones;
  cuenta solo trabajo efectivo sobre días laborables).
- **FR-013**: El cálculo DEBE considerar únicamente los días del tramo ya
  transcurridos (los días futuros de un período en curso no se proyectan).
- **FR-014**: Reabrir y volver a cerrar un período, o re-emitir el informe,
  DEBE recalcular el presentismo con estas reglas (el informe guardado de un
  período ya cerrado conserva el valor con el que se emitió hasta que se
  re-emita).

### Key Entities *(include if feature involves data)*

- **Presentismo individual**: cociente 0..1 (o "sin dato") asociado a un
  empleado dentro de un tramo del informe de cierre. Derivado de sus horas
  trabajadas y horas esperadas del tramo.
- **Presentismo general**: cociente 0..1 (o "sin dato") del tramo completo.
  Derivado de la suma de horas trabajadas y de horas esperadas de todos los
  empleados del padrón del período.
- **Horas esperadas (presentismo)**: minutos de jornada esperada acumulados
  por los días Laborables no vacacionales del tramo transcurrido.
- **Horas trabajadas (presentismo)**: minutos de trabajo efectivo (jornadas
  Completas/Incompletas) en esos mismos días. Distinto de "Horas" del informe,
  que además incluye créditos fijos.
- **Día del tramo**: unidad de clasificación (Laborable / Feriado / No
  Laborable) con, opcionalmente, una justificación vigente (con su tipo de
  pago) y/o una jornada calculada (estado + horas efectivas).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para el caso de referencia (legajo 35, 2ª quincena de agosto
  2026: 5 días laborables trabajados a jornada completa y 5 días laborables de
  licencia ART), el presentismo individual mostrado es exactamente **50 %**
  (45 h trabajadas / 90 h esperadas) y su columna "Horas" muestra 99 h.
- **SC-002**: Un empleado que trabajó el 100 % de sus días laborables del
  tramo muestra 100 % de presentismo, cualquiera sea la cantidad de feriados o
  fines de semana del tramo.
- **SC-003**: El presentismo general de un tramo es reproducible a mano:
  `Σ horas trabajadas / Σ horas esperadas` de todos los empleados coincide con
  el valor del informe (diferencia 0, salvo el formateo de "%").
- **SC-004**: Ningún empleado con al menos un día laborable esperado en el
  tramo muestra "sin dato"; solo lo muestran los que no tuvieron ningún día
  laborable esperado.
- **SC-005**: Para cada empleado, el subtotal de horas de su detalle día por
  día sigue coincidiendo con su columna "Horas" del resumen (no con el
  numerador del presentismo).

## Assumptions

- La "jornada esperada" diaria de cada empleado proviene de su modalidad de
  presentismo ya configurada (feature 004); este documento no la redefine.
- "Licencia paga" = cualquier justificación cuyo tipo de pago es "Paga". No se
  distingue entre ART, enfermedad u otras a efectos del presentismo: todas
  pesan en el denominador y no en el numerador.
- Las "vacaciones" son la justificación-espejo de una Asignación de Vacaciones
  (feature 015); mantienen el trato neutro que ya tenían (fuera de numerador y
  denominador).
- El tramo del informe (Mes / Q1 / Q2) y el universo de empleados (padrón del
  período) se resuelven como ya lo hace el informe de cierre (feature 018);
  este documento solo fija cómo se calcula el porcentaje sobre ese universo.
- El informe de cierre de un período ya cerrado se sirve desde la copia
  guardada; para reflejar estas reglas en un período cerrado antes de su
  vigencia hay que re-emitir el informe.
- Implementación de referencia: `src/presentismo/domain/resumen-periodo.js`
  (`proyectarResumenPeriodo`) para el cálculo por empleado y
  `src/presentismo/domain/informe-cierre.js` (`construirInformeCierre`) para
  los totales y el presentismo general.
