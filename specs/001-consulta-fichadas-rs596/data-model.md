# Data Model: Consulta de Fichadas del Reloj RS596

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Este documento describe las entidades manejadas por el script, derivadas de
la sección "Key Entities" de la spec y de los hallazgos de `research.md`.
No representa tablas de base de datos — son estructuras en memoria y en los
archivos de salida (JSON de fichadas, log NDJSON).

## 1. FichadaRecord

Representa un registro individual de 20 bytes leído del reloj (respuesta a
`0xA4`), **ya re-encuadrado** (research.md §5.9, corrección 2026-07-03): el
parser deja de tratar los 4 bytes previos al primer registro como un
"header" descartable y los trata como el campo[4]/legajo real de ese
primer registro; cada registro siguiente toma su legajo del campo[4] del
registro anterior. El orden de bytes de este `FichadaRecord` ya
re-encuadrado es `[legajo(0-3)] [campo0(4-7)] [campo1(8-11)]
[campo2/tipo(12-15)] [campo3/método(16-19)]` — **no** el orden crudo
`[campo0,1,2,3,4]` del payload de `0xA4` (ver `src/protocol/client.js`).
Mezcla campos confirmados por el protocolo con campos no resueltos, sin
combinarlos como si tuvieran el mismo nivel de certeza (spec FR-005).

**Formato de campos legibles (2026-07-03, research.md §5.11):** `metodo`,
`legajo`, `hora` y `fecha` son valores directos, sin wrapper de confianza
(`{value, unconfirmed}`). Un valor presente tiene evidencia real detrás;
`null` significa que no se pudo resolver, o que se sabe que no es
confiable para ese caso puntual — nunca se combina un valor sin evidencia
con uno confirmado (spec FR-005/FR-015).

| Campo | Tipo | Confirmado | Descripción |
|---|---|---|---|
| `rawHex` | string (40 caracteres hex) | — | Los 20 bytes ya re-encuadrados, siempre incluidos para trazabilidad |
| `legajo` | integer (0-255) \| `null` | ✅ (confirmado contra tres sesiones reales independientes, incluyendo huella/rostro/tarjeta, ver research.md §5.9/§5.11) | Primer byte del bloque de 4 bytes re-encuadrado (bytes 0-3); identifica al empleado. Se decodifica igual para los tres métodos de verificación — una sospecha anterior de que tarjeta no era confiable fue retractada (research.md §5.11) |
| `metodo` | `"huella"` \| `"tarjeta"` \| `"rostro"` \| `null` | ✅ para tarjeta/rostro (comparación directa contra software oficial); fórmula fuerte para huella (research.md §5.6) | Interpretación legible de `verificationMethodCode`; `null` si el código crudo no coincide con ninguno de los tres valores observados |
| `hora` | string (`HH:MM:SS`) \| `null` | ✅ (parcial: minuto/segundo confirmados; hora combina `hourMod8` con un flag AM/PM del bit0 —confirmado 7/7 contra horarios reales, research.md §5.10— y, cuando quedan 2 candidatos, un criterio de desempate al bloque 8-15hs —confirmado 4/4, research.md §5.12) | Hora local decodificada de campo[0]/campo[1] re-encuadrados; `null` únicamente si el byte de hora no tiene el formato esperado (bits de flag fijos inválidos) — ya no exige un valor específico en los bits bajos de `minuteByte` (gate eliminado, research.md §5.13: generaba falsos negativos) |
| `fecha` | `null` | ❌ (research.md §5.5/§5.7) | Día/mes/año del evento; nunca se pudo decodificar, siempre `null` hasta que se resuelva ese campo del protocolo |
| `recordTypeConstant` | string (hex, 8 caracteres) | ✅ (bytes), ❌ (significado) | campo[2] re-encuadrado, bytes 12–15; no es fijo entre sesiones (`00000001` el 2026-07-02, `00000002` el 2026-07-03, ver research.md §5.8); no es el legajo del empleado (hipótesis refutada, research.md §5.6) |
| `verificationMethodCode` | string (hex, 8 caracteres) | ✅ (parcial) | campo[3] re-encuadrado, bytes 16–19; valor crudo confirmado como variable según método; base de `metodo` |
| `unresolvedFields.legajoRaw` | string (hex, 8 caracteres) | ❌ (salvo byte0, ver `legajo`) | Bloque de 4 bytes re-encuadrado (bytes 0-3) completo, crudo |
| `unresolvedFields.field0` | string (hex, 8 caracteres) | ❌ | campo[0] re-encuadrado, bytes 4–7 (el ultimo byte ya se usa para `hora`, pero se sigue exponiendo crudo aca tambien) |
| `unresolvedFields.field1` | string (hex, 8 caracteres) | ❌ | campo[1] re-encuadrado, bytes 8–11 (bytes 2-3 ya se usan para `hora`; bytes 0-1 sin resolver) |

**Validation rules**:
- `rawHex` DEBE tener exactamente 40 caracteres hexadecimales (20 bytes); si
  no, el registro se descarta y la sesión se marca en error (ver FR-010).
