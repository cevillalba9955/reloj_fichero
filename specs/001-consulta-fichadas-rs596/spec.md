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

### Session 2026-07-03

- Q: Tras implementar y probar contra el equipo real (`research/protocolo_prosoft_rs596.md` §5.6-5.7), ¿el método de verificación y el timestamp de la fichada siguen totalmente sin resolver como decía la spec original? → A: No en su totalidad. El método de verificación quedó **confirmado por comparación directa con el software oficial** para dos de los tres valores observados (`0x30`=tarjeta, `0x40`=rostro); `0x10`=huella sigue siendo una hipótesis fuerte por fórmula, sin confirmación independiente propia. El timestamp quedó **parcialmente decodificado**: minuto y segundo están confirmados con 7 fichadas de calibración reales (`research/control_fichada.csv`); la hora sigue siendo una hipótesis ambigua cada 8 horas (no se puede distinguir, por ejemplo, la hora 6 de la 14); la fecha (día/mes/año) sigue sin tocar. El usuario aceptó este nivel de confianza sin más pruebas de calibración adicionales por ahora.
- Q: FR-014 dejaba pendiente de definir el comportamiento ante una discrepancia entre lo declarado por `0xB4` y lo recibido en `0xA4`. Tras implementar la descarga real, ¿qué comportamiento se fijó? → A: Comportamiento interino (no exhaustivamente validado, pero ya implementado): si el reloj envía **más** bytes de los que corresponden a la cantidad declarada por `0xB4` (sobran bytes sin consumir tras leer los registros esperados), el script falla la sesión con un error explícito describiendo la discrepancia, igual que un payload inesperado (FR-010). El caso inverso —el reloj entrega **menos** registros de los declarados— no tiene manejo específico todavía: se manifiesta como un timeout de lectura y se reporta como error de conexión (FR-009), no como un error de discrepancia distinguible. Ambos casos siguen sin validarse en variedad de escenarios reales; se documentan como comportamiento interino, no como garantía definitiva del protocolo.
- Q: El campo `legajoHipotesis` (decodificación del legajo/ID de empleado, ver `research/protocolo_prosoft_rs596.md` §5.9 y `data-model.md` §1) está implementado, testeado y confirmado (27/27 coincidencias contra dos sesiones reales independientes), pero ningún Functional Requirement lo menciona de forma normativa — solo aparece descripto en Key Entities/Assumptions. ¿Cómo se debe formalizar? → A: Agregar un nuevo requisito (FR-015) que exija explícitamente la decodificación del legajo y su regla de presentación (siempre marcado `unconfirmed: true`), en vez de dejarlo solo como texto descriptivo.
- Q: FR-010 describe una validación de "tamaño múltiplo exacto de 20 bytes", pero la implementación real no hace ese chequeo de módulo — lee exactamente `declaredPendingCount*20` bytes por construcción; el exceso se detecta vía FR-014 y el déficit se manifiesta como timeout genérico (FR-009). ¿Se corrige la redacción de FR-010 para reflejar esto, o se implementa el chequeo de módulo original? → A: Reescribir FR-010 para describir el chequeo real (marcador `55 AA`) y los caminos de error que realmente existen (FR-014/FR-009), en vez de forzar un chequeo de módulo que no aporta nada dado cómo se lee el payload.
- Q: FR-002 decía "dos consultas 0x13", pero la implementación real y probada hace tres. Se corrieron experimentos dirigidos contra el equipo real para determinar si los `0x13` son necesarios, incluyendo 10 corridas adicionales (5 sin ningún `0x13`, 5 con dos de tres) con timeout generoso (8000ms) para descartar que el único fallo observado antes fuera un timeout ajustado. ¿Qué mostraron? → A: **10 de 10 corridas exitosas** — el reloj respondió `0xB4` de forma estable y repetible tanto sin ningún `0x13` como con una secuencia parcial de dos, con el mismo conteo de pendientes en todas las corridas (sin efectos secundarios). El único fallo observado en todo el experimento (un timeout puntual en el primer intento) queda confirmado como circunstancial, no como comportamiento real del protocolo. Sigue sin probarse `0xA4` (descarga de detalle completo) bajo una secuencia reducida — ver `research/protocolo_prosoft_rs596.md` §6.6 — así que el script de producción sigue exigiendo la secuencia completa de tres `0x13` hasta validar eso, aunque la evidencia ya es fuerte a favor de que una secuencia reducida también funcionaría.
- Q: Se extendió el experimento para pedir `0xA4` real (detalle completo de fichadas pendientes), no solo el conteo `0xB4`, reutilizando el mismo parser de producción. 3/3 corridas exitosas, decodificando los mismos registros que con la secuencia completa (13/13 corridas exitosas en total entre los tres experimentos). ¿Se simplifica `src/protocol/client.js`? → A: Sí — el script ahora ejecuta la secuencia **reducida** (solo `0x80`) por defecto, con un flag `--full-handshake` que restaura la secuencia completa de tres `0x13` sin necesidad de tocar código, para el caso de que un reloj distinto, un cambio de firmware, o cualquier otro parámetro del entorno la requiera. Ambos modos fueron confirmados de punta a punta contra el equipo real después de implementar el cambio.

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
timestamp exacto del evento, que solo está parcialmente resuelto a la fecha
de este documento), para no tomar decisiones de negocio sobre datos que
podrían ser incorrectos.

