# Feature Specification: Consulta de Fichadas del Reloj RS596

**Feature Branch**: `001-consulta-fichadas-rs596`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "crear script para consultar fichadas, usar documento research/protocolo_prosoft_rs596.md"

## Clarifications

### Session 2026-07-02

- Q: El script no borra fichadas del reloj automáticamente (FR-007). Si se ejecuta más de una vez, las mismas fichadas pendientes se volverán a descargar y a exportar en un nuevo JSON. ¿Cómo debe manejar el script estas relecturas/duplicados? → A: Exportar siempre todo lo que reporte el reloj como pendiente, sin intentar deduplicar contra ejecuciones anteriores; la deduplicación queda fuera de alcance de este script.
- Q: Si el reloj rechaza la conexión o se comporta de forma anómala (posible sesión concurrente ya abierta, por ejemplo desde el software oficial Pro-Soft), ¿qué debe hacer el script? → A: Fallar inmediatamente con un error claro, sin reintentos automáticos ni espera indefinida.
- Q: Si la cantidad de registros recibidos en la respuesta a `0xA4` no coincide con la cantidad que `0xB4` había declarado como pendiente, ¿qué debe hacer el script? → A: Queda pendiente de definir; se validará el comportamiento real del equipo antes de fijar la lógica definitiva. No se debe asumir ningún comportamiento específico todavía.
- Q: La constitución exige logging estructurado de toda comunicación con el reloj biométrico para diagnosticar fallos de un protocolo no documentado. La spec no definía este requisito. ¿Qué nivel de logging debe tener el script? → A: Log estructurado por sesión (comandos enviados/recibidos, tamaño de respuestas, resultado y duración), separado del archivo JSON de salida.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descargar fichadas pendientes del reloj (Priority: P1)

Como integrador/administrador del sistema, quiero ejecutar un script que se
conecte al reloj biométrico Prosoft RS596 y descargue las fichadas
pendientes, para poder disponer de esos eventos de asistencia sin depender
del software oficial "Gestión de Personal Pro-Soft" corriendo en paralelo.

**Why this priority**: Es la funcionalidad núcleo solicitada; sin ella no
existe ningún valor entregado. Todo lo demás (formato de salida, borrado,
etc.) depende de que esta consulta funcione primero.

**Independent Test**: Se puede probar de forma independiente ejecutando el
script contra un reloj con al menos una fichada pendiente y verificando que
la cantidad de registros devueltos coincide con la cantidad que el propio
equipo reporta como pendiente (comando `0xB4`).

**Acceptance Scenarios**:

1. **Given** el reloj tiene 1 o más fichadas pendientes, **When** se ejecuta
   el script, **Then** el script devuelve exactamente esa cantidad de
   registros, con los campos confirmados por el protocolo (método de
   verificación) legibles.
2. **Given** el reloj no tiene fichadas pendientes, **When** se ejecuta el
   script, **Then** el script informa "0 fichadas pendientes" sin error.
3. **Given** el reloj es inalcanzable en la red (IP incorrecta, apagado,
   fuera de la LAN), **When** se ejecuta el script, **Then** el script
   informa un error de conexión claro y termina sin dejar la sesión a medio
   abrir.

---

### User Story 2 - Distinguir datos confiables de datos no resueltos (Priority: P2)

Como integrador, quiero que el script señale explícitamente qué campos de
cada fichada están confirmados por el protocolo y cuáles no (por ejemplo, el
timestamp exacto del evento, que a la fecha de este documento no está
resuelto), para no tomar decisiones de negocio sobre datos que podrían ser
incorrectos.

**Why this priority**: El documento de protocolo (`research/protocolo_prosoft_rs596.md`,
sección 5.5) deja explícito que el campo de fecha/hora de cada fichada no
pudo verificarse. Presentar ese dato como si fuera confiable sin advertirlo
generaría riesgo para cualquier sistema que consuma esta información (por
ejemplo, nómina).

**Independent Test**: Se puede probar inspeccionando la salida del script
para un lote de fichadas conocido y confirmando que cada campo no resuelto
aparece marcado como tal (no como un valor numérico "normal" indistinguible
de un dato confirmado).

**Acceptance Scenarios**:

1. **Given** una fichada descargada, **When** el script la reporta, **Then**
   el campo de método de verificación (confirmado) se muestra como valor
   legible y el campo de timestamp (no resuelto) se muestra marcado
   explícitamente como "sin confirmar", junto con el valor crudo capturado.

---

### User Story 3 - Ejecutar en modo solo lectura sin alterar el equipo (Priority: P3)

