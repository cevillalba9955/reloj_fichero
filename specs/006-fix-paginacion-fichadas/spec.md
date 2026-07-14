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
`research/fichada.pcapng` (equipo simulado) y verificar que las 122 fichadas únicas se
decodifican con fecha, hora, legajo y método válidos, idénticas a las que obtiene el
software oficial.

**Acceptance Scenarios**:

1. **Given** un reloj con 123 fichadas pendientes (3 páginas), **When** el servicio ejecuta
   una sesión de consulta, **Then** todos los registros exportados tienen `fecha`, `hora`,
   `legajo` y `método` no nulos y con `recordType = 00000001`, sin ningún registro con
   campos en `null` por desalineo.
2. **Given** la misma sesión de 123 fichadas, **When** se comparan los registros
   decodificados contra los que produce el software oficial sobre la misma captura,
   **Then** coinciden uno a uno (mismo legajo/fecha/hora/método), sin duplicados.
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

Como responsable del driver, necesito que el encuadre de registros no dependa de aritmética
de offsets página por página, sino que se re-sincronice por la forma del registro y
descarte duplicados, para que un lote de 4 o más páginas (para el que todavía no hay
captura del software oficial) no produzca datos corruptos silenciosos.

**Why this priority**: reduce el riesgo de una clase entera de bugs futuros, pero no es el
defecto reportado y no puede verificarse contra tráfico real todavía; por eso P2.

**Independent Test**: alimentar al encuadrador un flujo sintético de N páginas con
solapamientos y bloques de cierre insertados, y verificar que produce exactamente los
registros únicos esperados sin importar dónde caen los cortes de página.

**Acceptance Scenarios**:

1. **Given** un flujo con registros solapados entre páginas, **When** se encuadra,
   **Then** cada registro se identifica por su invariante estructural (constante de tipo y
   fecha/hora válida) y se emite una sola vez.
2. **Given** un lote cuyo total declarado por el equipo excede la cantidad de registros
   únicos (por solapamiento), **When** termina la descarga, **Then** el sistema no falla
   por la discrepancia y registra la diferencia de forma trazable.

---

### Edge Cases

- **1 sola página (≤51 fichadas)**: no hay continuación; debe seguir funcionando igual.
- **Exactamente 102 fichadas (2 páginas justas)**: frontera del camino ya validado; no debe
  regresionar.
- **Exactamente 103 fichadas (primera vez que aparece la 3ª página con 1 registro)**: caso
  mínimo del defecto.
- **Registro reenviado / duplicado en la frontera de página**: el último registro de una
  página que el equipo reenvía al inicio de la siguiente debe descartarse, no contarse dos
  veces.
- **`declaredPendingCount` mayor que la cantidad de registros únicos**: consecuencia del
  solapamiento; debe tratarse como esperado, no como error de datos faltantes.
- **Lote de 4+ páginas (sin captura oficial)**: debe procesarse por el encuadre
  auto-sincronizante; si aparece algún byte inesperado, debe fallar de forma explícita y
  trazable en vez de exportar basura.

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
- **FR-004**: El driver MUST arrastrar entre páginas de continuación la cantidad de bytes
  correcta (8 bytes a partir de la segunda continuación, no 4), de modo que el registro
  reenviado quede completo y encuadrable.
- **FR-005**: El driver MUST descartar como duplicado el primer registro reenviado al inicio
  de cada página de continuación posterior a la primera (coincide con el último registro de
  la página previa) para no contarlo ni exportarlo dos veces.
- **FR-006**: El encuadrador de registros MUST identificar los límites de cada fichada por su
  invariante estructural (constante de tipo `recordType = 00000001` y fecha/hora que pasa la
  validación de plausibilidad ya existente), y no exclusivamente por posición fija, para
  poder re-sincronizarse ante solapamientos variables.
- **FR-007**: El sistema MUST deduplicar las fichadas por la tupla `(legajo, fecha, hora,
  método)` antes de exportarlas, de modo que los reenvíos de frontera no generen registros
  repetidos.
- **FR-008**: El sistema MUST preservar el camino de 1 y 2 páginas sin cambios de
  comportamiento observables (sin regresión), incluyendo el legajo como entero de 4 bytes
  little-endian y la decodificación de fecha/hora/método ya confirmadas.
- **FR-009**: El sistema MUST tratar un `declaredPendingCount` mayor que la cantidad de
  registros únicos (por solapamiento entre páginas) como una condición esperada, informando
  la diferencia de forma trazable, sin abortar la sesión ni marcar datos como faltantes.
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

- **SC-001**: El 100% de las fichadas de un lote de 123 registros (3 páginas) se decodifican
  con legajo, fecha, hora y método válidos, sin ningún registro corrupto (hoy: los últimos
  21 de 123 salen corruptos).
- **SC-002**: Los registros decodificados coinciden uno a uno con los que produce el software
  oficial sobre la misma captura, con cero duplicados y cero faltantes.
- **SC-003**: Los comandos `0xA4` generados para el lote de 123 registros son byte a byte
  idénticos a los tres comandos capturados del software oficial.
- **SC-004**: Los lotes de 1 y 2 páginas mantienen el 100% de los resultados previos (cero
  regresiones en la suite de pruebas del protocolo existente).
- **SC-005**: El encuadrador procesa un flujo sintético de al menos 4 páginas con
  solapamientos produciendo exactamente los registros únicos esperados, demostrando robustez
  más allá de los casos con captura.

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