**Why this priority**: El documento de protocolo (`research/protocolo_prosoft_rs596.md`,
secciones 5.5-5.7) confirma minuto y segundo del timestamp de cada fichada,
pero deja la hora como una hipótesis ambigua (se repite cada 8 horas) y la
fecha (día/mes/año) totalmente sin tocar. Presentar el timestamp completo
como si fuera confiable sin advertirlo generaría riesgo para cualquier
sistema que consuma esta información (por ejemplo, nómina).

**Independent Test**: Se puede probar inspeccionando la salida del script
para un lote de fichadas conocido y confirmando que cada campo no resuelto
o parcialmente resuelto aparece marcado como tal (no como un valor numérico
"normal" indistinguible de un dato confirmado).

**Acceptance Scenarios**:

1. **Given** una fichada descargada, **When** el script la reporta, **Then**
   el campo de método de verificación (confirmado para `0x30`/`0x40`;
   hipótesis fuerte sin confirmar de forma independiente para `0x10`) se
   muestra como valor legible, y el campo de timestamp (minuto/segundo
   confirmados, hora ambigua cada 8hs y fecha sin resolver) se muestra
   marcado explícitamente como "sin confirmar" en su totalidad, junto con el
   valor crudo capturado.

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
- Si el reloj envía **más** bytes de los que corresponden a la cantidad
  declarada por `0xB4`, el script falla la sesión con un error explícito de
  discrepancia (comportamiento interino confirmado tras la implementación,
  ver Clarifications sesión 2026-07-03 y FR-014). Si envía **menos**
  registros de los declarados, el caso no tiene manejo específico todavía y
  se manifiesta como timeout de lectura (FR-009); no se debe asumir un
  comportamiento distinguible para ese escenario hasta validarlo contra el
  equipo real.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El script DEBE conectarse por TCP al reloj biométrico RS596 en
  el puerto `5005`, usando la dirección IP del equipo como parámetro de
  entrada configurable.
- **FR-002**: El script DEBE ejecutar, por defecto, una secuencia de
  apertura de sesión **reducida**: únicamente el comando `0x80` de
  handshake, sin ninguna consulta `0x13`, antes de solicitar cualquier
  dato de fichadas. Esto está respaldado por 13/13 corridas exitosas de
  experimentos dirigidos contra el equipo real (ver Clarifications, sesión
  2026-07-03, y `research/protocolo_prosoft_rs596.md` §6.6), incluyendo la
  descarga real de detalle (`0xA4`) sin ningún `0x13`, decodificada de
  forma idéntica al flujo con la secuencia completa. El script DEBE
  además ofrecer una secuencia de apertura **completa** (handshake seguido
  de tres consultas `0x13`: parámetros, identificación, parámetros de
  nuevo — la secuencia que replica al software oficial Pro-Soft y que fue
  la primera validada de punta a punta) como opción explícita
  (`--full-handshake`), para poder recuperar ese comportamiento sin
  modificar código si un equipo distinto o un cambio de firmware lo
  requiriera.
- **FR-003**: El script DEBE consultar la cantidad de fichadas pendientes
  (comando `0xB4`) antes de solicitar el detalle, y DEBE informar esa
  cantidad al operador.
- **FR-004**: Cuando haya una o más fichadas pendientes, el script DEBE
  solicitar el detalle completo (comando `0xA4`) y separar la respuesta en
  registros individuales de 20 bytes, según la estructura documentada.
