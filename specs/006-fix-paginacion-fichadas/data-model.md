# Data Model — Fase 1

Entidades del dominio del protocolo que intervienen en la corrección. No hay persistencia nueva;
son estructuras en memoria del driver (`src/protocol/`).

## Fichada (registro de 20 bytes)

Una marcación individual. Encuadre confirmado (research.md feature 001, §5.9/§5.16).

| Campo | Offset (bytes) | Tipo | Notas |
|-------|----------------|------|-------|
| `legajo` | 0–3 | uint32 LE | entero de 4 bytes (no 1) |
| (campo/segundo) | 4–7 | — | byte 7 = segundo |
| timestamp fecha/hora | 8–11 | packed | decodificado por `decodeFechaHora` |
| `recordTypeConstant` | 12–15 | hex | **invariante: `00000001`** en fichadas válidas |
| `verificationMethodCode` | 16–19 | hex | `00000010` huella, `00000030` tarjeta, `00000040` rostro |

Campos legibles derivados: `fecha` (`YYYY-MM-DD`), `hora` (`HH:MM:SS`), `metodo`, `rawHex`,
`anomaly` (`recordType != 00000001`).

**Invariante estructural de encuadre (FR-006)**: un tramo de 20 bytes es una fichada válida sii
`recordType == 00000001` **y** `decodeFechaHora` la considera plausible (`looksValid`). Este es
el criterio que reemplaza el troceo por posición fija.

**Clave de deduplicación (FR-007)**: `(legajo, fecha, hora, metodo)`.

## Página de detalle (`0xA4`)

Una respuesta a un comando de detalle. Elementos:

| Elemento | Tamaño | Descripción |
|----------|--------|-------------|
| header/arrastre | 4 u 8 bytes | inicio del primer registro; leído del socket (inicial) o arrastrado (continuación) |
| registros | `pageCount * 20` | las fichadas de la página (la 1ª puede ser reenvío/duplicado) |
| bloque de cierre | 4 bytes | siempre presente al final del payload; se descarta |

Atributos de cálculo por página:

- `pageIndex` (0-based), `pageCount = min(remaining, 51)`, `hasMorePages`.
- `byteLen` (comando): `pageCount*20 + 4` si `hasMorePages`, `pageCount*20 - 8` si última.
- `payloadLen` (respuesta): `byteLen + 4` (invariante del equipo).

## Sesión de descarga

La secuencia completa de páginas para un `declaredPendingCount`.

| Campo | Descripción |
|-------|-------------|
| `declaredPendingCount` | total declarado por `0xB4` (puede incluir solapamientos) |
| `rawRecords` / `uniqueRecords` | fichadas únicas tras encuadre + dedup |
| `overlapCount` | `declaredPendingCount - uniqueRecords` (≥0, esperado; FR-009) |
| `status` | `success` | `error` |

Regla FR-009: `overlapCount > 0` es condición **esperada** (no error); se loguea trazablemente.

## Fixture de tráfico

`tests/fixtures/fichada-3paginas/stream10.json` — array `messages` de `{dir, hex}` con la
secuencia real del software oficial (123 fichadas, 3 páginas). Derivado de
`research/fichada.pcapng` (evidencia). Ver `tests/fixtures/fichada-3paginas/README.md`.

## Transiciones de estado (sesión de descarga)

```text
conteo(0xB4) → [ declaredPendingCount == 0 ] → fin (sin páginas)
             → [ > 0 ] → página 0 (inicial) → [hasMore] → página 1 (cont) → … → última
                                             → encuadre por invariante + dedup
                                             → cierre(0x81) → success
   (cualquier byte que no encuadra → error de payload inesperado, FR-010)
```
