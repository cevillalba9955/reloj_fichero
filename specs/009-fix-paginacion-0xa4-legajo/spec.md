# Feature Specification: Corrección de la paginación por bytes del 0xA4 y del ancho del legajo

**Feature Branch**: `009-fix-paginacion-0xa4-legajo`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Corrección de la paginación por bytes del comando 0xA4 y acotación del campo legajo a los bytes confirmados, en el driver del protocolo Prosoft RS596. Al descargar lotes de 4 o más páginas (más de 153 fichadas pendientes), el driver calculaba el tamaño de cada página de continuación con una fórmula basada en 'cantidad de registros por página' (tope de 51 registros, con un descuento de arrastre de hasta 8 bytes en la última página) que coincidía por casualidad con el comportamiento real hasta 3 páginas pero pedía 4 bytes de más en la última página a partir de la 4ta, produciendo un error de payload inesperado (FR-010) y una sesión fallida. Causa raíz confirmada comparando dos capturas reales nuevas del software oficial contra el mismo equipo con un lote de 173 fichadas pendientes (4 páginas): la paginación real del equipo es por BYTES, no por registros. El bloque de 4 bytes de cierre al final de cada página queda confirmado como ajeno al contenido del stream. Una de las capturas también resolvió una ambigüedad sobre el byte de identificación del equipo en los comandos. Segundo hallazgo: el campo que se venía decodificando como 'legajo' ocupa 4 bytes en el registro, pero sólo hay evidencia real de los primeros 2 bytes (little-endian); los bytes altos fueron siempre cero en todas las fichadas reales capturadas. Se corrige el driver para declarar el legajo con el ancho realmente confirmado y tratar los bytes altos como chequeo de plausibilidad. Ambas correcciones ya están implementadas y verificadas de punta a punta contra el equipo real (192.168.1.78, lote de 173 fichadas). El alcance se limita al driver del protocolo, respaldado en tráfico real versionado (research/fichada_2.pcapng y research/fichada_3.pcapng)."

## Contexto

El driver del reloj biométrico Prosoft RS596 descarga las fichadas pendientes con el
comando de detalle `0xA4`, paginando cuando el lote supera el tope de una sola respuesta
(confirmado hasta ahora hasta 3 páginas, feature 006). La primera descarga real de un lote
de 173 fichadas pendientes (4 páginas) contra el equipo `192.168.1.78`
(`logs/session-192.168.1.78-2026-07-16T12-52-03-389Z.ndjson`) falló con un error de payload
inesperado (FR-010): *"El stream de fichadas mide 3464 bytes; se esperaban 3460 (173 x 20)"*.

La causa se confirmó comparando byte a byte dos capturas nuevas del **software oficial**
descargando ese mismo lote de 173 fichadas contra el equipo real, con dos configuraciones
distintas de `ID DISPOSITIVO` (99 y 255): `research/fichada_2.pcapng` y
`research/fichada_3.pcapng`. El modelo de paginación vigente (heredado de la feature 006:
tope de 51 **registros** por página, con un descuento de arrastre de hasta 8 bytes en la
última) coincidía por casualidad con el comportamiento real hasta 3 páginas — por eso todas
las calibraciones previas (53 y 123 fichadas) lo confirmaban — pero divergía a partir de la
4ta página, pidiendo 4 bytes de más. La paginación real del equipo es por **bytes**: cada
página entrega como máximo 1024 bytes de un stream continuo de
`declaredPendingCount * 20` bytes, sin alinear las fronteras de página a los límites de un
registro.

De forma independiente, una revisión de todas las capturas reales disponibles (incluida la
fichada de prueba con legajo 9999, la única con más de 1 byte de legajo) mostró que sólo hay
evidencia real de los primeros 2 bytes del campo de legajo: los bytes altos fueron siempre
cero en absolutamente todas las fichadas reales vistas hasta hoy, sin ningún caso que
distinga "2 bytes" de "4 bytes". El ancho de 4 bytes vigente no tenía evidencia propia,
solo coincidía porque esos bytes siempre fueron cero.

