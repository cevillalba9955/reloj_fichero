# Research: Consulta de Fichadas del Reloj RS596

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No quedaron marcadores `NEEDS CLARIFICATION` en el Technical Context del
plan (los defaults se justifican por la constitución del proyecto y por el
tamaño/alcance del script). Este documento registra las decisiones técnicas
tomadas para llegar a esos defaults, más los hallazgos de diseño necesarios
para poder framear correctamente el protocolo binario en Fase 1.

## 1. Runtime y dependencias

**Decision**: Node.js 20 LTS, sin dependencias de runtime externas
(`node:net`, `node:fs`, `node:util`, `node:test` únicamente).

**Rationale**: El proyecto ya está declarado como stack JS/React en la
constitución; Node.js es la elección natural para la capa de integración con
hardware. El script es de alcance chico (un solo comando, un solo reloj, sin
servidor HTTP), por lo que agregar un framework, un parser de CLI de
terceros (`commander`/`yargs`) o un logger externo (`pino`/`winston`) sería
complejidad no justificada — la librería estándar de Node 20 ya cubre
sockets TCP crudos, parseo de argumentos (`util.parseArgs`, disponible desde
Node 18) y un test runner (`node:test`, estable desde Node 20).

**Alternatives considered**:
- **TypeScript**: aporta tipado, pero agrega un paso de build para un script
  chico y aislado; se puede introducir después si el proyecto completo migra
  a TS. Rechazado por ahora.
- **Python**: viable para scripting de protocolos binarios, pero rompe la
  coherencia de stack JS declarada en la constitución sin un motivo técnico
  que lo justifique.
- **Commander/yargs para CLI**: mejor ergonomía de ayuda/subcomandos, pero
  el script solo necesita 3-4 flags (`--host`, `--port`, `--output-dir`,
  `--log-dir`); `util.parseArgs` alcanza.
- **Jest**: más funciones (mocks, snapshots), pero agrega una dependencia de
  build/transpilación para un runner que `node:test` ya cubre a este nivel
  de complejidad.

## 2. Framing del protocolo — cómo delimitar mensajes sobre TCP stream

**Decision**: El cliente TCP mantiene una máquina de estados simple:
"esperando respuesta a comando X", donde X determina la cantidad exacta de
bytes a leer antes de considerar la respuesta completa. No existe un campo
de longitud genérico en el protocolo — el tamaño de cada mensaje depende del
comando concreto que lo originó.

> **CORRECCIÓN (2026-07-02, durante `/speckit-implement`)**: La versión
> anterior de esta tabla asumía un formato de comando fijo de 13 bytes y un
> ACK fijo de 11 bytes, extrapolados de la plantilla genérica en prosa de
> `research/protocolo_prosoft_rs596.md` §2 sin contrastarla byte a byte
> contra los ejemplos reales de la §6. Al implementar `src/protocol/`, esa
> verificación mostró que **no coincide**: el comando real `0xB4` mide 16
> bytes y el comando real `0xA4` mide 15 bytes (no 13 ambos), y el ACK
> simple real mide 10 bytes (no 11). Es decir, el "formato de comando" de
> §2 es una simplificación en prosa que no captura parámetros
> específicos por comando — el tamaño real es **variable por comando**, tal
> como su propio nombre lo indica ("4 bytes variable"). La tabla de abajo
> refleja únicamente lo verificado byte a byte contra la §6; ver hallazgo
> completo en `research.md` §5-bis más abajo.

Tamaños confirmados por contraste directo con los ejemplos hex de la §6
(únicos comandos con captura real disponible):

| Mensaje | Tamaño real verificado |
|---|---|
| Comando `0xB4` (consultar pendientes) | 16 bytes (ver `research/protocolo_prosoft_rs596.md` §6.1/6.2, primera línea) |
| Comando `0xA4` (pedir detalle) | 15 bytes (§6.1, tercera línea) |
| Comando `0xA8` (borrar — fuera de alcance de esta feature, FR-007) | 16 bytes (§6.3) |
| ACK simple sin datos (reloj → software) | 10 bytes (§6.1/6.3) |
| ACK + payload de `0xA4` | 10 + 2 (`55 AA`) + 4 (header) + 20×N bytes (N = pendientes) — confirmado en §6.1/6.2 |
| Paquete "keepalive" observado | 6 bytes, todos en `00` |
| Comando `0x80` (handshake) | **Sin captura real — tamaño desconocido, ver §5-bis** |
| Comando `0x13` (parámetros, ×2) | **Sin captura real — tamaño desconocido, ver §5-bis** |
| ACK + payload de `0x13` / `0xC3` / `0xB2` | Tamaños de payload (64B, 1040B, 272B, 12B) confirmados por el research doc, pero el tamaño exacto del ACK que los precede no se recontó byte a byte porque este script no usa esos comandos (ver `contracts/protocol-contract.md`) |

