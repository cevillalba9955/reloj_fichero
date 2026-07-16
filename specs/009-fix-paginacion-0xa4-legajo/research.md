# Research — Fase 0: paginación por bytes del 0xA4 y ancho real del legajo

Toda decisión de esta feature se respalda en tráfico real (`research/fichada_2.pcapng`,
`research/fichada_3.pcapng`, ambos versionados en el repo), conforme a la Constitución
(Principios III y IV). El detalle completo, con hex verbatim, vive en
`research/protocolo_prosoft_rs596.md` §5.19 y §5.20; este documento resume las decisiones de
diseño derivadas de esa evidencia. El fixture de contrato derivado vive en
`tests/contract/fixtures/ciento-setenta-y-tres-pendientes-paginado.json`.

## Contexto del defecto (paginación)

- El detalle de fichadas (`0xA4`) pagina cuando el lote supera el tope de una sola respuesta.
  El modelo heredado de la feature 006 paginaba por **cantidad de registros** (tope de 51 por
  página, `commands.js:MAX_RECORDS_PER_PAGE`), con un descuento de arrastre de hasta 8 bytes
  en la última página.
- Con 173 fichadas ese modelo daba `51+51+51+20` → 4 páginas, con `byteLen` de la última
  página = `20*20-8 = 392`.
- Síntoma real (`logs/session-192.168.1.78-2026-07-16T12-52-03-389Z.ndjson`): la sesión
  terminó en error — *"El stream de fichadas mide 3464 bytes; se esperaban 3460 (173 x 20).
  Payload inesperado (FR-010)"* — porque el equipo respondió `byteLen+4` para el `byteLen` de
  392 que pedía el driver, 4 bytes más de los que en realidad hacían falta.

## Evidencia: comandos del software oficial vs. los nuestros

Del stream TCP 43 de `research/fichada_2.pcapng` (cliente `192.168.1.87` = software oficial,
equipo `192.168.1.78` con `ID DISPOSITIVO=99`), campo `byteLen` = bytes 12–13 LE del comando
`0xA4`:

| Página | Modelo por registros (`commands.js` previo) | Oficial (real) | Δ |
|--------|-----------------------------------------------|-----------------|---|
| 1 (inicial)       | 1024 (`0x0400`) | 1024 (`0x0400`) | ✅ 0 |
| 2 (continuación)  | 1024 (`0x0400`) | 1024 (`0x0400`) | ✅ 0 |
| 3 (continuación)  | 1024 (`0x0400`) | 1024 (`0x0400`) | ✅ 0 |
| 4 (última)        | **392** (`0x0188`) | **388** (`0x0184`) | ❌ +4 |

Comandos oficiales (verbatim del fixture, campo "count" en bytes 8-11, `byteLen` en 12-13):

```
Pág.1: 55aa01a4 00000000 ad000000 0004 0600   ← count=173, byteLen=1024
Pág.2: 55aa01a4 00000000 00000100 0004 0700   ← count=1<<16, byteLen=1024
Pág.3: 55aa01a4 00000000 00000200 0004 0800   ← count=2<<16, byteLen=1024
Pág.4: 55aa01a4 00000000 00000300 8401 0900   ← count=3<<16, byteLen=388
```

Las tres primeras páginas coinciden byte a byte porque, hasta 3 páginas, "51 registros por
página" y "1024 bytes por página" dan el mismo número (`51*20+4=1024`). Recién en la 4ta
página, con solo 20 registros restantes (400 bytes de contenido puro), el modelo por
registros calculaba `20*20-8=392` mientras que el equipo esperaba `min(388,1024)=388` — la
resta de 8 bytes de "arrastre" no tiene sentido cuando ya no hay una página siguiente que
reciba ese arrastre.

`research/fichada_3.pcapng` (mismo lote de 173, equipo reconfigurado con `ID DISPOSITIVO=255`
en el equipo y en el software oficial) reproduce exactamente los mismos 4 `byteLen` y los
mismos 4 bloques de cierre — confirma que el fenómeno es independiente del `ID DISPOSITIVO`.

## Decisiones

### D1 — Paginación por bytes, no por registros (FR-001)

- **Decisión**: `byteLen(página k) = min(totalBytes - entregado, MAX_PAGE_BYTES)`, donde
  `totalBytes = declaredPendingCount * 20` y `MAX_PAGE_BYTES = 1024`. Se elimina todo cálculo
  basado en "cuántos registros entran en la página" y el descuento de arrastre (`carrySize`).
- **Rationale**: reproduce byte a byte los 4 comandos del software oficial en dos capturas
  independientes (dos `ID DISPOSITIVO` distintos). El modelo por registros coincidía con este
  solo porque, para pageCount≤51, `pageCount*20+4` y `min(bytesRestantes,1024)` dan el mismo
  número; la brecha aparece exactamente cuando la última página tiene menos de 51 registros
  Y hay 4+ páginas en total (nunca antes ejercido con datos reales).
- **Alternativas descartadas**: mantener el modelo por registros con un caso especial para la
  última página de un lote de 4+ páginas (parche puntual, no generaliza y no está respaldado
  por más evidencia que el modelo por bytes, que sí explica las 4 páginas con una sola
  fórmula).