Esta feature toca exclusivamente el driver del protocolo (Constitución, Principio III) y se
respalda en tráfico real versionado (Principios III y IV). Ambas correcciones ya están
implementadas y verificadas de punta a punta contra el equipo real; este documento las
formaliza retroactivamente con el proceso de Spec Kit del proyecto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descarga íntegra de lotes de 4 o más páginas (Priority: P1)

Como operador del servicio de fichadas, cuando el reloj acumula más de 153 marcaciones
pendientes (más de 3 páginas), necesito que **todas** las fichadas se descarguen y
decodifiquen correctamente, sin que la sesión falle por un error de payload, para que la
liquidación de presentismo no pierda datos de asistencia.

**Why this priority**: es el defecto reportado (sesión fallida real contra
`192.168.1.78`) y el corazón de la feature. Sin esto, cualquier lote de 4+ páginas deja al
operador sin datos de asistencia para ese ciclo.

**Independent Test**: reproducir la sesión real de 173 fichadas a partir de
`research/fichada_2.pcapng` (equipo simulado con el guion de bytes real) y verificar que las
**173 fichadas declaradas** por `0xB4` se descargan y decodifican con fecha, hora, legajo y
método válidos, sin error de payload inesperado.

**Acceptance Scenarios**:

1. **Given** un reloj con 173 fichadas pendientes (4 páginas), **When** el servicio ejecuta
   una sesión de consulta, **Then** se exportan las **173** fichadas declaradas, todas con
   `fecha`, `hora` y `método` no nulos y `recordType = 00000001`, sin abortar por payload
   inesperado (FR-010 de la feature 001).
2. **Given** la misma sesión de 173 fichadas, **When** el stream continuo se arma
   concatenando las 4 páginas, **Then** el registro que queda partido en la frontera entre
   la página 1 y la página 2 se decodifica igual de correcto que cualquier otro (no se pierde
   ni se corrompe por estar a caballo entre dos respuestas del equipo).
3. **Given** un lote de hasta 153 fichadas (1 a 3 páginas, camino ya validado por la feature
   006), **When** el servicio lo descarga, **Then** el resultado sigue siendo correcto (sin
   regresión).

---

### User Story 2 - Comando de paginación alineado al comportamiento real del equipo (Priority: P1)

Como responsable del driver, necesito que el tamaño de página que pedimos en cada llamada de
continuación del `0xA4` refleje el límite real del equipo (una cantidad de bytes, no una
cantidad de registros), para que el pedido sea válido sin importar cuántas páginas tenga el
lote.

**Why this priority**: el equipo es determinístico y responde exactamente lo que se le pide;
pedir el tamaño equivocado es la causa directa del defecto de la Historia 1.

**Independent Test**: para el lote de 173 fichadas, comparar los cuatro comandos `0xA4`
generados por el driver contra los cuatro capturados del software oficial en
`research/fichada_2.pcapng`, campo por campo.

**Acceptance Scenarios**:

1. **Given** el lote de 173 fichadas, **When** el driver arma cada uno de los tres primeros
   comandos de página, **Then** el tamaño de página pedido es 1024 bytes (igual al oficial).
2. **Given** el lote de 173 fichadas, **When** el driver arma el comando de la 4ta página
   (última), **Then** el tamaño de página pedido es 388 bytes (el resto exacto del stream),
   no un valor con bytes de más.
3. **Given** cualquier lote de 1 a 3 páginas, **When** el driver arma sus comandos, **Then**
   siguen coincidiendo con las capturas de referencia previas (sin regresión frente a la
   feature 006).

---

### User Story 3 - El legajo reportado no fabrica dígitos sin evidencia (Priority: P2)

Como responsable de la calidad de los datos de asistencia, necesito que el número de legajo
que exporta el driver nunca incluya dígitos que no tengan respaldo en tráfico real
observado, para no arriesgar una liquidación de presentismo basada en un identificador de
empleado potencialmente incorrecto.

**Why this priority**: es una corrección de integridad de datos, no un defecto que haya
fallado en producción todavía (todas las fichadas reales vistas hasta hoy tienen los bytes
altos en cero, así que el valor exportado no cambia para ningún caso ya visto); por eso P2
frente al defecto de paginación que sí rompió una sesión real.