Como administrador, quiero poder ejecutar el script en un modo que solo lea
las fichadas pendientes sin borrarlas del reloj, para evitar el riesgo de
pérdida de datos si algo en la cadena de procesamiento posterior falla.

**Why this priority**: El borrado (`0xA8`) es una operación irreversible en
el equipo. Es una mejora de seguridad sobre la funcionalidad núcleo, no un
bloqueante para el primer valor entregado (User Story 1).

**Independent Test**: Se puede probar ejecutando el script en modo lectura
contra un reloj con fichadas pendientes, y verificando —mediante una segunda
consulta `0xB4`— que la cantidad de fichadas pendientes en el equipo no
cambió.

**Acceptance Scenarios**:

1. **Given** el script se ejecuta en modo solo lectura, **When** finaliza,
   **Then** las fichadas siguen apareciendo como pendientes en el reloj.

---

### Edge Cases

- ¿Qué pasa si el reloj no tiene fichadas pendientes (0 registros)?
- ¿Qué pasa si la conexión TCP se cae o da timeout a mitad de la secuencia
  (por ejemplo, después del handshake pero antes de recibir el detalle)?
- ¿Qué pasa si el payload de detalle (`0xA4`) llega con un tamaño que no es
  múltiplo exacto de 20 bytes (registro corrupto o protocolo mal
  interpretado)?
- ¿Qué pasa si el campo de método de verificación trae un valor no
  documentado (ni huella ni rostro conocido)?
- Si se ejecutan dos instancias del script en simultáneo contra el mismo
  reloj (el protocolo no fue validado para sesiones TCP concurrentes) y la
  conexión es rechazada o se comporta de forma anómala, el script DEBE
  fallar de inmediato con un error claro (ver FR-011 y Clarifications).
- Si la cantidad de registros recibidos en la respuesta a `0xA4` no coincide
  con la cantidad declarada por `0xB4`, el comportamiento queda **pendiente
  de definir** hasta validar contra el equipo real (ver Clarifications,
  sesión 2026-07-02); no se debe asumir un comportamiento específico todavía.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El script DEBE conectarse por TCP al reloj biométrico RS596 en
  el puerto `5005`, usando la dirección IP del equipo como parámetro de
  entrada configurable.
- **FR-002**: El script DEBE ejecutar la secuencia de apertura de sesión
  documentada (comando `0x80` de handshake, seguido de dos consultas `0x13`)
  antes de solicitar cualquier dato de fichadas.
- **FR-003**: El script DEBE consultar la cantidad de fichadas pendientes
  (comando `0xB4`) antes de solicitar el detalle, y DEBE informar esa
  cantidad al operador.
- **FR-004**: Cuando haya una o más fichadas pendientes, el script DEBE
  solicitar el detalle completo (comando `0xA4`) y separar la respuesta en
  registros individuales de 20 bytes, según la estructura documentada.
- **FR-005**: Para cada registro, el script DEBE decodificar y presentar
  como dato confiable únicamente los campos confirmados por el protocolo
  (constante de tipo de registro, método de verificación); los campos no
  resueltos (posible timestamp, contadores sin identificar) DEBEN
  presentarse marcados explícitamente como "no confirmado", junto con su
  valor crudo, sin combinarlos con los campos confiables como si tuvieran el
  mismo nivel de certeza.
- **FR-006**: El script DEBE entregar el resultado de la consulta como
  archivo local en formato JSON (uno por sesión de consulta, con timestamp
  de ejecución en el nombre), además de un resumen legible en consola;
  no debe escribir directamente en ningún repositorio de base de datos
  Oracle en esta primera versión.
- **FR-007**: El script NO DEBE ejecutar el comando de borrado (`0xA8`) de
  forma automática. El borrado de fichadas ya leídas DEBE ser una acción
  explícita, separada de la simple consulta, que el operador decide invocar
  a propósito.
- **FR-008**: El script DEBE cerrar correctamente la sesión (comando `0x81`
  de cierre de operación y cierre del socket TCP) incluso cuando ocurre un
  error durante la descarga, para no dejar sesiones abiertas en el equipo.
- **FR-009**: El script DEBE reportar errores de conexión (timeout, host
  inalcanzable, conexión rechazada o reseteada) de forma clara y
  distinguible de un resultado exitoso con 0 fichadas.
- **FR-010**: El script DEBE validar que el tamaño del payload recibido en
  la respuesta a `0xA4` sea múltiplo exacto de 20 bytes (más el header de 4
  bytes); si no lo es, DEBE reportarlo como una respuesta inesperada en
  lugar de intentar parsear datos corruptos.