**Rationale**: Como el socket TCP es un stream sin garantía de que cada
`read()` traiga un mensaje completo, el cliente debe acumular bytes en un
buffer interno y solo procesar un mensaje cuando llegó la cantidad exacta
esperada para el comando en curso. Esto evita parsear datos a medias como si
fueran un registro corrupto.

**Alternatives considered**:
- **Delimitadores en el stream**: descartado, el protocolo no usa
  delimitadores de fin de mensaje, solo marcadores de inicio (`55 AA` /
  `AA 55`) que no bastan para saber dónde termina un payload variable como
  el de `0xA4`.
- **Asumir "un `read()` = un mensaje"**: descartado explícitamente — es una
  suposición común pero incorrecta sobre TCP; puede funcionar en pruebas
  locales de baja latencia y fallar en producción con fragmentación real.

## 2-bis. Hallazgo: `0x80` (handshake) y `0x13` (parámetros) sin captura real

**Hallazgo**: `research/protocolo_prosoft_rs596.md` confirma la *existencia*
y el *propósito* de los comandos `0x80`, `0x13` y **también `0x81`**
(aparecen nombrados en los diagramas de secuencia de §5.1 y §5.4), pero **no
incluye ningún ejemplo hexadecimal real de ninguno de los tres** — a
diferencia de `0xB4`, `0xA4` y `0xA8`, que sí tienen captura literal en §6.
Como además se confirmó (ver nota de corrección arriba) que el formato de
comando **no es uniforme** entre comandos, no existe una base confiable para
derivar los bytes exactos de `0x80`/`0x13`/`0x81` a partir de los otros tres
ejemplos. Esto incluye el `0x81` de cierre de operación que pide FR-008 —
el cierre del *socket TCP* en sí no requiere bytes de protocolo (es una
operación de la capa de transporte), pero el frame explícito de "cierre de
operación" documentado sí los necesitaría y tampoco está capturado.

**Decision**: No se fabrican bytes para `0x80`/`0x13`/`0x81`. `src/protocol/commands.js`
expone `buildHandshakeCommand()`, `buildParamsCommand()` y
`buildCloseOperationCommand()` como funciones que lanzan explícitamente
`ProtocoloNoImplementadoError` con un mensaje que referencia este hallazgo,
en vez de construir una trama inventada. Como consecuencia, el cliente TCP
(`src/protocol/client.js`) puede completar el tramo de conteo/detalle de
fichadas (`0xB4`/`0xA4`, verificado byte a byte) pero **no puede completar
el handshake real contra un reloj físico todavía** — la sesión terminará en
`closed(error)` con `errorReason` apuntando a este gap la primera vez que el
flujo llegue a esa etapa. El cierre del socket TCP (`FR-008`, parte de
transporte) sí se garantiza siempre, incluso cuando `buildCloseOperationCommand()`
falla: el cliente captura ese error puntual, lo registra en el log de sesión,
y de todos modos fuerza el cierre del socket subyacente.

**Rationale**: Enviar una trama de `0x80`/`0x13` inventada a un reloj real
en producción viola directamente el Principio III de la constitución
(NON-NEGOTIABLE: nada del protocolo se construye sin respaldo de tráfico
capturado) y podría dejar al equipo en un estado impredecible. Es preferible
que el script falle de forma clara y explícita a que falle silenciosamente
enviando bytes incorrectos.

**Follow-up requerido** (fuera del alcance de este script, pendiente de
research): capturar con Wireshark una sesión real que incluya `0x80` y las
dos invocaciones de `0x13`, y actualizar
`research/protocolo_prosoft_rs596.md` con esos bytes. Una vez disponible,
`buildHandshakeCommand()`/`buildParamsCommand()` se implementan igual que
`buildPendingCountCommand()`/`buildPendingDetailCommand()` (§2 de este
documento) y este hallazgo se cierra.