**Independent Test**: alimentar al decodificador un registro sintético cuyo campo de legajo
tenga los bytes altos distintos de cero (nunca observado en tráfico real) y verificar que el
legajo se reporta como no confiable en vez de devolver un número de 4 bytes fabricado.

**Acceptance Scenarios**:

1. **Given** un registro real con legajo de prueba 9999 (el único caso real que excede 1
   byte), **When** se decodifica, **Then** el legajo reportado sigue siendo 9999 (sin
   regresión).
2. **Given** un registro cuyo campo de legajo tiene los bytes altos (posiciones 2 y 3) en
   cero — el caso de el 100% de las fichadas reales vistas hasta hoy —, **When** se
   decodifica, **Then** el legajo se reporta con el valor de los 2 bytes bajos, igual que
   antes.
3. **Given** un registro cuyo campo de legajo tiene algún byte alto distinto de cero (caso
   nunca observado en tráfico real), **When** se decodifica, **Then** el legajo se reporta
   como no confiable en vez de un número que combine bytes sin evidencia de pertenecer al
   mismo dato, preservando el registro crudo para diagnóstico.

---

### Edge Cases

- **Registro partido exactamente en la frontera de una página** (el corte de 1024 bytes cae
  en medio de una fichada de 20 bytes): debe re-armarse igual de correcto al concatenar,
  sin tratarse como dato faltante ni corrupto.
- **Lote de exactamente 153 fichadas (3 páginas justas, límite del camino ya validado)**: no
  debe regresionar.
- **Lote de 154 fichadas (primera vez que aparece una 4ta página con 1 solo registro)**: caso
  mínimo del defecto de paginación.
- **Bloque de cierre de 4 bytes al final de cada página**: no es parte del stream de
  fichadas y se descarta siempre, también en páginas intermedias (no solo en la última).
- **Legajo con bytes altos distintos de cero**: nunca observado en tráfico real; el sistema
  debe tratarlo como caso a investigar (legajo no confiable), no fabricar un número.
- **Distintas configuraciones de `ID DISPOSITIVO` en el equipo o en el software oficial**: no
  deben afectar la paginación ni la decodificación del legajo (ambas correcciones se
  verificaron contra `ID DISPOSITIVO` 99 y 255).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El driver MUST calcular el tamaño de cada página del comando de continuación
  `0xA4` como el mínimo entre los bytes restantes del stream total
  (`declaredPendingCount * 20`) y el tope de bytes por página confirmado (1024), sin usar una
  cantidad de registros por página como base del cálculo.
- **FR-002**: El driver MUST leer exactamente `tamañoDePágina + 4` bytes de payload de la
  respuesta a cada `0xA4`, dado que el equipo siempre responde esa cantidad (confirmado en
  las 4 páginas de `research/fichada_2.pcapng` y `research/fichada_3.pcapng`).
- **FR-003**: El driver MUST descartar siempre los últimos 4 bytes de cada página de
  respuesta al reconstruir el stream continuo de fichadas: esos bytes no son contenido del
  stream (corrige la interpretación previa de la feature 006, que los trataba como el legajo
  colgante de la página siguiente).
- **FR-004**: La concatenación de los payloads de todas las páginas (sin sus bloques de
  cierre) MUST medir exactamente `declaredPendingCount * 20` bytes, y encuadrar exactamente
  `declaredPendingCount` fichadas por invariante estructural (sin cambios respecto al
  comportamiento ya validado de la feature 006 para 1-3 páginas).
- **FR-005**: El sistema MUST seguir fallando de forma explícita y trazable (payload
  inesperado) si el stream reconstruido no mide el tamaño esperado o no encuadra la
  cantidad de fichadas declarada, sin exportar datos corruptos (sin cambios respecto a la
  feature 001/006).
- **FR-006**: El sistema MUST decodificar el legajo únicamente a partir de los 2 bytes con
  evidencia real confirmada (little-endian), no de los 4 bytes completos del campo
  re-encuadrado.
- **FR-007**: El sistema MUST tratar los 2 bytes altos del campo de legajo como un chequeo de
  plausibilidad: si son distintos de cero, el legajo decodificado MUST reportarse como no
  confiable (valor nulo) en lugar de combinarlos con los bytes bajos en un número sin
  evidencia de que compartan el mismo dato.
