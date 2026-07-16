# Contract — Paginación por bytes del detalle `0xA4`

Contrato del intercambio de comandos/respuestas `0xA4` entre el driver y el reloj RS956,
derivado byte a byte de `research/fichada_2.pcapng` y `research/fichada_3.pcapng` (software
oficial, mismo lote de 173 fichadas, dos configuraciones de `ID DISPOSITIVO`). **Reemplaza**
el contrato de la feature 006 (`pagination-0xA4.md`) para el cálculo de `byteLen`; el formato
de comando/respuesta y el encuadre posterior no cambian.

## Comando `0xA4` (16 bytes)

```
55 AA 01 A4 00 00 00 00 [count LE32] [byteLen LE16] [seq LE16]
                         bytes 8–11   bytes 12–13    bytes 14–15
```

- **Inicial (página 0)**: `count = declaredPendingCount`.
- **Continuación (página k≥1)**: `count = k << 16` (`pageIndex` 1-based desplazado 16 bits) —
  sin cambios respecto a la feature 006, confirmado ahora hasta `pageIndex=3`.
- **`byteLen`** (fórmula corregida en esta feature):

```text
totalBytes = declaredPendingCount * 20
byteLen(página k) = min(totalBytes - bytesYaEntregados, 1024)
```

Ya no hay distinción entre "hay más páginas" / "última página" en la fórmula: es una única
expresión sobre bytes restantes, que da el `byteLen` correcto en cualquier página, incluida
la última.

### Valores de referencia (lote de 173, verificados en dos capturas independientes)

| Página | `count` | `byteLen` |
|--------|---------|-----------|
| 1 | `0x000000AD` (173) | `1024` (`0x0400`) |
| 2 | `0x00010000` | `1024` (`0x0400`) |
| 3 | `0x00020000` | `1024` (`0x0400`) |
| 4 | `0x00030000` | `388` (`0x0184`) |

## Respuesta `0xA4`

```
[ACK 10 bytes] 55 AA [payload: byteLen + 4 bytes]
```

- El equipo **siempre** entrega `byteLen + 4` bytes de payload tras el marcador `55 AA` (sin
  cambios).
- Estructura del payload: `[stream de registros: byteLen bytes] [bloque de cierre 4B]`.
  - El `stream` de cada página es una porción del stream continuo de fichadas. Una fichada
    puede quedar partida entre dos páginas si su offset cae justo en el límite de 1024 bytes
    (confirmado en este lote: el registro 52, entre las páginas 1 y 2).
  - **No hay reenvíos ni duplicados** entre páginas; cada fichada aparece una sola vez.
- Los últimos 4 bytes del payload son el bloque de cierre — se descartan **en toda página**,
  no solo en páginas intermedias (corrección respecto a la interpretación previa de la
  feature 006, ver `research.md` D3: no son el legajo de la página siguiente).

### Valores de referencia de los bloques de cierre (lote de 173, idénticos en ambas capturas)

| Página | Bloque de cierre |
|--------|-------------------|
| 1 | `BA 91 00 00` |
| 2 | `40 89 00 00` |
| 3 | `5B 92 00 00` |
| 4 | `42 42 00 00` |

## Post-condiciones (encuadre)

Sin cambios respecto a la feature 006:

1. Concatenar los `stream` de todas las páginas (payload **sin** los 4 bytes de cierre). El
   resultado mide exactamente `declaredPendingCount * 20` bytes.
2. Encuadrar por **invariante estructural** (`recordType == 00000001` y fecha/hora válida).
3. **Sin deduplicar**: se exportan las `declaredPendingCount` fichadas.
   `rawRecords.length === declaredPendingCount`.
4. Si el tamaño del stream no es `declaredPendingCount * 20`, o el conteo encuadrado difiere
   del declarado, o algún tramo no encuadra ⇒ error de payload inesperado (no exportar
   basura).

## Invariantes de regresión (no romper)

- Camino de 1 a 3 páginas (hasta 153 fichadas): comandos y salida idénticos a los previos —
  para ese rango, el modelo por bytes y el modelo por registros de la feature 006 coinciden
  número a número.
- Decodificación de fecha/hora/método: sin cambios.
- `legajo`: **cambia de ancho en esta feature** — ver
  `contracts/legajo-decoding.md` (o `data-model.md`, sección Fichada) para el contrato
  actualizado.
