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

### D3 — Arrastre entre páginas de continuación (FR-004/005)

- **Decisión**: el arrastre inicial→1ª continuación es de **4 bytes** (el legajo del primer
  registro). El arrastre continuación→continuación es de **8 bytes**, y el primer registro que
  reconstruye es un **duplicado** del último de la página previa (a descartar).
- **Rationale**: en la captura, la página 3 arranca reenviando la cola (bytes 8–19) del último
  registro de la página 2; completándolo con `rec_prev[0:8]` da un registro entero repetido y
  luego 20 nuevos = 21 = `pageCount`. El offset de arranque crece 0→4→8 por página.
- **Alternativas descartadas**: arrastrar 4 bytes en toda continuación (lo actual → desalinea
  4 bytes desde la 3ª página).

### D4 — Encuadre auto-sincronizante + dedup (FR-006/007/010)

- **Decisión**: en vez de trocear por posición fija, encuadrar reconociendo el **invariante
  estructural** de cada fichada (`recordType = 00000001` en bytes 12–15 **y** fecha/hora que
  pasa `looksValid`), y **deduplicar** por `(legajo, fecha, hora, método)`. Si un tramo no
  encuadra, error explícito (no exportar basura).
- **Rationale**: hace el encuadre inmune a la variación exacta del arrastre entre páginas. La
  fórmula de `byteLen`/arrastre está confirmada solo hasta 3 páginas; para 4+ (sin captura) el
  encuadre por invariante + dedup se re-sincroniza solo y colapsa reenvíos, cerrando la clase
  entera de bugs de paginación en lugar de tapar este caso puntual.
- **Alternativas descartadas**: hard-codear offsets por página (frágil, se rompió una vez);
  re-descargar todo por página y deduplicar (desperdicia ancho de banda y tiempo del equipo).

### D5 — Discrepancia `declaredPendingCount` vs. únicos (FR-009)

- **Decisión**: tratar `declaredPendingCount` > cantidad de registros únicos como **esperado**
  (el equipo cuenta el registro reenviado/solapado), logueando la diferencia de forma trazable,
  sin abortar ni marcar faltantes. Ej.: 123 declarados → 122 únicos.
- **Rationale**: el solapamiento de 1 registro por frontera continuación→continuación es
  inherente al protocolo observado.

### D6 — Fixture de tráfico (FR-011)

- **Decisión**: conservar `research/fichada.pcapng` versionado y derivar
  `tests/fixtures/fichada-3paginas/stream10.json` (bytes crudos) para que los tests corran sin
  tshark ni red. El `.pcapng` es la evidencia; el JSON es la fuente de los tests.
- **Rationale**: `node --test` no lee pcapng; extraer una vez y versionar el resultado mantiene
  los tests deterministas y reproducibles (Principio IV).

## Incertidumbre residual (declarada)

- **4+ páginas (>153 registros)**: sin captura del software oficial. Se asume que las páginas
  intermedias siguen la regla "hay más páginas" (`+4`) y que el arrastre sigue creciendo; NO
  está confirmado. Mitigación: D4 (encuadre por invariante + dedup) hace que el resultado sea
  correcto aun si la aritmética exacta difiere, siempre que el equipo entregue todos los bytes.
  Acción de seguimiento recomendada: capturar el software oficial con >153 fichadas y agregarla
  como fixture para cerrar la extrapolación.