- **FR-005**: Para cada registro, el script DEBE decodificar y presentar
  como dato confiable únicamente los campos confirmados por el protocolo:
  la constante de tipo de registro y el código crudo de método de
  verificación. La interpretación humana de ese código (huella/tarjeta/
  rostro) DEBE presentarse siempre marcada como "no confirmado" (`0x30`=
  tarjeta y `0x40`=rostro están confirmados por comparación directa contra
  el software oficial, pero se exponen igual como hipótesis por consistencia
  con `0x10`=huella, que sigue sin confirmación independiente propia). El
  timestamp de cada fichada DEBE presentarse también marcado como "no
  confirmado" en su totalidad —aun cuando el componente de minuto y segundo
  está confirmado por calibración real, la hora es una hipótesis ambigua
  (se repite cada 8 horas) y la fecha no está resuelta— junto con su valor
  crudo, sin combinar ninguno de estos campos con los campos confiables como
  si tuvieran el mismo nivel de certeza.
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
- **FR-010**: El script DEBE validar que la respuesta a `0xA4` comience con
  el marcador de payload esperado (`55 AA`) antes de leer los registros; si
  no lo trae, DEBE reportarlo como una respuesta inesperada en lugar de
  intentar parsear datos corruptos. Dado que el script lee exactamente
  `declaredPendingCount * 20` bytes (calculados a partir de lo declarado
  por `0xB4`), no existe un chequeo de "tamaño múltiplo de 20" independiente:
  un exceso de bytes se detecta y reporta vía FR-014, y un déficit de bytes
  se manifiesta como timeout de lectura y se reporta como error de conexión
  (FR-009) — ver Clarifications, sesión 2026-07-03.
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
- **FR-014** [COMPORTAMIENTO INTERINO]: Si, tras leer los bytes
  correspondientes a la cantidad de fichadas declarada por `0xB4`, el reloj
  todavía tiene datos adicionales sin consumir en `0xA4` (es decir, envió
  más registros de los declarados), el script DEBE fallar la sesión con un
  error explícito que describa la discrepancia, de forma equivalente a un
  payload inesperado (FR-010). El caso inverso —el reloj entrega **menos**
  registros de los declarados— no tiene manejo específico: se manifiesta
  como timeout de lectura y se reporta como error de conexión (FR-009). Este
  comportamiento se implementó como solución interina (ver Clarifications,
  sesión 2026-07-03) y no debe tomarse como garantía definitiva del
  protocolo hasta validarlo contra más escenarios reales del equipo.
- **FR-015**: El script DEBE decodificar el legajo/ID de empleado de cada
  fichada (primer byte del bloque de 4 bytes re-encuadrado que precede a
  los campos propios del registro, ver `research/protocolo_prosoft_rs596.md`
  §5.9) y exponerlo como `legajoHipotesis`, siempre marcado explícitamente
  como "no confirmado" (`unconfirmed: true`), junto con el bloque crudo
  completo sin interpretar (`unresolvedFields.legajoRaw`) para trazabilidad.
  Esta decodificación está confirmada con alta confianza (27/27
  coincidencias verificadas contra dos sesiones reales independientes) para
  fichadas verificadas por huella o rostro; NO hay evidencia suficiente
  para el caso de verificación por tarjeta (ver Clarifications, sesión
  2026-07-03), por lo que el script no debe tratar ese caso como resuelto.

### Key Entities *(include if feature involves data)*

- **Fichada (registro de asistencia)**: evento crudo de 20 bytes leído del
  reloj (ya re-encuadrado, ver `research/protocolo_prosoft_rs596.md` §5.9).
  Incluye un campo confirmado de método de verificación (código crudo
  confirmado; interpretación humana confirmada contra el software oficial
  para tarjeta `0x30` y rostro `0x40`, hipótesis fuerte sin confirmar de
  forma independiente para huella `0x10`), un campo de fecha/hora
  parcialmente decodificado (minuto y segundo confirmados, hora ambigua
  cada 8hs, fecha sin resolver), un campo de legajo/ID de empleado
  identificado (27/27 coincidencias verificadas, sin evidencia todavía para
  el caso de verificación por tarjeta) y bytes restantes que, a la fecha,
  siguen sin resolverse con certeza (ver `research/protocolo_prosoft_rs596.md`,
  secciones 5.2 y 5.5-5.9).
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
- El campo de fecha/hora del registro de fichada está solo parcialmente
  resuelto: minuto y segundo están confirmados por calibración contra el
  software oficial, pero la hora es una hipótesis ambigua cada 8 horas y la
  fecha (día/mes/año) sigue sin tocar (ver `research/protocolo_prosoft_rs596.md`,
  secciones 5.5-5.7). Esta versión del script no garantiza timestamps
  exactos por evento; queda documentado como limitación conocida y no como
  defecto del script.
- El número de legajo/identidad del empleado SÍ se identificó dentro del
  registro de 20 bytes de la fichada (campo `legajoHipotesis`, ver
  `research/protocolo_prosoft_rs596.md` §5.9 y `data-model.md` §1): 27/27
  coincidencias verificadas contra dos sesiones reales independientes, una
  vez corregido un error de encuadre de 4 bytes que el script tenía. Se
  sigue exponiendo como hipótesis (`unconfirmed: true`) porque el único
  caso de verificación por tarjeta capturado hasta ahora no coincidió con
  ningún legajo real conocido — no hay evidencia suficiente para ese
  método en particular.
- El borrado de fichadas ya descargadas (`0xA8`) se deja como una operación
  separada y explícita, no como parte del flujo de consulta simple, en línea
  con el principio de protección de datos de la constitución del proyecto.
