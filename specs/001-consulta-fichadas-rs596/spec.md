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
- Q: El JSON de salida marcaba método, timestamp y legajo con un wrapper `{value, unconfirmed: true}` en cada campo, incluso cuando había evidencia real fuerte detrás. El usuario pidió un formato legible sin ese flag repetido. ¿Se puede sacar el flag `unconfirmed` sin perder la distinción entre dato confiable y no resuelto? → A: Sí, con matices por campo, no una remoción general: **método** y **legajo** pasan a exponerse como valores directos (sin wrapper) — incluye la corrección de un error de análisis anterior: la sospecha de que el legajo no era confiable para verificación por tarjeta estaba basada en un valor que en realidad pertenecía a un registro colgante distinto (research.md §5.9), no a la fichada por tarjeta; con el encuadre corregido, dos fichadas reales por tarjeta en `control_fichada.csv` (filas 3 y 6) decodifican su legajo correctamente, igual que huella/rostro. La **hora** sigue devolviendo el valor si se pudo resolver o `null` si no (sin cambios, el `null` ya comunica la falta de certeza sin necesitar un flag aparte). La **fecha** se agrega como campo explícito, siempre `null` (nunca se decodificó). `metodo` devuelve `null` si el código crudo no coincide con ninguno de los tres valores observados, en vez de inventar un cuarto valor.
- Q: La ambigüedad de hora (flag AM/PM con 2 candidatos posibles, ver research.md §5.10) ya se había resuelto en la práctica cada vez que se consiguió confirmación externa: en los 4 casos confirmados hasta ahora (horas 11, 12, 13, 14), el resultado correcto fue siempre el candidato del bloque 8-15hs. ¿Se aplica ese criterio explícitamente en vez de devolver `null`? → A: Sí. `decodeHora` ahora resuelve a `hourMod8 + 8` cuando quedan 2 candidatos, en vez de `null` — confirmado 4/4 contra horarios reales (research.md §5.12). Es un criterio de desempate empírico (probablemente ligado al horario típico de una jornada de oficina), no un hecho de protocolo confirmado; si una futura fichada real contradice el criterio para algún grupo `hourMod8`, hay que revisarlo puntualmente.
- Q: El script recién corrido contra el equipo real seguía devolviendo `hora: null` en varias fichadas a pesar de que ya había información suficiente para resolverla (minuto/segundo decodificables, flag de hora válido). ¿Qué lo estaba bloqueando? → A: Un chequeo adicional de validez sobre los bits bajos de `minuteByte` (exigía el valor exacto `01`, confirmado así solo contra la calibración original de 7 fichadas). Datos reales posteriores (lotes de 28, 4 y 5 fichadas) mostraron `minuteByte` con otros bits bajos (`10`, `00`) donde el minuto decodificado igual coincidía con la hora real confirmada externamente. Se sacó ese chequeo (research.md §5.13): ahora `hora` se resuelve en todos los casos donde el flag de hora y el criterio de desempate de bloque 8-15hs alcanzan, sin depender de un valor específico de esos bits bajos (cuyo significado real sigue sin identificarse).

### Session 2026-07-06/07

- Q: El "flag AM/PM" (bit0 del byte de hora, §5.10) y el "criterio de desempate al bloque 8-15hs" (§5.12) daban por momentos horas incorrectas por 8 horas sin ningún aviso (no `null`, un valor mal con confianza), y `fecha` seguía siempre `null`. Probando el reloj a propósito con la fecha cambiada (día/mes/año), ¿qué se descubrió? → A: Lo que se creía un flag AM/PM era en realidad el bit menos significativo del **día del mes** (nunca se había notado porque toda la calibración original venía de fichadas de un único día real). Y lo que se creía un "criterio de desempate" era simplemente no leer el bloque de 8 horas, que ya viaja directo en 2 bits de `minuteByte`. Con esto, `fecha` y `hora` quedan totalmente decodificados sin ambigüedad ni desempate (`decodeFechaHora`, `research/protocolo_prosoft_rs596.md` §5.16). Además, `legajo` resultó ser un entero de 4 bytes little-endian, no 1 byte (confirmado con una fichada de prueba real con legajo 9999, research.md §5.15); y el bloque de 4 bytes que sobra al final de cada respuesta `0xA4` — que §5.9 explicaba como "el legajo de una fichada aún no llegada" — quedó retractado: no se sostiene cuando `declaredPendingCount=1` (research.md §5.14). Este trabajo se hizo en una sesión paralela y se integró a esta rama el 2026-07-07 tras detectar que la documentación vieja (AM/PM, desempate) seguía llevando a conclusiones erróneas sobre fichadas nuevas.

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
cada fichada están confirmados por el protocolo y cuáles no, para no tomar
decisiones de negocio sobre datos que podrían ser incorrectos.

