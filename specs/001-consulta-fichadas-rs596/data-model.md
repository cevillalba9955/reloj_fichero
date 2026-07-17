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
| `legajo` | integer (entero de 4 bytes) \| `null` | ✅ (confirmado contra tres sesiones reales independientes, incluyendo huella/rostro/tarjeta, ver research.md §5.9/§5.11; ancho de campo corregido en research.md §5.15) | Los 4 bytes del bloque re-encuadrado (bytes 0-3), leídos como entero little-endian; identifica al empleado. Se decodifica igual para los tres métodos de verificación — una sospecha anterior de que tarjeta no era confiable fue retractada (research.md §5.11). Corregido de "solo el primer byte" a "los 4 bytes completos" tras una fichada de prueba real con legajo 9999, que no entra en 1 byte (research.md §5.15) |
| `metodo` | `"huella"` \| `"clave"` \| `"tarjeta"` \| `"rostro"` \| `null` | ✅ para tarjeta/rostro (comparación directa contra software oficial) y clave (comparación directa contra equipo real, research.md §5.21); fórmula fuerte para huella (research.md §5.6) | Interpretación legible de `verificationMethodCode`; `null` si el código crudo no coincide con ninguno de los cuatro valores observados |
| `hora` | string (`HH:MM:SS`) \| `null` | ✅ (research.md §5.7/§5.16: segundo y minuto binarios directos; hora = `hourMod8` (bits5-7 de byte10) + 8×bloque, bloque leído directo de bits0-1 de byte11 — sin ambigüedad ni criterio de desempate, confirmado con horas 0/10/11/12/23 reales) | Hora local decodificada de campo[0]/campo[1] re-encuadrados; `null` únicamente si el registro no calza con los flags fijos esperados en byte8/byte9 |
| `fecha` | string (`YYYY-MM-DD`) \| `null` | ✅ (research.md §5.16, 2026-07-06: año=`(byte8>>2)+1964` confirmado con 3 años (2015/2020/2026); mes=nibble alto de byte9, confirmado con 3 meses; día=bits0-4 de byte10 binario directo, confirmado con 5 días distintos y retroactivamente contra `control_fichada.csv`) | Día/mes/año del evento, antes creído indecodificable — en realidad vivía dentro de lo que se pensaba que era el "byte de hora" (el día) y los bytes que se creían constantes de fecha (año/mes); `null` en el mismo caso que `hora` |
| `recordTypeConstant` | string (hex, 8 caracteres) | ✅ (bytes), ❌ (significado) | campo[2] re-encuadrado, bytes 12–15; no es fijo entre sesiones (`00000001` el 2026-07-02, `00000002` el 2026-07-03, ver research.md §5.8); no es el legajo del empleado (hipótesis refutada, research.md §5.6) |
| `verificationMethodCode` | string (hex, 8 caracteres) | ✅ (parcial) | campo[3] re-encuadrado, bytes 16–19; valor crudo confirmado como variable según método; base de `metodo` |

**Validation rules**:
- `rawHex` DEBE tener exactamente 40 caracteres hexadecimales (20 bytes); si
  no, el registro se descarta y la sesión se marca en error (ver FR-010).
- Siempre sobran 4 bytes al final de cada respuesta de `0xA4`, sin importar
  cuántos registros se declararon pendientes, y se descartan explícitamente
  en `src/protocol/client.js` sin asignarse a ningún `FichadaRecord` de la
  sesión actual. research.md §5.9 los explicaba como "el legajo de una
  fichada que todavía no llegó"; esa explicación quedó retractada
  (research.md §5.14) — no se sostiene cuando `declaredPendingCount=1`, caso
  en el que no puede haber ningún pendiente más. Su significado real es
  desconocido; el contenido se loguea (no se descarta en silencio) para
  poder investigarlo a futuro.
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
- `legajo` siempre se decodifica (los 4 bytes del bloque re-encuadrado
  existen en cualquier registro válido de 20 bytes, leídos little-endian —
  research.md §5.15); no hay ningún método de verificación conocido para el
  cual el legajo se sepa no confiable, así que hoy nunca devuelve `null` en
  la práctica.
- **Eliminado (2026-07-07):** `unresolvedFields` (`legajoRaw`, `field0`,
  `field1`) se sacó de `FichadaRecord` y del JSON exportado. `legajoRaw` y
  `field1` habían quedado completamente redundantes con `legajo`/`fecha`/
  `hora` una vez decodificados (research.md §5.15/§5.16); `field0` conserva
  una constante de 3 bytes (`01 00 00`, offsets 4-6) todavía sin explicar,
  pero sigue disponible para quien la necesite dentro de `rawHex` (offsets
  4-6 del registro completo) — no se perdió ningún byte, solo se dejó de
  exponer por separado un dato ya presente en el crudo.

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
connecting → handshake (0x80)
   → [si fullHandshake=true] params (0x13 x3: parámetros, identificación, parámetros)
   → querying_pending (0xB4)
   → downloading_detail (0xA4, solo si declaredPendingCount > 0)
   → exporting → closed(success)

Por defecto (`fullHandshake=false`, FR-002) el paso `params` se omite:
13/13 corridas reales confirmaron que el reloj responde igual sin ningún
`0x13`. El flag `--full-handshake` restaura los tres llamados `0x13` para
equipos/firmwares que sí los requieran.

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
