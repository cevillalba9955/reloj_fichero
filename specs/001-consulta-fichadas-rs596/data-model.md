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

| Campo | Tipo | Confirmado | Descripción |
|---|---|---|---|
| `rawHex` | string (40 caracteres hex) | — | Los 20 bytes ya re-encuadrados, siempre incluidos para trazabilidad |
| `legajoHipotesis` | integer (0-255) | ❌ hipótesis (27/27 coincidencias contra dos sesiones reales independientes tras corregir el encuadre, ver research.md §5.9) | Primer byte del bloque de 4 bytes re-encuadrado (bytes 0-3); identifica al empleado. Sigue `unconfirmed: true` — no hay confirmación sobre los otros 3 bytes de ese bloque ni sobre el caso de verificación por tarjeta |
| `recordTypeConstant` | string (hex, 8 caracteres) | ✅ (bytes), ❌ (significado) | campo[2] re-encuadrado, bytes 12–15; no es fijo entre sesiones (`00000001` el 2026-07-02, `00000002` el 2026-07-03, ver research.md §5.8); no es el legajo del empleado (hipótesis refutada, research.md §5.6) |
| `verificationMethodCode` | string (hex, 8 caracteres) | ✅ (parcial) | campo[3] re-encuadrado, bytes 16–19; valor crudo confirmado como variable según método |
| `verificationMethodLabel` | string \| `null` | ❌ hipótesis (`0x10`/`0x30`/`0x40` confirmados por comparación externa, ver research.md §5.6) | Interpretación humana de `verificationMethodCode` (ej. "huella", "rostro", "tarjeta"); se expone solo como hipótesis, con `unconfirmed: true` |
| `timestampHypothesis` | string (`HH:MM:SS`) \| `null` | ❌ hipótesis (minuto y segundo confirmados; hora combina `hourMod8` con un flag AM/PM del bit0, confirmado 6/6 contra horarios reales, ver research.md §5.10) | Hora local decodificada de campo[0]/campo[1] re-encuadrados; `null` si el registro no calza con el formato esperado, o si el flag AM/PM no alcanza para desambiguar entre los 2 candidatos restantes de ese `hourMod8` |
| `unresolvedFields.legajoRaw` | string (hex, 8 caracteres) | ❌ (salvo byte0, ver `legajoHipotesis`) | Bloque de 4 bytes re-encuadrado (bytes 0-3) completo, crudo |
| `unresolvedFields.field0` | string (hex, 8 caracteres) | ❌ | campo[0] re-encuadrado, bytes 4–7 (el ultimo byte ya se usa para `timestampHypothesis`, pero se sigue exponiendo crudo aca tambien) |
| `unresolvedFields.field1` | string (hex, 8 caracteres) | ❌ | campo[1] re-encuadrado, bytes 8–11 (bytes 2-3 ya se usan para `timestampHypothesis`; bytes 0-1 sin resolver) |

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
- `verificationMethodLabel` NUNCA se presenta sin su contraparte
  `verificationMethodCode` ni sin el flag de "no confirmado" explícito.
- `timestampHypothesis` NUNCA se presenta sin el flag de "no confirmado"
  explícito, por la misma razón: el componente de hora puede repetirse cada
  8 horas (research.md §5.7), así que no es una garantía del protocolo.
- `legajoHipotesis` NUNCA se presenta sin el flag de "no confirmado"
  explícito: no hay evidencia sobre el caso de verificación por tarjeta
  (research.md §5.9, fila 28 del lote del 2026-07-03 no coincidió con
  ningún legajo real conocido).

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
