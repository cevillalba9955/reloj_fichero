# Research — Fase 0: paginación del detalle de fichadas (0xA4)

Toda decisión de esta feature se respalda en tráfico real (`research/fichada.pcapng`),
conforme a la Constitución (Principios III y IV). El fixture derivado vive en
`tests/fixtures/fichada-3paginas/`.

## Contexto del defecto

- El detalle de fichadas (`0xA4`) pagina en tandas de a lo sumo 51 registros (tope del equipo,
  `commands.js:MAX_RECORDS_PER_PAGE`).
- Con 123 fichadas la paginación es `51 + 51 + 21` → 3 páginas. **Primera vez** que se ejerce
  el camino de 3 páginas con datos reales (todo lo anterior fue ≤102 = 1–2 páginas).
- Síntoma: en `output/fichadas-192.168.1.78-2026-07-14T10_57_04.272Z.json` los 21 registros de
  la 3ª página salen desplazados 4 bytes (offset 16 ≡ −4 mod 20) y se decodifican como basura
  (`fecha/hora/legajo/método` nulos o incorrectos). Los 102 primeros (páginas 1–2) están OK.

## Evidencia: comandos del software oficial vs. los nuestros

Del stream TCP 10 de `research/fichada.pcapng` (cliente `192.168.1.87` = software oficial),
campo `byteLen` = bytes 12–13 LE del comando `0xA4`:

| Página | pageCount | hasMore | Oficial `byteLen` | **Nuestro `byteLen`** (actual) | Δ |
|--------|-----------|---------|-------------------|-------------------------------|---|
| 1 (inicial)      | 51 | sí | 1024 (`0x0400`) | 1024 (`0x0400`) | ✅ 0 |
| 2 (continuación) | 51 | sí | **1024** (`0x0400`) | **1020** (`0x03FC`) | ❌ −4 |
| 3 (última)       | 21 | no | **412** (`0x019C`) | **416** (`0x01A0`) | ❌ +4 |

Comandos oficiales (verbatim del fixture):

```
Pág.1:  55aa01a4 00000000 7b000000 0004 0600   ← count=123, byteLen=1024
Pág.2:  55aa01a4 00000000 00000100 0004 0700   ← count=1<<16, byteLen=1024
Pág.3:  55aa01a4 00000000 00000200 9c01 0800   ← count=2<<16, byteLen=412
```

El equipo responde **siempre** `byteLen + 4` bytes de payload tras el marcador `55 AA`
(verificado en las 3 páginas: 1024→1028, 1024→1028, 412→416). Conclusión: **el equipo es
determinístico; el desalineo lo produce nuestro pedido, no el dispositivo.**

## Decisiones

### D1 — Fórmula de `byteLen` (FR-001/002)

- **Decisión**: `byteLen = pageCount*20 + 4` cuando hay más páginas por venir;
  `byteLen = pageCount*20 - 8` en la última página. Aplica a inicial y continuaciones por igual.
- **Rationale**: reproduce byte a byte los 3 comandos del software oficial. La actual
  (`bytesNecesarios - 4`) no reproduce ninguno de los dos casos de continuación.
- **Alternativas descartadas**: mantener `bytesNecesarios - 4` (produce el bug); pedir
  `pageCount*20` fijo (el equipo no lo envía así en continuaciones).

### D2 — Lectura de payload (FR-003)

- **Decisión**: leer exactamente `byteLen + 4` bytes de payload por cada `0xA4`.
- **Rationale**: el equipo siempre agrega 4 bytes (bloque de cierre) al final. Confirmado en
  las 3 páginas.

### D3 — Reconstrucción del stream continuo (FR-004/005) — CORRECCIÓN

- **Decisión**: reconstruir el stream continuo de fichadas **concatenando el payload de cada
  página sin sus 4 bytes finales (bloque de cierre)**. La concatenación mide exactamente
  `declaredPendingCount * 20` bytes y contiene todas las fichadas, contiguas, sin solapamientos.
