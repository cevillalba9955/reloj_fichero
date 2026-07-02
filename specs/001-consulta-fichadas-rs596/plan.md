# Implementation Plan: Consulta de Fichadas del Reloj RS596

**Branch**: `001-consulta-fichadas-rs596` (repositorio sin Git inicializado aún; el directorio de feature usa el mismo nombre) | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-consulta-fichadas-rs596/spec.md`

## Summary

Script de línea de comandos en Node.js que se conecta por TCP al reloj
biométrico Prosoft RS596 (puerto `5005`), ejecuta la secuencia de sesión
documentada en `research/protocolo_prosoft_rs596.md` (handshake `0x80`,
parámetros `0x13`×2, conteo de pendientes `0xB4`, detalle `0xA4`), decodifica
cada registro de 20 bytes separando campos confirmados de campos no
resueltos, y exporta el resultado a un archivo JSON local más un resumen en
consola — sin borrar nada del reloj ni escribir en Oracle en esta primera
versión. Toda la lógica del protocolo vive aislada en un módulo adaptador
dedicado (Constitución, Principio III), con tests de contrato basados en las
capturas hex reales incluidas en el propio documento de protocolo
(Constitución, Principio IV), y cada sesión queda registrada en un log
estructurado separado del archivo de salida (Constitución, Principio V).

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript) — coherente con el stack
JS/React declarado en la constitución del proyecto; no requiere TypeScript
para este script aislado, pero no lo excluye a futuro.

**Primary Dependencies**: Ninguna dependencia externa de runtime. Se usa
exclusivamente la librería estándar de Node.js: `node:net` (socket TCP crudo
para el framing binario del protocolo), `node:fs` (escritura de JSON y
logs), `node:util` (`parseArgs` para argumentos de CLI). Justificación:
script pequeño y aislado — agregar un framework HTTP, un parser de CLI de
terceros o un logger externo sería complejidad no justificada para este
alcance (spec no pide servidor HTTP ni opciones de CLI complejas).

**Storage**: Archivos locales (JSON de fichadas exportadas + log NDJSON por
sesión). N/A Oracle DB en esta iteración (FR-006 lo excluye explícitamente).

**Testing**: `node:test` + `node:assert` (test runner incluido en Node.js
20+). Evita agregar Jest/Mocha como dependencia para un proyecto de este
tamaño; suficiente para tests de contrato (fixtures hex) y unitarios.

**Target Platform**: CLI ejecutable en cualquier SO con Node.js 20+ (Windows,
Linux) desde una máquina con acceso de red al reloj.

**Project Type**: Single project (script/CLI) — no involucra frontend en
esta feature; es la capa de integración con hardware descripta en la
constitución como paso previo a exponerla vía API/React.

**Performance Goals**: Descargar y exportar hasta 100 fichadas pendientes en
menos de 10 segundos (spec SC-001).

**Constraints**: Una sola sesión TCP a la vez contra el reloj (protocolo no
validado para concurrencia); sin reintentos automáticos ante conexión
rechazada/anómala (FR-011); sin borrado automático de fichadas (FR-007); el
campo de timestamp exacto por fichada y el conteo-vs-detalle (FR-014) no
están resueltos por protocolo y deben tratarse como tal, no simularse.

**Scale/Scope**: Un único reloj RS596 por ejecución, uso interno por
personal técnico; no está pensado para atender múltiples dispositivos ni
múltiples usuarios concurrentes en esta versión.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica a esta feature | Evaluación |
|---|---|---|
| I. Arquitectura Frontend basada en Componentes (React) | No — esta feature no incluye UI, es un script de backend/CLI | N/A — PASS |
| II. Repositorio de Datos Oracle Aislado | No en esta iteración — FR-006 excluye explícitamente escribir en Oracle | N/A — PASS (revalidar cuando una futura feature conecte esta salida a Oracle) |
| III. Protocolo RS596 Documentado y Aislado (NON-NEGOTIABLE) | Sí — es el núcleo de la feature | PASS — diseño aísla toda la lógica de protocolo en `src/protocol/`, documenta cada campo confirmado/no confirmado (ya reflejado en spec FR-005), y conserva las capturas hex del documento de research como fixtures versionados de test (ver Project Structure y data-model.md) |
| IV. Test-First en Capas Críticas (Protocolo y Datos) | Sí — capa de protocolo | PASS — Phase 1 define fixtures de contrato basados en capturas reales (sección 6 del documento de research); `/speckit-tasks` deberá ordenar tests antes de implementación para `src/protocol/` |
| V. Observabilidad y Protección de Datos Sensibles | Sí | PASS — FR-012 exige log estructurado por sesión; el diseño no persiste templates biométricos (el protocolo de fichadas solo trae un flag de método de verificación, no datos biométricos crudos) ni credenciales (el puerto 5005 no requiere autenticación según el documento de research) |

**Resultado**: Sin violaciones. No se requiere `Complexity Tracking`.

**Re-check post-Fase 1 (tras generar research.md, data-model.md, contracts/,
quickstart.md)**: Sin cambios de resultado. El diseño resultante mantiene
`src/protocol/` como único módulo que conoce bytes crudos (Principio III),
define fixtures de contrato basadas en capturas reales antes de la
implementación (Principio IV), y separa el log estructurado del archivo de
datos exportado sin incluir templates biométricos ni credenciales
(Principio V). Sigue sin aplicar Oracle (Principio II) ni React (Principio
I) en esta feature. PASS confirmado.

## Project Structure

### Documentation (this feature)

```text
specs/001-consulta-fichadas-rs596/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md         # Fase 1 (/speckit-plan)
├── quickstart.md         # Fase 1 (/speckit-plan)
├── contracts/             # Fase 1 (/speckit-plan)
│   ├── cli-contract.md
│   ├── protocol-contract.md
│   └── output-schema.json
└── tasks.md              # Fase 2 (/speckit-tasks — no se crea acá)
```

### Source Code (repository root)

```text
src/
├── protocol/               # Adaptador RS596 aislado (Constitución, Principio III)
│   ├── framing.js           # Empaquetado/desempaquetado de tramas 55 AA / AA 55
│   ├── commands.js          # Constantes de comandos (0x80, 0x13, 0xB4, 0xA4, ...) y builders
│   ├── client.js             # Cliente TCP: abre sesión, envía comandos, recibe respuestas
│   └── records.js            # Parseo de registros de 20 bytes → campos confirmados/no confirmados
├── logging/
│   └── session-logger.js    # Log estructurado NDJSON por sesión (Principio V)
├── output/
│   └── json-exporter.js     # Serialización del resultado a archivo JSON local
└── cli/
    └── consultar-fichadas.js # Punto de entrada del script (parseo de argumentos, orquestación)

tests/
├── contract/
│   ├── fixtures/             # Capturas hex reales copiadas de research/protocolo_prosoft_rs596.md §6
│   └── protocol.contract.test.js
├── unit/
│   ├── framing.test.js
│   └── records.test.js
└── integration/
    └── consultar-fichadas.integration.test.js  # Usa un mock TCP server basado en las fixtures

research/
└── protocolo_prosoft_rs596.md   # Documento existente, fuente de verdad del protocolo (no se duplica contenido)
```

**Structure Decision**: Proyecto único (Option 1 del template). No hay
frontend en esta feature — es la capa de integración con el reloj que, según
la constitución, debe permanecer aislada del resto del sistema (React vendrá
en una feature posterior que consuma la salida de este script, probablemente
vía la capa de repositorio Oracle). `src/protocol/` es el único lugar donde
se conocen los bytes crudos del protocolo; ningún otro módulo debe importar
constantes de comando o hacer parsing binario directamente.

## Complexity Tracking

> No aplica — el Constitution Check no encontró violaciones que requieran
> justificación.
