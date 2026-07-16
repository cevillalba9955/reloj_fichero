# Data Model — Fase 1

Entidades del dominio del protocolo que intervienen en la corrección. No hay persistencia
nueva; son estructuras en memoria del driver (`src/protocol/`).

## Fichada (registro de 20 bytes)

Una marcación individual. Encuadre confirmado (feature 001 §5.9/§5.16; ancho de legajo
corregido en esta feature, §5.20).

| Campo | Offset (bytes) | Tipo | Notas |
|-------|----------------|------|-------|
| `legajo` | 0–1 (confirmado) / 2–3 (chequeo) | uint16 LE | **corregido en esta feature**: solo los 2 primeros bytes tienen evidencia real; bytes 2-3 tratados como chequeo de plausibilidad (ver más abajo) |
| (campo/segundo) | 4–7 | — | byte 7 = segundo |
| timestamp fecha/hora | 8–11 | packed | decodificado por `decodeFechaHora` (sin cambios) |
| `recordTypeConstant` | 12–15 | hex | **invariante: `00000001`** en fichadas válidas (sin cambios) |
| `verificationMethodCode` | 16–19 | hex | `00000010` huella, `00000030` tarjeta, `00000040` rostro (sin cambios) |

Campos legibles derivados: `fecha` (`YYYY-MM-DD`), `hora` (`HH:MM:SS`), `metodo`, `rawHex`
(siempre los 20 bytes completos, incluidos los bytes 2-3 del campo de legajo cualquiera sea
su valor), `anomaly` (`recordType != 00000001`).

**Regla de plausibilidad del legajo (FR-006/007/008/009)**:

```text
bytesAltos = campoLegajo[2..3]
si bytesAltos == 00 00:
    legajo = readUInt16LE(campoLegajo, 0)   # confirmado, sin cambio de comportamiento
si bytesAltos != 00 00:
    legajo = null                           # no confiable — nunca observado en tráfico real
# rawHex conserva siempre el registro de 20 bytes completo, bytesAltos incluidos
```

Esta regla es independiente de `recordTypeConstant`/`anomaly`: un registro puede tener
`recordType` válido y legajo no confiable, o viceversa; son chequeos de plausibilidad
distintos sobre campos distintos del mismo registro.

**Invariante estructural de encuadre (sin cambios respecto a la feature 006)**: un tramo de
20 bytes es una fichada válida sii `recordType == 00000001` **y** `decodeFechaHora` la
considera plausible (`looksValid`). No depende del campo de legajo ni de su plausibilidad.

## Página de detalle (`0xA4`)

Una respuesta a un comando de detalle. Elementos:

| Elemento | Tamaño | Descripción |
|----------|--------|-------------|
| stream de la página | `byteLen` | porción del stream continuo de registros que aporta esta página (payload sin el bloque de cierre) |
| bloque de cierre | 4 bytes | siempre presente al final del payload; se descarta **siempre**, en toda página (corregido, ver research.md D3) |

El primer registro de una página cuya frontera cae en medio de una fichada queda "a
caballo": una parte de sus 20 bytes está al final del `stream` de la página **previa**, el
resto al principio de la actual; se re-arma solo al concatenar, sin aritmética de posición
por registro.

Atributos de cálculo por página — **modelo corregido, reemplaza el de la feature 006**:

- `totalBytes = declaredPendingCount * 20` (stream completo a repartir entre todas las
  páginas).
- `entregado` (bytes ya entregados por páginas previas, empieza en 0).
- `byteLen` (comando) = `min(totalBytes - entregado, MAX_PAGE_BYTES)`, con
  `MAX_PAGE_BYTES = 1024`.
- `payloadLen` (respuesta) = `byteLen + 4` (invariante del equipo, sin cambios).

Ya **no** existen los conceptos `pageCount` (registros por página) ni `carrySize` (arrastre
en bytes según la posición de la página) del modelo anterior: el cálculo es puramente
aritmético sobre bytes restantes del stream total, sin ningún concepto de "cuántos registros
completos entran".

## Sesión de descarga

La secuencia completa de páginas para un `declaredPendingCount`. Sin cambios de forma
respecto a la feature 006 (mismos campos); cambia únicamente cómo se calcula `byteLen` por
página (ver arriba).

| Campo | Descripción |
|-------|-------------|
| `declaredPendingCount` | total declarado por `0xB4` |
| `stream` | concatenación de los `byteLen` bytes de cada página; mide `declaredPendingCount * 20` |
| `rawRecords` | fichadas encuadradas del `stream`; `rawRecords.length === declaredPendingCount` |
| `status` | `success` \| `error` |

Regla FR-004/FR-005 (sin cambios): se exportan **todas** las declaradas, sin deduplicar; si
`stream.length !== declaredPendingCount * 20` o el conteo encuadrado difiere del declarado,
es un payload inesperado (error explícito), no un dato faltante silencioso.

## Fixtures de tráfico y ground truth

- `tests/contract/fixtures/ciento-setenta-y-tres-pendientes-paginado.json` — bytes crudos de
  la sesión real del software oficial (173 fichadas, 4 páginas), derivado de
  `research/fichada_2.pcapng` (stream TCP 43).
- `research/fichada_2.pcapng` — captura completa, equipo con `ID DISPOSITIVO=99` (software
  mal configurado con `ID=1`).
- `research/fichada_3.pcapng` — misma sesión de 173 fichadas, equipo **y** software
  reconfigurados a `ID DISPOSITIVO=255`; usada para confirmar que la paginación y los bloques
  de cierre no dependen del `ID DISPOSITIVO`.

## Transiciones de estado (sesión de descarga)

```text
conteo(0xB4) → [ declaredPendingCount == 0 ] → fin (sin páginas)
             → [ > 0 ] → totalBytes = declaredPendingCount*20
                       → página 0: byteLen = min(totalBytes, 1024)
                       → [entregado < totalBytes] → página k: byteLen = min(totalBytes-entregado, 1024)
                                                   → concatenar stream (payload sin bloque de cierre)
                       → encuadre por invariante estructural (sin dedup)
                       → cierre(0x81) → success
   (tamaño != declared*20, o conteo encuadrado != declarado → error de payload inesperado)
```