- **FR-011**: El script DEBE fallar de inmediato con un mensaje de error
  claro si la conexión es rechazada o se comporta de forma anómala durante
  el intento de sesión (por ejemplo, por una sesión concurrente ya abierta
  desde otro cliente), sin reintentos automáticos ni espera indefinida.
- **FR-012**: El script DEBE registrar, en un log estructurado separado del
  archivo de salida, cada sesión de consulta (comandos enviados, tamaño de
  las respuestas recibidas, resultado final y duración), para permitir
  diagnosticar fallos de un protocolo no documentado oficialmente por el
  fabricante, en línea con el principio de observabilidad de la
  constitución del proyecto.
- **FR-013**: El script DEBE exportar todas las fichadas pendientes
  reportadas por el reloj en cada ejecución, sin intentar deduplicar contra
  ejecuciones anteriores; la responsabilidad de deduplicar registros ya
  vistos entre sesiones queda fuera del alcance de este script.
- **FR-014** [COMPORTAMIENTO PENDIENTE DE VALIDAR]: El comportamiento exacto
  del script ante una discrepancia entre la cantidad de fichadas declarada
  por `0xB4` y la cantidad de registros efectivamente recibidos en `0xA4`
  queda pendiente de definir hasta validar contra el equipo real; no debe
  implementarse una lógica definitiva para este caso sin antes confirmar el
  comportamiento observado (ver Clarifications, sesión 2026-07-02).

### Key Entities *(include if feature involves data)*

- **Fichada (registro de asistencia)**: evento crudo de 20 bytes leído del
  reloj. Incluye un campo confirmado de método de verificación (hipótesis:
  huella/rostro/tarjeta, según bit distinto observado) y campos de posible
  fecha/hora y contadores que, a la fecha, no están resueltos con certeza
  (ver `research/protocolo_prosoft_rs596.md`, secciones 5.2 y 5.5).
- **Sesión de consulta**: agrupa una conexión TCP puntual al reloj —
  handshake, consultas de parámetros, consulta de pendientes, descarga de
  detalle y cierre— identificada por su propio contador de secuencia interno
  del protocolo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador obtiene la lista de fichadas pendientes del reloj
  en menos de 10 segundos desde que ejecuta el script, para lotes de hasta
  100 fichadas pendientes.
- **SC-002**: La cantidad de fichadas reportadas por el script coincide en el
  100% de los casos con la cantidad que el equipo declara como pendiente en
  el propio protocolo (comando `0xB4`), para la misma sesión de consulta.
- **SC-003**: El operador puede distinguir, para el 100% de las fichadas
  reportadas, qué campos son confiables (confirmados) y cuáles no, sin
  necesidad de leer el código del script.
- **SC-004**: Ninguna ejecución del script en modo consulta simple elimina
  datos del reloj (0% de pérdida de datos accidental durante la sola
  lectura).
- **SC-005**: Ante cualquier falla de conexión o comportamiento anómalo, el
  operador puede identificar la causa raíz revisando el log de la sesión,
  sin necesitar acceso al código fuente del script.

## Assumptions

- El reloj RS596 es accesible por red (misma LAN o red enrutada) desde donde
  se ejecuta el script, con el puerto `5005` abierto; no se contempla acceso
  remoto vía VPN/Internet en esta versión.
- Se asume una sola sesión de consulta a la vez contra un mismo reloj; el
  protocolo documentado no fue validado para sesiones TCP concurrentes.
- El script se ejecuta manualmente o vía tarea programada por personal
  técnico que entiende las limitaciones del protocolo (no está pensado como
  herramienta de cara a usuarios finales sin capacitación).
- Dado que el campo de fecha/hora del registro de fichada no está resuelto
  (ver `research/protocolo_prosoft_rs596.md`, sección 5.5), esta versión del
  script no garantiza timestamps exactos por evento; queda documentado como
  limitación conocida y no como defecto del script.
- El número de legajo/identidad del empleado no fue identificado de forma
  confirmada dentro del registro de 20 bytes de la fichada; correlacionar el
  evento con la persona queda fuera del alcance de este script y se deja
  para una iteración futura una vez resuelto ese campo (o mediante cruce con
  el número de legajo dado de alta vía `0x98`, a confirmar).
- El borrado de fichadas ya descargadas (`0xA8`) se deja como una operación
  separada y explícita, no como parte del flujo de consulta simple, en línea
  con el principio de protección de datos de la constitución del proyecto.
