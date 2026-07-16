# Contract — Decodificación del campo `legajo`

Contrato del campo de legajo dentro de una fichada de 20 bytes (bytes 0-3 del registro
re-encuadrado, ver feature 001 §5.9). Deriva de una revisión de **todas** las capturas
reales disponibles del protocolo (feature 001 §5.15 y esta feature, §5.20).

## Formato del campo (4 bytes, offset 0-3 del registro re-encuadrado)

```
[byte0] [byte1] [byte2] [byte3]
\______________/ \_____________/
  legajo (LE16)   bytes altos (chequeo de plausibilidad)
```

- **Bytes 0-1**: entero little-endian de 2 bytes. **Único ancho con evidencia real**: la
  fichada de prueba real con legajo `9999` (`0x270F`) trae estos bytes como `0F 27`, y es el
  único caso observado que excede 1 byte.
- **Bytes 2-3**: en el 100% de las fichadas reales capturadas hasta la fecha, estos dos bytes
  son `00 00`, sin una sola excepción. No hay evidencia de que codifiquen parte del número de
  legajo, ni de que codifiquen ningún otro dato en particular — son una incógnita abierta.

## Regla de decodificación

```text
entrada: campoLegajo (4 bytes)
bytesAltos = campoLegajo[2..3]

si bytesAltos == 00 00:
    legajo = readUInt16LE(campoLegajo, 0)
si no:
    legajo = null   # no confiable: no hay evidencia de qué representan esos bytes
```

`rawHex` del registro (20 bytes completos) preserva siempre el campo de legajo íntegro,
bytes altos incluidos, sin importar el resultado de `legajo` — para que un caso con bytes
altos distintos de cero quede disponible para investigación futura en vez de perderse.

## Valores de referencia

| `campoLegajo` (hex) | `legajo` decodificado | Fuente |
|----------------------|------------------------|--------|
| `01 00 00 00` | `1` | Feature 001 §6.1 (Cesar Villalba) |
| `0F 27 00 00` | `9999` | Feature 001 §5.15 (legajo de prueba, único caso >1 byte) |
| `0A 00 00 00` | `10` | Esta feature, lote de 173 (`research/fichada_2.pcapng`) |
| `0F 27 01 00` (sintético, no observado en tráfico real) | `null` | Bytes altos ≠ `00 00` → no confiable |

## Invariantes de regresión (no romper)

- Ninguna fichada real ya vista cambia su `legajo` reportado (todas tienen bytes altos en
  `00 00`, incluida la de legajo 9999).
- `legajo` sigue siendo independiente de `metodo`/`verificationMethodCode` (confirmado para
  huella, tarjeta y rostro en la feature 001 §5.9/§5.11).
- El esquema de salida (`contracts/output-schema.json` de la feature 001) acota `legajo` a
  `0..65535` en vez de `0..4294967295`.
