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
de longitud genérico en el protocolo — el tamaño de cada respuesta depende
del comando que la originó (documentado en `research/protocolo_prosoft_rs596.md`).

Tabla de tamaños fijos usada para el framing (todos confirmados en el
documento de research):

| Mensaje | Tamaño fijo |
|---|---|
| Comando (software → reloj) | 13 bytes (`55 AA 01 CMD [4] [2] [2] 00`) |
| ACK simple (reloj → software, sin datos) | 11 bytes (`AA 55 01 01 [4] [2] 00`) |
| ACK + payload de `0x13` (1ª respuesta) | 11 + 2 (`55 AA`) + 64 bytes |
| ACK + payload de `0x13` (2ª respuesta) | 11 + 2 + 1040 bytes |
| ACK + payload de `0xC3` | 11 + 2 + 272 bytes |
| ACK + payload de `0xB2` (fecha/hora) | 11 + 2 + 12 bytes |
| ACK + payload de `0xA4` | 11 + 2 + 4 (header) + 20×N bytes (N = pendientes reportados por `0xB4`) |
| Paquete "keepalive" observado | 6 bytes, todos en `00` |

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
