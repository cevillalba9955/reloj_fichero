# Feature Specification: Corrección de la paginación del detalle de fichadas (0xA4)

**Feature Branch**: `006-fix-paginacion-fichadas`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Corrección de la paginación del detalle de fichadas (comando 0xA4) del protocolo Prosoft RS956. Al descargar lotes de 3 o más páginas (más de 102 fichadas pendientes), los registros a partir de la tercera página quedan desplazados 4 bytes y se decodifican como basura. Causa raíz confirmada contra captura del software oficial (research/fichada.pcapng, 123 registros): el byteLen del comando de continuación no coincide con el del software oficial. Alinear byteLen a la fórmula oficial, corregir el arrastre entre páginas y hacer el encuadre auto-sincronizante con deduplicación para robustez ante 4+ páginas sin captura."

## Contexto

El driver del reloj biométrico Prosoft RS956 descarga las fichadas pendientes con el
comando de detalle `0xA4`. Para lotes grandes el equipo obliga a paginar (tope confirmado
de 51 registros por tanda). Hasta hoy todas las descargas reales fueron de ≤102 fichadas
(1 o 2 páginas), por lo que el camino de **tres o más páginas nunca se había ejercido con
datos reales**. La primera descarga de 123 fichadas
(`output/fichadas-192.168.1.78-2026-07-14T10_57_04.272Z.json`) reveló que los últimos 21
registros (los de la 3ª página) quedaron mal encuadrados.

La causa se confirmó comparando byte a byte contra una captura del **software oficial**
descargando exactamente esos 123 registros (`research/fichada.pcapng`): el campo `byteLen`
del comando `0xA4` que envía el sistema en las páginas de continuación no coincide con el
que envía el software oficial. El equipo es determinístico (siempre responde `byteLen + 4`
bytes), de modo que el desalineo lo produce el pedido, no el dispositivo.

