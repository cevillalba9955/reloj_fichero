# Contract — Paginación del detalle `0xA4`

Contrato del intercambio de comandos/respuestas `0xA4` entre el driver y el reloj RS956,
derivado byte a byte de `research/fichada.pcapng` (software oficial, 123 fichadas).

## Comando `0xA4` (16 bytes)

```
55 AA 01 A4 00 00 00 00 [count LE32] [byteLen LE16] [seq LE16]
                         bytes 8–11   bytes 12–13    bytes 14–15
```

- **Inicial (página 0)**: `count = declaredPendingCount`.
- **Continuación (página k≥1)**: `count = k << 16` (`pageIndex` 1-based desplazado 16 bits).
- **`byteLen`**:
  - `pageCount * 20 + 4` si hay más páginas por venir (`hasMorePages`).
  - `pageCount * 20 - 8` en la última página.

### Valores de referencia (lote de 123, verificados)

| Página | `count` | `byteLen` |
|--------|---------|-----------|
| 1 | `0x0000007B` | `1024` (`0x0400`) |
| 2 | `0x00010000` | `1024` (`0x0400`) |
| 3 | `0x00020000` | `412` (`0x019C`) |

## Respuesta `0xA4`

```
[ACK 10 bytes] 55 AA [payload: byteLen + 4 bytes]
```

- El equipo **siempre** entrega `byteLen + 4` bytes de payload tras el marcador `55 AA`.
- Estructura del payload: `[header/arrastre] [registros de 20B] [bloque de cierre 4B]`.
  - Página inicial: los primeros 4 bytes son el legajo del 1er registro (parte del payload).
  - Continuación: el 1er registro se completa con los bytes **arrastrados** de la página previa
    (4 bytes desde la inicial; 8 bytes desde una continuación, y en ese caso el registro
    resultante es un **duplicado** del último de la página previa → descartar).
- Los últimos 4 bytes del payload son el bloque de cierre (se descartan).

## Post-condiciones (encuadre)

1. Concatenar `arrastre + payload` y encuadrar por **invariante estructural** (`recordType ==
   00000001` y fecha/hora válida), no por posición fija.
2. Deduplicar por `(legajo, fecha, hora, metodo)`.
3. `uniqueRecords ≤ declaredPendingCount`; la diferencia (`overlapCount`) es esperada.
4. Cualquier tramo que no encuadra ⇒ error de payload inesperado (no exportar basura).

## Invariantes de regresión (no romper)

- Camino de 1 y 2 páginas: comandos y salida idénticos a los previos.
- `legajo` = uint32 LE; decodificación de fecha/hora/método sin cambios.