- **FR-008**: El sistema MUST preservar siempre el valor crudo completo del registro
  (incluidos los bytes altos del campo de legajo, cualquiera sea su valor) disponible para
  diagnóstico, independientemente de si el legajo se reporta confiable o no.
- **FR-009**: El sistema MUST mantener sin cambios de comportamiento observable la
  decodificación de legajo para toda fichada con los bytes altos en cero (el 100% de las
  fichadas reales vistas hasta hoy, incluida la de legajo de prueba 9999).
- **FR-010**: Las capturas `research/fichada_2.pcapng` y `research/fichada_3.pcapng` MUST
  conservarse versionadas como fixtures probatorios de ambas correcciones y usarse como base
  de las pruebas de regresión (Constitución, Principios III y IV).
- **FR-011**: El borrado de fichadas del equipo (`0xA8`) y la lógica de negocio de
  presentismo quedan fuera de alcance y NO deben modificarse.

### Key Entities *(include if feature involves data)*

- **Página de detalle (0xA4)**: una respuesta a un comando de continuación. Su tamaño de
  contenido útil es una cantidad de bytes acotada por el tope del equipo (1024), no una
  cantidad fija de registros; puede contener un registro parcial en su borde.
- **Stream continuo de fichadas**: la concatenación, sin bloques de cierre, de todas las
  páginas de una sesión de descarga. Mide exactamente `declaredPendingCount * 20` bytes.
- **Campo de legajo (registro de 20 bytes)**: bloque de 4 bytes del que solo los 2 primeros
  (little-endian) tienen evidencia real de codificar el número de legajo; los 2 bytes altos
  son un dato de significado desconocido, hoy siempre observado en cero.
- **Fixtures de tráfico (`research/fichada_2.pcapng`, `research/fichada_3.pcapng`)**: las
  capturas reales del software oficial que sirven de verdad de referencia (ground truth) para
  ambas correcciones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las fichadas declaradas de un lote real de 173 (4 páginas) se
  descargan y decodifican sin error de payload inesperado (hoy: la sesión falla y no exporta
  ningún dato).
- **SC-002**: Los comandos de página generados para el lote de 173 fichadas son byte a byte
  idénticos, en su campo de tamaño de página, a los capturados del software oficial en
  `research/fichada_2.pcapng`.
- **SC-003**: Los lotes de 1 a 3 páginas (hasta 153 fichadas) mantienen el 100% de los
  resultados previos (cero regresiones en la suite de pruebas del protocolo existente).
- **SC-004**: Ninguna fichada real ya vista (incluida la de legajo de prueba 9999) cambia su
  legajo reportado tras la corrección del ancho del campo.
- **SC-005**: Un registro sintético con bytes altos de legajo distintos de cero se reporta
  con legajo no confiable, nunca con un número de 4 bytes fabricado sin evidencia.

## Assumptions

- El tope de 1024 bytes por página está confirmado en dos capturas reales independientes
  (`research/fichada_2.pcapng` y `research/fichada_3.pcapng`, mismo lote de 173 fichadas, dos
  configuraciones distintas de `ID DISPOSITIVO`); no se probó si el firmware acepta un tope
  mayor.
- El campo "count" de continuación (`pageIndex << 16`, confirmado hasta `pageIndex=1` por la
  feature 006) queda confirmado hasta `pageIndex=3` con esta captura; no hay datos para más
  de 4 páginas (más de 173 fichadas con esta configuración de página).
- El byte de identificación de equipo en los comandos (`ID DISPOSITIVO`) es el configurado en
  el software emisor, no una constante, y el equipo no lo valida contra su propio
  `ID DISPOSITIVO`; esta feature no cambia el valor fijo que usa el driver, solo documenta el
  hallazgo.
- No existe todavía una fichada real con legajo mayor a 65535 que distinga si los bytes altos
  son parte del número de legajo o codifican otro dato; esta feature no resuelve esa
  incógnita, solo deja de asumir sin evidencia que son parte del legajo.
- El borrado de fichadas y la lógica de negocio de presentismo quedan fuera de alcance; esta
  feature se limita al driver del protocolo y su encuadre, igual que la feature 006.