- **Rationale (hallazgo corregido)**: NO hay reenvío de registros. Cada página aporta `byteLen`
  bytes del stream (payload menos el cierre de 4). El primer registro de una página de
  continuación queda "a caballo": sus primeros bytes (4 tras la inicial, 8 tras una
  continuación) viajan al final del payload de la página **previa**, y el resto al principio de
  la actual; al concatenar, se re-arma solo. Verificado contra el fixture (2460 = 123×20) y
  contra el listado oficial de fichadas 13-14: 37/37 presentes, 0 duplicados.
- **Bug previo (retractado)**: una versión intermedia modelaba la página 3 como un *reenvío* del
  último registro de la página 2 y tomaba el arrastre de `(pageCount-1)*20` (cabeza del último
  registro) en vez de `pageCount*20` (los bytes posteriores a los registros). Eso perdía el
  primer registro real de la página 3 (**leg 53 @ 2026-07-13 16:00:18**) y fabricaba un
  duplicado byte-idéntico de **leg 57 @ 16:00:10**. La coincidencia de que ambos registros de
  16:00 comparten la cola (mismo timestamp/método) hizo que el registro fabricado pasara la
  validación de invariante, enmascarando la pérdida. El listado oficial (leg 53 presente,
  0 duplicados) lo destapó.

### D4 — Encuadre por invariante estructural (FR-006/010)

- **Decisión**: trocear el stream continuo reconociendo el **invariante estructural** de cada
  fichada (`recordType = 00000001` en bytes 12–15 **y** fecha/hora que pasa `looksValid`), y
  validar que el conteo encuadrado sea `declaredPendingCount` y que el stream mida
  `declaredPendingCount * 20`. Cualquier desajuste ⇒ error explícito (FR-010).
- **Rationale**: sobre un stream contiguo el encuadre por invariante equivale a trocear de a 20
  bytes, pero además detecta corrupción. Al no depender de aritmética de arrastre por posición,
  elimina la clase de bug que causó la pérdida del registro de frontera.

### D5 — Sin deduplicación (FR-007, alineado con FR-013)

- **Decisión**: **no deduplicar**. Se exportan las `declaredPendingCount` fichadas tal como las
  reporta el equipo. `receivedRecordCount = declaredPendingCount`.
- **Rationale**: con el encuadre corregido no existen duplicados en el stream (cada fichada
  aparece una sola vez). Deduplicar además violaría el principio existente **FR-013** de la
  feature 001 ("exportar todo lo que reporte el reloj; deduplicar es de una capa posterior").
  El `dedupeFichadas` de la versión intermedia sólo servía para tapar el duplicado que el bug de
  arrastre fabricaba, y de paso ocultaba la pérdida (122 en vez de 123); se elimina.

### D6 — Fixture de tráfico (FR-011)

- **Decisión**: derivar el fixture de bytes `tests/fixtures/fichada-3paginas/stream10.json` de la
  captura, y versionar además el listado oficial de fichadas 13-14 como
  `tests/fixtures/fichada-3paginas/oficial-13-14.json` (ground truth de contenido). El `.pcapng`
  queda como evidencia local (excluido por `.gitignore`, igual que las capturas previas); los
  derivados versionados son la fuente de los tests.
- **Rationale**: `node --test` no lee pcapng; el listado oficial es lo que atrapa una pérdida o
  duplicación de fichadas que el conteo por sí solo no revela (Principio IV).

## Incertidumbre residual (declarada)

- **4+ páginas (>153 registros)**: sin captura del software oficial. Se asume que las páginas
  intermedias siguen la regla "hay más páginas" (`+4`) para el `byteLen`. Mitigación: la
  reconstrucción por concatenación de payloads (sin bloque de cierre) y el encuadre por
  invariante (D3/D4) dan el resultado correcto siempre que el equipo entregue todos los bytes y
  el `byteLen` sea el que espera; además, el chequeo de tamaño (`stream == declared*20`) y de
  conteo encuadrado detectan cualquier desajuste en vez de exportar en silencio. Acción de
  seguimiento recomendada: capturar el software oficial con >153 fichadas y agregar tanto la
  captura como su listado oficial como fixtures.