- El campo[4] (legajo) del **último** registro recibido en una respuesta de
  `0xA4` queda colgando — pertenece a una fichada que todavía no llegó en
  esa descarga — y se descarta explícitamente en `src/protocol/client.js`;
  no debe asignarse a ningún `FichadaRecord` de la sesión actual
  (research.md §5.9).
- `recordTypeConstant` NO es un valor fijo entre sesiones: se observó
  `00000001` en la sesión de calibración del 2026-07-02 y `00000002` de
  forma uniforme en una sesión completa (28 registros) del 2026-07-03
  (research.md §5.8) — el mismo valor para todos los registros de un lote,
  pero distinto entre lotes de días distintos. La hipótesis "= legajo del
  empleado" quedó refutada (research.md §5.6, cruce con `control_fichada.csv`);
  la hipótesis vigente es un contador de lote/sesión (día o generación
  post-borrado), sin confirmar. El script sigue marcando internamente
  (`anomaly: true`, usado hoy solo en el resumen de consola, no en el log
  NDJSON de sesión) cualquier valor que difiera de `00000001`, pero esta
  anomalía es ahora informativa, no necesariamente indicio de protocolo mal
  interpretado — no debe tratarse como motivo para descartar el registro.
- `metodo` NUNCA se presenta sin su contraparte cruda `verificationMethodCode`
  detrás, para poder auditar el valor original.
- `legajo` siempre se decodifica (primer byte del bloque re-encuadrado
  existe en cualquier registro válido de 20 bytes); no hay ningún método
  de verificación conocido para el cual el legajo se sepa no confiable, así
  que hoy nunca devuelve `null` en la práctica.

## 2. QuerySession

Agrupa una conexión TCP puntual al reloj: handshake, consultas y cierre
(spec, "Sesión de consulta").

| Campo | Tipo | Descripción |
|---|---|---|
| `sessionId` | string | Identificador único de la sesión (timestamp ISO + host) |
| `deviceHost` | string | IP del reloj, provista como parámetro de entrada (FR-001) |
| `devicePort` | number | Puerto TCP, `5005` por default |
| `startedAt` / `endedAt` | string (ISO 8601) | Marca de inicio/fin de la sesión (uso interno del script, no confundir con el timestamp no resuelto de cada fichada) |
| `declaredPendingCount` | number | Cantidad de fichadas pendientes reportada por `0xB4` |
| `receivedRecordCount` | number | Cantidad de registros de 20 bytes efectivamente parseados desde `0xA4` |
| `status` | `"success"` \| `"error"` | Resultado final de la sesión |
| `errorReason` | string \| `null` | Motivo del error si `status = "error"` (timeout, conexión rechazada, tamaño de payload inesperado, discrepancia de conteo — FR-014) |
| `logFilePath` | string | Ruta al archivo NDJSON de log de esta sesión |
| `outputFilePath` | string \| `null` | Ruta al JSON exportado (`null` si la sesión terminó en error antes de exportar) |

**State transitions** (secuencial, sin ramas paralelas dentro de una
sesión):

```
connecting → handshake (0x80) → params (0x13 x2) → querying_pending (0xB4)
   → downloading_detail (0xA4, solo si declaredPendingCount > 0)
   → exporting → closed(success)

Cualquier paso puede transicionar a closed(error) directamente; FR-008
exige que, incluso en error, el socket se cierre correctamente antes de
marcar la sesión como `closed`.
```

**Validation rules**:
- Si `declaredPendingCount = 0`, la sesión pasa de `querying_pending`
  directamente a `exporting` (exporta un JSON con `records: []`), sin pasar
  por `downloading_detail` (no hay nada que pedir con `0xA4`).
- Si `receivedRecordCount ≠ declaredPendingCount` (cuando ambos > 0), la
  sesión pasa a `closed(error)` con `errorReason` describiendo la
  discrepancia (comportamiento interino de FR-014, ver `research.md` §5).

## 3. SessionLogEntry

Una línea del log NDJSON de una sesión (Constitución, Principio V).

| Campo | Tipo | Descripción |
|---|---|---|
| `timestamp` | string (ISO 8601) | Momento del evento |
| `sessionId` | string | Referencia a `QuerySession.sessionId` |
| `event` | enum | `command_sent` \| `response_received` \| `keepalive_discarded` \| `session_closed` \| `error` |
| `commandCode` | string (hex) \| `null` | Código de comando asociado (`0x80`, `0x13`, `0xB4`, `0xA4`, etc.), si aplica |
| `byteLength` | number \| `null` | Cantidad de bytes enviados/recibidos en el evento |
| `detail` | string \| `null` | Texto libre para contexto adicional (ej. motivo de error) |

**Validation rules**:
- `detail` NUNCA contiene el `rawHex` completo de un `FichadaRecord` ni
  ningún dato biométrico — solo metadata de la comunicación (Constitución,
  Principio V: los logs no exponen datos biométricos crudos).

## 4. Archivo de salida (JSON exportado)

Estructura completa definida como contrato formal en
[`contracts/output-schema.json`](./contracts/output-schema.json); a alto
nivel, envuelve una `QuerySession` (sin `logFilePath` interno) más un
arreglo de `FichadaRecord`.