Esta feature toca exclusivamente el driver del protocolo (Constitución, Principio III) y se
respalda en tráfico real versionado (Principios III y IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descarga íntegra y correcta de lotes de 3+ páginas (Priority: P1)

Como operador del servicio de fichadas, cuando el reloj acumula más de 102 marcaciones
pendientes, necesito que **todas** las fichadas se descarguen y decodifiquen correctamente,
sin registros corruptos ni faltantes, para que la liquidación de presentismo sea confiable.

**Why this priority**: es el defecto reportado y el corazón de la feature. Sin esto, cada
lote grande produce datos de asistencia inválidos que impactan nómina y cumplimiento legal.

**Independent Test**: reproducir la sesión real de 123 fichadas a partir de
`research/fichada.pcapng` (equipo simulado) y verificar que las **123 fichadas declaradas** se
decodifican con fecha, hora, legajo y método válidos, y que **todas** las fichadas del listado
oficial del equipo para los días 13-14 (`tests/fixtures/fichada-3paginas/oficial-13-14.json`)
están presentes, sin faltantes ni duplicados.

**Acceptance Scenarios**:

1. **Given** un reloj con 123 fichadas pendientes (3 páginas), **When** el servicio ejecuta
   una sesión de consulta, **Then** se exportan las **123** fichadas declaradas, todas con
   `fecha`, `hora`, `legajo` y `método` no nulos y `recordType = 00000001`, sin ningún registro
   con campos en `null` por desalineo.
2. **Given** la misma sesión de 123 fichadas, **When** se comparan los registros
   decodificados contra el listado oficial del equipo para los días 13-14 (37 fichadas),
   **Then** todas están presentes (a resolución de minuto), sin faltantes ni duplicados
   byte-idénticos. En particular, **leg 53 @ 2026-07-13 16:00** (primer registro de la 3ª
   página) está presente.
3. **Given** un lote de exactamente 102 fichadas (2 páginas, camino que ya funcionaba),
   **When** el servicio lo descarga, **Then** el resultado sigue siendo correcto (no hay
   regresión en el camino de 1 y 2 páginas).

---

### User Story 2 - Comando de paginación idéntico al software oficial (Priority: P1)

Como responsable del driver, necesito que los comandos `0xA4` que enviamos al equipo sean
byte a byte iguales a los que envía el software oficial para la misma cantidad de páginas,
de modo que el dispositivo responda exactamente lo mismo y el comportamiento sea
predecible y auditable.

**Why this priority**: el equipo es determinístico; enviar el `byteLen` correcto es la
única forma de que devuelva el flujo de bytes que sabemos encuadrar. Es condición necesaria
de la Historia 1.

**Independent Test**: para el lote de 123 fichadas, comparar los tres comandos `0xA4`
generados por el driver contra los tres capturados del software oficial en
`research/fichada.pcapng`, campo por campo.

**Acceptance Scenarios**:

1. **Given** el lote de 123 fichadas, **When** el driver arma el comando de la página 2
   (continuación con más páginas por venir), **Then** el `byteLen` enviado es `1024`
   (igual al oficial), no `1020`.
2. **Given** el lote de 123 fichadas, **When** el driver arma el comando de la página 3
   (última), **Then** el `byteLen` enviado es `412` (igual al oficial), no `416`.
3. **Given** cualquier lote de 1 o 2 páginas, **When** el driver arma sus comandos,
   **Then** siguen coincidiendo con las capturas de referencia previas (sin regresión).

---

### User Story 3 - Robustez ante lotes de 4+ páginas sin captura (Priority: P2)

Como responsable del driver, necesito que el encuadre no dependa de aritmética de offsets de
arrastre página por página (que fue la fuente de un bug: perder el primer registro de la 3ª
página), sino de reconstruir el stream continuo y encuadrarlo por la forma del registro, para
que un lote de 4 o más páginas (para el que todavía no hay captura del software oficial) no
produzca datos corruptos ni pérdidas silenciosas.

**Why this priority**: reduce el riesgo de una clase entera de bugs futuros, pero no es el
defecto reportado y no puede verificarse contra tráfico real todavía; por eso P2.

**Independent Test**: alimentar al encuadrador un stream continuo de N registros (payloads
concatenados sin bloque de cierre) y verificar que devuelve exactamente los N registros, sin
perder ni duplicar.

**Acceptance Scenarios**:

1. **Given** un stream continuo de registros válidos, **When** se encuadra por invariante,
   **Then** cada registro se identifica por su constante de tipo y fecha/hora válida, y se
   emiten todos exactamente una vez.
2. **Given** un stream cuyo tamaño no es múltiplo exacto de `declaredPendingCount * 20`, o cuyo
   conteo encuadrado difiere del declarado, **When** termina la descarga, **Then** el sistema
   falla de forma explícita y trazable (payload inesperado, FR-010), sin exportar datos.

---

### Edge Cases

- **1 sola página (≤51 fichadas)**: no hay continuación; debe seguir funcionando igual.
- **Exactamente 102 fichadas (2 páginas justas)**: frontera del camino ya validado; no debe
  regresionar.
- **Exactamente 103 fichadas (primera vez que aparece la 3ª página con 1 registro)**: caso
  mínimo del defecto.
- **Primer registro de una página de continuación**: sus primeros bytes vienen en el payload de
  la página previa (el equipo los omite en la página actual). La concatenación de payloads sin
  bloque de cierre lo re-arma; NO debe tratarse como un registro reenviado ni descartarse.
- **Legajo administrativo/de prueba (p. ej. leg 1)**: si el equipo lo reporta como pendiente, el
  driver DEBE devolverlo; filtrarlo del reporte final es responsabilidad de una capa superior.
- **Stream con tamaño o conteo inconsistente con `declaredPendingCount`**: se trata como payload
  inesperado (FR-010), no como dato faltante silencioso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El driver MUST enviar, en el comando de continuación `0xA4` de una página que
  tiene más páginas por venir, un `byteLen` igual a `pageCount * 20 + 4`, replicando el
  valor que envía el software oficial (verificado: página 2 = `1024`).
- **FR-002**: El driver MUST enviar, en el comando de continuación `0xA4` de la última
  página, un `byteLen` igual a `pageCount * 20 - 8`, replicando el valor del software
  oficial (verificado: página 3 = `412`).
- **FR-003**: El driver MUST leer exactamente `byteLen + 4` bytes de payload de la respuesta
  a cada `0xA4`, dado que el equipo siempre responde esa cantidad (verificado en las 3
  páginas de la captura).
- **FR-004**: El driver MUST reconstruir el stream continuo de fichadas concatenando el
  payload de cada página **sin su bloque de cierre de 4 bytes finales**. El primer registro de
  cada página de continuación queda "a caballo" entre el payload de la página previa (que
  aporta sus primeros bytes) y el de la página actual; la concatenación lo re-arma sin
  aritmética de arrastre por posición.
- **FR-005**: La concatenación de los payloads (sin bloque de cierre) MUST medir exactamente
  `declaredPendingCount * 20` bytes. NO hay registros reenviados ni duplicados entre páginas:
  cada fichada declarada aparece una sola vez en el stream continuo.
- **FR-006**: El encuadrador de registros MUST identificar los límites de cada fichada por su
  invariante estructural (constante de tipo `recordType = 00000001` y fecha/hora que pasa la
  validación de plausibilidad ya existente), y no exclusivamente por posición fija, para
  poder detectar cualquier desajuste de encuadre.
- **FR-007**: El sistema MUST exportar **todas** las fichadas declaradas por `0xB4`
  (`declaredPendingCount`), sin deduplicar, alineado con el principio existente **FR-013** de
  la feature 001 ("exportar todo lo que reporte el reloj como pendiente; deduplicar es
  responsabilidad de una capa posterior"). Para el lote de referencia: 123 declaradas → 123
  exportadas.
- **FR-008**: El sistema MUST preservar el camino de 1 y 2 páginas sin cambios de
  comportamiento observables (sin regresión), incluyendo el legajo como entero de 4 bytes
  little-endian y la decodificación de fecha/hora/método ya confirmadas.
- **FR-009**: El sistema MUST validar que la cantidad de fichadas encuadradas coincida con
  `declaredPendingCount`; cualquier diferencia (o un stream cuyo tamaño no sea
  `declaredPendingCount * 20`) es un payload inesperado y MUST fallar de forma explícita y
  trazable, no exportarse.
- **FR-010**: Ante bytes inesperados o un flujo que no encuadra según el invariante
  estructural, el sistema MUST fallar de forma explícita y trazable (error de payload
  inesperado) en lugar de exportar registros corruptos.
- **FR-011**: La captura `research/fichada.pcapng` MUST conservarse versionada como fixture
  probatorio de esta corrección y usarse como base de las pruebas de regresión (Constitución,
  Principios III y IV).
- **FR-012**: El borrado de fichadas del equipo (`0xA8`) queda fuera de alcance y NO debe
  modificarse.

### Key Entities *(include if feature involves data)*

- **Fichada (registro de 20 bytes)**: una marcación individual. Atributos legibles: legajo,
  fecha, hora, método (huella/rostro/tarjeta), más la constante de tipo y el código de método
  crudos. Es la unidad que se encuadra, deduplica y exporta.
- **Página de detalle**: una respuesta a un comando `0xA4`. Contiene un conjunto de fichadas
  (hasta el tope del equipo), más bytes de frontera (arrastre hacia la página siguiente y
  bloque de cierre) que no son fichadas.
- **Sesión de descarga**: la secuencia completa de páginas para un `declaredPendingCount`
  dado, con su conteo declarado, cantidad de registros únicos recibidos y estado.
- **Fixture de tráfico (`research/fichada.pcapng`)**: la captura real del software oficial
  que sirve como verdad de referencia (ground truth) de comandos y respuestas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las 123 fichadas declaradas de un lote de 3 páginas se decodifican
  con legajo, fecha, hora y método válidos, sin ningún registro corrupto, faltante ni
  duplicado (hoy: los últimos 21 salen corruptos; una versión intermedia perdía 1 y duplicaba
  otro).
- **SC-002**: Las fichadas decodificadas contienen las 37 del listado oficial del equipo para
  los días 13-14 (a resolución de minuto), con cero faltantes y cero duplicados byte-idénticos;
  en particular, **leg 53 @ 2026-07-13 16:00** está presente.
- **SC-003**: Los comandos `0xA4` generados para el lote de 123 registros son byte a byte
  idénticos a los tres comandos capturados del software oficial.
- **SC-004**: Los lotes de 1 y 2 páginas mantienen el 100% de los resultados previos (cero
  regresiones en la suite de pruebas del protocolo existente).
- **SC-005**: El encuadrador procesa un stream continuo de registros (payloads concatenados
  sin bloque de cierre) devolviendo exactamente `declaredPendingCount` fichadas, sin perder ni
  duplicar ninguna.

## Assumptions

- La fórmula de `byteLen` (`pageCount*20+4` con más páginas, `pageCount*20-8` en la última)
  está confirmada para 1, 2 y 3 páginas contra `research/fichada.pcapng`. Para 4+ páginas se
  asume que las páginas intermedias siguen la regla de "hay más páginas" (`+4`); esta
  extrapolación se cubre con el encuadre auto-sincronizante hasta que exista una captura de
  >153 registros.
- El equipo responde siempre `byteLen + 4` bytes de payload por `0xA4`, comportamiento
  observado idéntico en las 3 páginas de la captura.
- El tope de 51 registros por página se mantiene como una restricción del equipo, no de esta
  feature.
- El equipo saca de "pendientes" lo ya descargado en sesiones normales; esta feature no
  cambia ese comportamiento ni depende de él.
- La captura `research/fichada.pcapng` corresponde al mismo modelo/firmware que el resto de
  las capturas versionadas; un cambio de firmware exigiría re-validar (Constitución,
  Principio III).
- El borrado de fichadas y la lógica de negocio de presentismo quedan fuera de alcance; esta
  feature se limita al driver del protocolo y su encuadre.
