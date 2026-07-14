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
| stream de la página | `byteLen` | porción del stream continuo de registros que aporta esta página (payload sin el bloque de cierre) |
| bloque de cierre | 4 bytes | siempre presente al final del payload; se descarta |

El primer registro de una página de continuación queda "a caballo": sus primeros bytes (4 tras
la inicial, 8 tras una continuación) están al final del `stream` de la página **previa**; se
re-arman al concatenar, sin aritmética de arrastre por posición.

Atributos de cálculo por página:

- `pageIndex` (0-based), `pageCount = min(remaining, 51)`, `hasMorePages`.
- `carrySize` (bytes del 1er registro que aportó la página previa): `0` si inicial, `4` si la
  previa fue la inicial, `8` si la previa fue una continuación.
- `byteLen` (comando): `pageCount*20 + 4` si `hasMorePages`; `pageCount*20 - carrySize` si última.
- `payloadLen` (respuesta): `byteLen + 4` (invariante del equipo).

## Sesión de descarga

La secuencia completa de páginas para un `declaredPendingCount`.

| Campo | Descripción |
|-------|-------------|
| `declaredPendingCount` | total declarado por `0xB4` |
| `stream` | concatenación de los `byteLen` bytes de cada página; mide `declaredPendingCount * 20` |
| `rawRecords` | fichadas encuadradas del `stream`; `rawRecords.length === declaredPendingCount` |
| `status` | `success` | `error` |

Regla FR-007/FR-013: se exportan **todas** las declaradas, **sin deduplicar**. Regla FR-009/FR-010:
si `stream.length !== declaredPendingCount * 20` o el conteo encuadrado difiere del declarado, es
un payload inesperado (error explícito), no un dato faltante silencioso.

## Fixtures de tráfico y ground truth

- `tests/fixtures/fichada-3paginas/stream10.json` — bytes crudos de la sesión real del software
  oficial (123 fichadas, 3 páginas), derivado de `research/fichada.pcapng`.
- `tests/fixtures/fichada-3paginas/oficial-13-14.json` — listado oficial del equipo para los días
  13-14 (37 fichadas, resolución de minuto): ground truth de **contenido** (que no falte ni se
  duplique ninguna).

## Transiciones de estado (sesión de descarga)

```text
conteo(0xB4) → [ declaredPendingCount == 0 ] → fin (sin páginas)
             → [ > 0 ] → página 0 (inicial) → [hasMore] → página 1 (cont) → … → última
                                             → concatenar payloads (sin bloque de cierre)
                                             → encuadre por invariante (sin dedup)
                                             → cierre(0x81) → success
   (tamaño != declared*20, o conteo encuadrado != declarado → error de payload inesperado, FR-010)
```
