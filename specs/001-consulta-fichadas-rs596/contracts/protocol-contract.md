# Contrato de protocolo: subconjunto RS596 usado por este script

**Fuente de verdad**: `research/protocolo_prosoft_rs596.md` (no se duplica
contenido binario aquí; este documento solo formaliza qué parte de ese
protocolo consume esta feature y qué queda explícitamente fuera).

## Comandos usados (en orden, por sesión)

| Orden | Comando | Uso en este script |
|---|---|---|
| 1 | `0x80` | Handshake / apertura de sesión — obligatorio, primer mensaje de toda sesión |
| 2 | `0x13` (×3, opcional) | Consulta de parámetros del equipo — **no se envía por defecto** (secuencia reducida, FR-002): 13/13 corridas reales confirmaron que el reloj responde `0xB4`/`0xA4` sin ningún `0x13`. Se envían los tres (parámetros, identificación, parámetros de nuevo) solo cuando se activa `--full-handshake`, para reproducir la secuencia del software oficial Pro-Soft o si un equipo/firmware distinto lo requiere |
| 3 | `0xB4` | Consultar cantidad de fichadas pendientes — resultado usado para `QuerySession.declaredPendingCount` (FR-003) |
| 4 | `0xA4` | Solicitar detalle de fichadas pendientes — solo si `declaredPendingCount > 0` (FR-004) |
| 5 | `0x81` | Cierre de la operación de consulta |
| (cierre socket) | — | Cierre de la conexión TCP; el protocolo no tiene comando explícito de "desconectar" |

## Comandos explícitamente fuera de alcance en esta feature

| Comando | Motivo de exclusión |
|---|---|
| `0xA8` (borrar fichadas) | FR-007 prohíbe el borrado automático; queda para una feature futura separada |
| `0xE9` / `0x98` / `0x96` (alta de usuario) | No relacionado con consulta de fichadas |
| `0xC3` (identificación extendida) | Opcional según el research doc; no aporta nada requerido por esta spec |
| `0xB2` (fecha/hora del equipo) | Aunque está decodificado con certeza, esta feature no lo necesita: el timestamp de cada fichada individual solo está parcialmente resuelto (hora/minuto/segundo cuando la fórmula AM/PM alcanza, fecha aún sin decodificar — FR-005), así que conocer la hora actual del reloj no cierra ese gap en esta iteración |

## Reglas de framing que este script DEBE respetar

1. Todo comando enviado usa el marcador `55 AA`; toda respuesta esperada
   empieza con `AA 55` (ACK) y puede continuar con `55 AA` + payload si el
   comando trae datos. Ver tabla de tamaños fijos en `research.md` §2.
2. El contador de secuencia (2 bytes LE) DEBE incrementar en cada comando
   dentro de la misma sesión TCP, empezando en `01 00`.
3. Paquetes de 6 bytes en `00` recibidos fuera de una respuesta esperada se
   tratan como keepalive y se descartan (research.md §3), no como error.
4. Ninguna función fuera de `src/protocol/` puede construir o interpretar
   bytes crudos del protocolo (Constitución, Principio III) — todo consumo
   externo pasa por las estructuras de `data-model.md` (`FichadaRecord`,
   `QuerySession`).