### D2 — Lectura de payload (FR-002)

- **Decisión**: leer exactamente `byteLen + 4` bytes de payload por cada `0xA4`, igual que en
  la feature 006.
- **Rationale**: el equipo sigue agregando siempre 4 bytes (bloque de cierre) al final,
  confirmado en las 4 páginas de ambas capturas nuevas.

### D3 — El bloque de cierre no es contenido del stream (FR-003) — CORRECCIÓN

- **Decisión**: los últimos 4 bytes de cada página se descartan siempre; no se concatenan al
  stream de fichadas bajo ninguna circunstancia.
- **Rationale (hallazgo corregido)**: la feature 006 interpretaba ese bloque, en el caso
  particular de 2 páginas, como "el legajo colgante de la página siguiente". Con 4 páginas
  reales se puede comparar: el cierre de la página 1 (`BA91 0000`) es idéntico en
  `fichada_2.pcapng` y `fichada_3.pcapng` — porque las primeras 53 fichadas del lote nunca se
  borraron del equipo entre ambas capturas — pero los cierres de las páginas 2, 3 y 4
  (`40890000`, `5B920000`, `42420000`) no coinciden con ningún legajo real del lote. La
  evidencia previa de la feature 006 era compatible por casualidad (con 2 páginas, "es el
  legajo de la próxima" y "es basura sin sentido" daban el mismo resultado práctico: se
  descarta igual). Con 4 páginas ambas interpretaciones divergen y solo "se descarta siempre"
  es consistente con las 4 páginas observadas.

### D4 — Encuadre por invariante estructural (sin cambios, FR-004/005)

- **Decisión**: se mantiene el encuadre por invariante estructural ya implementado en la
  feature 006 (`recordType=00000001` + fecha/hora válida), sin tocar `frameRecords`/
  `looksLikeRecordStart`. Se valida que el stream reconstruido mida exactamente
  `declaredPendingCount*20` y que encuadre exactamente `declaredPendingCount` fichadas.
- **Rationale**: el defecto de esta feature está en el *tamaño de página pedido*, no en el
  encuadre de registros dentro del stream ya reconstruido; ese mecanismo sigue siendo
  correcto y su cobertura de tests no cambia.

### D5 — Ancho real del campo de legajo (FR-006/007/008/009)

- **Decisión**: decodificar `legajo` con los 2 primeros bytes del campo re-encuadrado
  (`readUInt16LE`), no los 4 bytes completos. Los bytes en las posiciones 2-3 se tratan como
  chequeo de plausibilidad: si son distintos de `0x0000`, `legajo` se reporta `null` (no
  confiable) en vez de combinarlos en un entero de 32 bits.
- **Rationale**: revisando **todas** las capturas reales disponibles (incluida la fichada de
  prueba con legajo 9999, `0F 27 00 00` — la única que excede 1 byte), los bytes 2-3 del
  campo fueron siempre `00 00`, sin una sola excepción. El ancho de 4 bytes vigente hasta hoy
  nunca tuvo evidencia propia: coincidía con el de 2 bytes exclusivamente porque esos bytes
  altos nunca variaron. No hay ningún caso real con legajo > 65535 que obligue a leer más de
  2 bytes.
- **Alternativas descartadas**: mantener `readUInt32LE` "por si acaso" (viola el principio de
  no fabricar interpretación de bytes sin evidencia, Constitución Principio III); exponer los
  bytes altos como un campo separado sin interpretar (se descarta por ahora — no hay ninguna
  hipótesis con evidencia sobre qué codifican; `rawHex` ya los preserva íntegros para cuando
  aparezca evidencia).

### D6 — Fixtures de tráfico (FR-010)

- **Decisión**: derivar el fixture de contrato
  `tests/contract/fixtures/ciento-setenta-y-tres-pendientes-paginado.json` de
  `research/fichada_2.pcapng` (stream 43), y versionar ambos `.pcapng` (`fichada_2.pcapng`,
  `fichada_3.pcapng`) directamente en `research/` como evidencia primaria.
- **Rationale**: `node --test` no lee `.pcapng` directamente; el fixture derivado (bytes de
  comandos/respuestas reales, extraídos con `tshark`) es la fuente de los tests de contrato e
  integración. Ambas capturas quedan disponibles para volver a extraer o auditar cualquier
  hallazgo futuro (Principio IV).

## Incertidumbre residual (declarada)

- **5+ páginas (>204 registros)**: sin captura del software oficial. El modelo por bytes
  (D1) no depende de cuántas páginas hay — es una fórmula continua sobre bytes restantes —
  por lo que se espera que generalice, pero queda sin verificar contra tráfico real hasta que
  exista una captura de un lote así de grande.
- **Tope real de 1024 bytes**: confirmado como seguro en dos capturas independientes; no se
  probó si el firmware acepta un tope mayor (podría ser un valor de buffer fijo del firmware,
  no necesariamente el máximo posible).
- **Significado de los bytes altos del campo de legajo**: siguen sin identificarse. Quedan
  como incógnita abierta (ver `research/protocolo_prosoft_rs596.md` §5.20, checklist de
  próximos pasos) — posible línea de investigación futura: dar de alta un legajo de prueba
  mayor a 65535 en el software oficial, si el software lo permite.