**Why this priority**: El documento de protocolo (`research/protocolo_prosoft_rs596.md`
§5.7/§5.14/§5.15/§5.16) confirma el timestamp completo de cada fichada
(fecha y hora, sin ambigüedad) y el legajo (entero de 4 bytes). Una
hipótesis previa sobre el byte de hora (un supuesto "flag AM/PM" combinado
con un "criterio de desempate") daba por momentos una hora incorrecta por 8
horas sin ningún aviso — quedó retractada tras calibrar el reloj con fechas
de prueba a propósito: ese bit era en realidad parte del día del mes. El
script sigue señalando `null` explícitamente en los pocos casos donde el
registro no calza con el formato esperado, para no tomar decisiones de
negocio sobre datos sin evidencia.

**Independent Test**: Se puede probar inspeccionando la salida del script
para un lote de fichadas conocido y confirmando que cada campo (`metodo`,
`legajo`, `hora`, `fecha`) trae un valor legible cuando hay evidencia real
detrás, y `null` cuando no se pudo resolver o no es confiable para ese
caso puntual — nunca un valor inventado o indistinguible de uno confirmado.

**Acceptance Scenarios**:

1. **Given** una fichada descargada, **When** el script la reporta, **Then**
   `metodo`, `legajo`, `hora` (`HH:MM:SS`) y `fecha` (`YYYY-MM-DD`) se
   muestran como valores legibles directos (con evidencia real detrás), o
   `null` si el registro no calza con el formato esperado — junto con los
   códigos/bloques crudos sin interpretar, para quien necesite auditar el
   dato original.

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
- ¿Qué pasa si la respuesta a `0xA4` no trae el marcador de payload esperado
  (`55 AA`) al inicio? El script lee exactamente `declaredPendingCount * 20`
  bytes calculados a partir de `0xB4`, por lo que no existe un chequeo de
  "tamaño múltiplo de 20" independiente — ver FR-010 y el bullet siguiente
  sobre discrepancias de conteo (FR-014/FR-009).
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
  cuatro campos legibles como valores directos (sin wrapper de confianza):
  `metodo`, `legajo`, `hora` y `fecha`. Un valor presente en cualquiera de
  estos campos DEBE tener evidencia real detrás (comparación contra el
  software oficial, calibración con horarios/legajos/fechas reales
  conocidos, o fórmula validada contra múltiples capturas); si el campo no
  se pudo resolver, el script DEBE devolver `null` en vez de inventar o
  forzar un valor. En particular: `metodo` es `null` si el código crudo no
  coincide con ninguno de los tres valores observados (huella/tarjeta/
  rostro); `hora` (`HH:MM:SS`) y `fecha` (`YYYY-MM-DD`) se decodifican
  juntas a partir de año/mes/día/hora/minuto/segundo (sin ambigüedad ni
  criterio de desempate — una hipótesis previa de "flag AM/PM +
  desempate al bloque 8-15hs" resultó estar mal interpretando el día del
  mes, ver `research/protocolo_prosoft_rs596.md` §5.16), y ambas devuelven
  `null` juntas únicamente cuando el registro no calza con los flags fijos
  esperados en esos bytes. El script DEBE además exponer `rawHex` (el
  registro completo de 20 bytes) y `verificationMethodCode` (código crudo
  de método) para trazabilidad y diagnóstico, nunca mezclados con los
  valores legibles como si tuvieran el mismo origen. **Actualizado
  2026-07-07:** se sacó `unresolvedFields` (`legajoRaw`/`field0`/`field1`)
  del JSON exportado — quedó redundante con `legajo`/`fecha`/`hora` una vez
  decodificados por completo; los pocos bytes que siguen sin explicarse
  (constante de 3 bytes en `field0`) siguen disponibles dentro de `rawHex`.
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
  fichada (bloque de 4 bytes re-encuadrado que precede a los campos propios
  del registro, leído como entero little-endian, ver
  `research/protocolo_prosoft_rs596.md` §5.9/§5.15) y exponerlo como
  `legajo`, un valor numérico directo; el mismo bloque de 4 bytes queda
  disponible sin interpretar dentro de `rawHex` para quien necesite
  auditarlo (`unresolvedFields.legajoRaw` se eliminó por redundante,
  2026-07-07). Esta decodificación está confirmada contra tres sesiones
  reales
  independientes, incluyendo fichadas verificadas por huella, rostro y
  tarjeta (dos fichadas por tarjeta en `research/control_fichada.csv`,
  filas 3 y 6, decodificaron su legajo real correctamente) — no hay
  evidencia de que el legajo se codifique distinto según el método de
  verificación (ver Clarifications, sesión 2026-07-03, corrigiendo una
  sospecha anterior sin fundamento sobre el caso de tarjeta). El campo
  ocupa los 4 bytes completos, no solo el primero: una fichada de prueba
  real con legajo 9999 confirmó que 1 byte no alcanza (research.md §5.15,
  ver Clarifications sesión 2026-07-06/07).