**Alternatives considered**:
- **Adivinar los bytes por analogía con `0xB4`/`0xA4`**: descartado — ya se
  demostró que el formato varía por comando, así que no hay patrón fiable
  para extrapolar.
- **Omitir el handshake y mandar `0xB4` directo**: descartado como decisión
  de diseño (se le presentó al usuario como opción en `/speckit-implement`
  y no fue la elegida); se puede reconsiderar manualmente más adelante si
  alguien lo prueba contra hardware real y documenta el resultado.

## 3. Manejo de paquetes "keepalive" (`00 00 00 00 00 00`)

**Decision**: Si el cliente recibe 6 bytes en `00` mientras no está
esperando explícitamente ese patrón como parte de una respuesta más grande,
los descarta silenciosamente y continúa esperando la respuesta real, dejando
constancia en el log de sesión (Principio V de la constitución) para no
ocultar tráfico inesperado durante el diagnóstico.

**Rationale**: El documento de research los describe como confirmaciones de
nivel TCP/keepalive sin contenido útil; tratarlos como error rompería el
flujo normal documentado en los ejemplos de la sección 6.

## 4. Estrategia de fixtures para tests de contrato

**Decision**: Las capturas hexadecimales reales de la sección 6 del
documento de research (`research/protocolo_prosoft_rs596.md`) se transcriben
como archivos de fixture en `tests/contract/fixtures/` (uno por escenario:
un registro pendiente, dos registros pendientes, comando de borrado), y los
tests de contrato de `src/protocol/` se escriben contra esas fixtures
**antes** de implementar el parser (Constitución, Principio IV).

**Rationale**: Son las únicas capturas verificadas contra tráfico real
documentadas hoy; usarlas como fixtures versionadas cumple directamente el
mandato de la Constitución (Principio III) de conservar las capturas que
sustentan el protocolo, y evita que el parser se valide solo contra datos
inventados por quien lo escribe.

## 5. Comportamiento interino para FR-014 (discrepancia `0xB4` vs `0xA4`)

**Decision**: Mientras no se valide contra el equipo real, una discrepancia
entre la cantidad declarada por `0xB4` y la cantidad de registros de 20
bytes efectivamente recibidos en `0xA4` se trata igual que un payload de
tamaño inesperado (reutiliza el manejo de error ya definido en FR-010): el
script no exporta ese lote y lo reporta como error, sin intentar
reconciliar ni adivinar cuál de los dos conteos es el correcto.

**Rationale**: La spec (FR-014) prohíbe explícitamente implementar una
lógica definitiva para este caso sin antes confirmarlo contra hardware real.
Reutilizar el camino de error ya existente (en vez de escribir lógica nueva
de reconciliación) es la opción que menos supuestos agrega, y queda marcada
en el código para revisarse en cuanto se pueda probar contra el equipo.

**Alternatives considered**:
- **Exportar lo recibido con advertencia**: fue una opción presentada al
  usuario en `/speckit-clarify` y explícitamente no elegida — el usuario
  prefirió dejar el punto pendiente en vez de fijar este comportamiento.
- **Ignorar el conteo de `0xB4`**: mismo caso — no fue la opción elegida y
  además contradice FR-003 (informar la cantidad declarada al operador).

## 6. Formato de salida (JSON) y del log de sesión

**Decision**: Un archivo JSON por sesión de consulta
(`fichadas-<host>-<timestamp ISO>.json`) con metadata de la sesión y el
arreglo de registros (campos confirmados vs. `"unconfirmed": true` para los
no resueltos, ver `data-model.md`); un log NDJSON separado
(`session-<timestamp ISO>.ndjson`) con una línea estructurada por evento de
la sesión (comando enviado, bytes recibidos, resultado, duración total).

**Rationale**: Separar log de datos exportados evita mezclar información de
diagnóstico (potencialmente ruidosa) con el dataset de negocio (fichadas),
y cumple FR-006 (JSON de fichadas) y FR-012 (log estructurado) como
artefactos independientes, tal como los definió la clarificación de la
spec.
