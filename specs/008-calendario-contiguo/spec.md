# Feature Specification: Generación de Calendario desde la IU con Contigüidad Garantizada

**Feature Branch**: `008-calendario-contiguo`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "generara calendario desde IU, asegurarse que sea contiguo, no saltear ningun periodo, anterior o proximo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generar el mes contiguo faltante desde la pantalla (Priority: P1)

Como responsable de administración de personal, cuando navego a un mes que todavía no tiene
calendario y ese mes es el inmediatamente anterior o el inmediatamente posterior a los meses
ya generados, quiero un botón que genere el calendario de ese período sin salir de la
pantalla, para poder ir armando la secuencia de meses de trabajo directamente desde la
interfaz, sin ejecutar comandos técnicos.

**Why this priority**: es la capacidad central de la feature. Sin ella, dar de alta un nuevo
mes exige intervención técnica por fuera de la aplicación. Un botón que genere el mes contiguo
entrega valor por sí solo: convierte a la pantalla en la única herramienta necesaria para
extender el calendario institucional.

**Independent Test**: se puede probar completo abriendo la aplicación con al menos un mes
generado, navegando al mes inmediatamente siguiente (aún no generado y no posterior al mes
calendario actual), presionando "Generar calendario" y verificando que el mes queda generado,
persistido y mostrado como vista activa.

**Acceptance Scenarios**:

1. **Given** que el último mes generado es el `YYYYMM` más alto de la secuencia y el mes
   inmediatamente siguiente no está generado y no es posterior al mes calendario actual,
   **When** el usuario navega a ese mes siguiente, **Then** la pantalla muestra el estado
   "mes sin generar" con una acción visible para generar el calendario de ese período.
2. **Given** el estado "mes sin generar" de un período contiguo generable, **When** el usuario
   confirma la generación, **Then** el sistema genera y persiste el calendario de ese período a
   través del dominio y la pantalla pasa a mostrar la grilla del mes recién generado.
3. **Given** que existe una secuencia de meses generados, **When** el usuario genera el mes
   inmediatamente anterior al primero de la secuencia (más antiguo), **Then** el período queda
   generado y la secuencia se extiende hacia atrás sin dejar huecos.
4. **Given** que la generación se completó, **When** el usuario observa la navegación, **Then**
   el nuevo período aparece incorporado a la secuencia de meses generados.

---

### User Story 2 - Impedir saltos: no dejar huecos en la secuencia (Priority: P1)

Como responsable de administración de personal, cuando estoy parado en un mes sin generar que
NO es contiguo a los meses ya generados (dejaría un hueco entre medio), no quiero poder
generarlo directamente, y quiero que el sistema me indique cuál es el período que debo generar
primero, para que la secuencia de meses nunca quede con saltos.

**Why this priority**: es la garantía que da nombre a la feature. Permitir generar un mes no
contiguo produciría huecos en el calendario institucional, que rompen los supuestos de
liquidación por períodos consecutivos. La restricción es tan crítica como la generación misma:
sin ella, la P1 de generación introduce el problema que esta feature busca evitar.

**Independent Test**: se puede probar navegando (o intentando llegar) a un mes que quede a dos
o más meses de distancia del extremo de la secuencia generada y verificando que no se ofrece la
acción de generar ese período, y que un mensaje identifica el período contiguo que debe
generarse primero.

**Acceptance Scenarios**:

1. **Given** un mes sin generar que dista dos o más meses del extremo más cercano de la
   secuencia generada, **When** el usuario llega a ese mes, **Then** la pantalla NO ofrece la
   acción de generar el calendario de ese período.
2. **Given** ese mismo mes no contiguo, **When** el usuario observa el estado "mes sin generar",
   **Then** un mensaje le indica cuál es el período contiguo que debe generar primero para no
   dejar huecos.
3. **Given** el conjunto de meses generados, **When** se evalúa cualquier operación de
   generación, **Then** el sistema solo habilita generar un período que sea inmediatamente
   anterior o inmediatamente posterior a la secuencia generada existente (o el período semilla,
   si no hay ninguno).

---

### User Story 3 - Navegación acotada a lo generable (Priority: P2)

Como responsable de administración de personal, quiero que los controles de navegación entre
meses no me dejen avanzar más allá del primer mes generable en cada dirección, para no
terminar parado en un mes que no puedo generar ni consultar, y para que la contigüidad sea
evidente en la propia navegación.

**Why this priority**: refuerza y hace visible la regla de contigüidad en el gesto de navegar.
No agrega una capacidad nueva por sí sola, pero evita que el usuario llegue a estados sin salida
(meses vacíos no generables) y reduce la confusión. Depende conceptualmente de las reglas de
las US1 y US2.

**Independent Test**: se puede probar parándose en el último mes generado y avanzando "mes
siguiente": se llega al mes contiguo generable (si corresponde) y, desde ahí, el control para
seguir avanzando queda deshabilitado.

**Acceptance Scenarios**:

1. **Given** que el usuario está en un mes sin generar que es el primer mes generable hacia
   adelante, **When** observa el control "mes siguiente", **Then** ese control está
   deshabilitado (no puede avanzar a un mes no contiguo que quedaría inalcanzable).
2. **Given** que el mes inmediatamente siguiente al último generado es posterior al mes
   calendario actual, **When** el usuario está en el último mes generado, **Then** el control
   "mes siguiente" está deshabilitado (no se generan meses futuros más allá del mes actual).
3. **Given** que el usuario está en el primer mes generable hacia atrás (anterior al más
   antiguo generado), **When** observa el control "mes anterior", **Then** ese control está
   deshabilitado.

---

### Edge Cases