### Key Entities *(include if feature involves data)*

- **Fichada (registro de asistencia)**: evento crudo de 20 bytes leído del
  reloj (ya re-encuadrado, ver `research/protocolo_prosoft_rs596.md` §5.9).
  Incluye `metodo` (código crudo confirmado; interpretación legible
  confirmada contra el software oficial para tarjeta `0x30` y rostro
  `0x40`, fórmula fuerte para huella `0x10`; `null` si el código no
  coincide con ninguno de los tres), `legajo` (entero de 4 bytes
  little-endian, confirmado contra tres sesiones reales independientes,
  incluyendo los tres métodos de verificación, ver §5.15), `hora` y `fecha`
  (año/mes/día/hora/minuto/segundo, totalmente decodificados sin
  ambigüedad, `null` solo cuando el registro no calza con los flags fijos
  esperados, ver §5.16) y bytes restantes que, a la fecha, siguen sin
  resolverse con certeza (ver `research/protocolo_prosoft_rs596.md`,
  secciones 5.2, 5.6 y 5.8).
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
- El campo de fecha/hora del registro de fichada está totalmente resuelto:
  año, mes, día, hora, minuto y segundo se decodifican juntos sin
  ambigüedad (`research/protocolo_prosoft_rs596.md` §5.16), calibrado
  probando el reloj a propósito con la fecha cambiada (día, mes, año) y con
  los casos límite de hora (0, 12, 23). Una hipótesis previa (minuto/segundo
  confirmados, hora combinando un supuesto "flag AM/PM" con un "criterio de
  desempate al bloque 8-15hs") daba por momentos una hora incorrecta por 8
  horas sin ningún aviso, y la fecha no se decodificaba — quedó retractada:
  ese bit era en realidad parte del día del mes, nunca notado porque la
  calibración original venía de un único día real. `hora`/`fecha` devuelven
  `null` juntas únicamente cuando el registro no calza con los flags fijos
  esperados.
- El número de legajo/identidad del empleado SÍ se identificó dentro del
  registro de 20 bytes de la fichada (campo `legajo`, ver
  `research/protocolo_prosoft_rs596.md` §5.9/§5.11/§5.15 y `data-model.md`
  §1), confirmado contra tres sesiones reales independientes, una vez
  corregido un error de encuadre de 4 bytes que el script tenía. Se expone
  como valor numérico directo (no como hipótesis marcada) para los tres
  métodos de verificación (huella, rostro y tarjeta) por igual — una
  sospecha anterior de que el legajo no era confiable para tarjeta resultó
  estar basada en un valor mal atribuido (research.md §5.9/§5.11), no en
  una limitación real del campo. El campo ocupa los 4 bytes completos,
  leídos little-endian, no solo el primer byte (research.md §5.15).
- El borrado de fichadas ya descargadas (`0xA8`) se deja como una operación
  separada y explícita, no como parte del flujo de consulta simple, en línea
  con el principio de protección de datos de la constitución del proyecto.