- **No existe ningún calendario generado**: la secuencia está vacía. El único período generable
  es el mes calendario actual (período semilla); no se ofrece generar meses arbitrarios sin un
  ancla. Una vez generado el semilla, aplican las reglas de contigüidad normales.
- **El mes contiguo hacia adelante es futuro**: si el mes inmediatamente posterior a la
  secuencia es posterior al mes calendario actual, ese período NO es generable; la secuencia no
  puede crecer más allá del mes actual hasta que el tiempo avance.
- **La generación falla** (error del dominio/persistencia): el período queda sin generar, la
  secuencia no cambia (no se crea un hueco ni un mes a medias) y el usuario ve un mensaje de
  error con la posibilidad de reintentar.
- **El período ya fue generado entre que se mostró el botón y se presionó** (carrera): la
  operación es idempotente; el usuario termina viendo la grilla de ese mes sin error ni
  duplicado.
- **Backfill hacia atrás con la secuencia anclada**: generar el mes anterior al más antiguo es
  válido siempre que sea inmediatamente contiguo; no hay tope inferior de antigüedad definido
  por esta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer, dentro del estado "mes sin generar" de la pantalla
  principal, una acción para generar el calendario del período mostrado, visible únicamente
  cuando ese período es generable según las reglas de contigüidad (FR-002/FR-004/FR-005).
- **FR-002**: El sistema DEBE habilitar la generación de un período solo si ese período es el
  inmediatamente anterior (mes − 1) o el inmediatamente posterior (mes + 1) a la secuencia
  contigua de meses ya generados.
- **FR-003**: El sistema NO DEBE permitir generar un período que dejaría un hueco respecto de la
  secuencia generada (períodos no contiguos); en ese caso no ofrece acción de generación y
  muestra un mensaje que identifica el período contiguo que debe generarse primero.
- **FR-004**: El sistema NO DEBE permitir generar un período posterior al mes calendario actual;
  la secuencia solo puede extenderse hacia adelante hasta el mes actual inclusive.
- **FR-005**: Cuando no existe ningún calendario generado, el único período generable DEBE ser
  el mes calendario actual (período semilla).
- **FR-006**: Tras una generación exitosa, el nuevo período DEBE quedar persistido a través del
  dominio de presentismo (feature 004) y la pantalla DEBE pasar a mostrar la grilla del mes
  recién generado como vista activa.
- **FR-007**: Los controles de navegación entre meses DEBEN impedir que el usuario alcance un
  mes sin generar que no sea generable: el control de avance/retroceso queda deshabilitado al
  llegar al primer mes generable de cada dirección (o antes, si ese mes no es generable).
- **FR-008**: El conjunto de períodos generados DEBE formar siempre una única secuencia contigua
  de identificadores `YYYYMM` consecutivos; el sistema no DEBE exponer ningún camino en la IU
  que permita violar esta invariante.
- **FR-009**: Si la generación falla, el período DEBE permanecer sin generar y la secuencia sin
  cambios; el usuario DEBE ver un mensaje de error y poder reintentar la generación.
- **FR-010**: La generación de un período que ya está generado (por una carrera) DEBE ser
  idempotente: el sistema muestra la grilla de ese mes sin crear duplicados ni error.
- **FR-011**: La acción de generación y sus respuestas NO DEBEN exponer datos personales,
  legajos ni fichadas, de forma consistente con la pantalla de calendario (feature 007).

### Key Entities *(include if feature involves data)*

- **Período de calendario**: mes identificado por `YYYYMM`, con un estado de generado o no
  generado. Es la unidad que se genera y que la secuencia contigua agrupa.
- **Secuencia contigua generada**: rango de períodos generados sin huecos, caracterizado por su
  extremo más antiguo (mín) y su extremo más reciente (máx). Es la invariante central de la
  feature.
- **Frontera generable**: conjunto de períodos habilitados para generar en un momento dado —
  el inmediatamente anterior al mín y el inmediatamente posterior al máx (este último acotado
  por el mes calendario actual); o el período semilla (mes actual) cuando la secuencia está
  vacía.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A través de la interfaz es imposible dejar un hueco en la secuencia de meses
  generados: 0 caminos de la IU permiten generar un período no contiguo.
- **SC-002**: Desde un mes contiguo generable, el usuario genera el calendario y ve la grilla del
  mes con una sola acción de confirmación, sin pasos técnicos adicionales.
- **SC-003**: El 100% de los meses sin generar no contiguos no ofrecen acción de generación y
  presentan un mensaje que identifica el período que debe generarse primero.
- **SC-004**: El 100% de los intentos de avanzar la navegación hacia un mes no generable quedan
  bloqueados por un control deshabilitado (el usuario nunca aterriza en un mes vacío no
  generable).

## Assumptions

- El "mes calendario actual" se interpreta según la fecha local de la aplicación; el tope de
  generación hacia adelante es ese mes inclusive (derivado del requisito de no generar meses
  futuros).
- La generación de un mes reutiliza el mecanismo de generación del dominio de presentismo
  (feature 004) y la pantalla/estados existentes de la feature 007; esta feature agrega las
  reglas de contigüidad y la acción en la IU, no un nuevo motor de cálculo.
- Cuando no hay ningún calendario, el período semilla por defecto es el mes calendario actual;
  no se contempla en esta feature elegir un mes semilla arbitrario.
- Se permite extender la secuencia hacia atrás (meses anteriores al más antiguo) siempre que sea
  contiguo; no se define en esta feature un límite inferior de antigüedad.
- La invariante de contigüidad aplica a la secuencia gestionada por la aplicación; se asume que
  los datos preexistentes de meses generados ya forman (o se tratarán como) una secuencia sin
  huecos.
