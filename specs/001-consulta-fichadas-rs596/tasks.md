---

description: "Task list template for feature implementation"
---

# Tasks: Consulta de Fichadas del Reloj RS596

**Input**: Design documents from `/specs/001-consulta-fichadas-rs596/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (todos presentes)

**Tests**: Incluidos para la capa de protocolo y datos (`src/protocol/`, `src/logging/`, `src/output/`).
No es el default genérico de la plantilla — lo exige la Constitución del
proyecto, Principio IV (Test-First en Capas Críticas, NON-NEGOTIABLE para el
protocolo por el Principio III): los tests de contrato usan las capturas hex
reales de `research/protocolo_prosoft_rs596.md` como fixtures y deben
escribirse y fallar antes de implementar el parser/cliente.

**Organization**: Tareas agrupadas por historia de usuario (US1/US2/US3, spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Proyecto único (Node.js CLI), según `plan.md`: `src/`, `tests/` en la raíz del repositorio.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización del proyecto Node.js

- [X] T001 Crear la estructura de directorios del plan: `src/protocol/`, `src/logging/`, `src/output/`, `src/cli/`, `tests/contract/fixtures/`, `tests/unit/`, `tests/integration/`
- [X] T002 Inicializar `package.json` en la raíz del repo: Node.js >=20, `"type": "module"`, scripts `"test": "node --test"` y `"start": "node src/cli/consultar-fichadas.js"`, sin dependencias de runtime (research.md §1)
- [X] T003 [P] Agregar entradas `output/`, `logs/`, `node_modules/` a `.gitignore` en la raíz del repo

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Sesión TCP, framing del protocolo y logging — infraestructura que TODAS las historias de usuario necesitan

**⚠️ CRITICAL**: Ninguna historia de usuario puede completarse hasta terminar esta fase

> **Nota (hallazgo durante implementación, ver research.md §2-bis)**: `0x80`
> (handshake) y `0x13` (parámetros) no tienen captura hex real en
> `research/protocolo_prosoft_rs596.md` — a diferencia de `0xB4`/`0xA4`, que
> sí están verificados byte a byte. Por decisión explícita del usuario, esta
> fase implementa esos dos comandos como stubs que fallan claramente
> (`ProtocoloNoImplementadoError`) en vez de inventar bytes. El "handshake"
> del estado de sesión en T009 refleja esto: la sesión llega a
> `closed(error)` en ese paso hasta que se consiga una captura real.

### Tests for Foundational layer (escribir PRIMERO, deben fallar antes de implementar — Constitución Principio IV)

- [X] T004 [P] Transcribir las capturas hex reales de `research/protocolo_prosoft_rs596.md` §6 (un registro pendiente, dos registros pendientes, comando de borrado) como fixtures en `tests/contract/fixtures/`
- [X] T005 [P] Contract test de framing (empaquetado de comando `55 AA` para `0xB4`/`0xA4`, detección de ACK `AA 55`, detección y descarte de paquete keepalive de 6 bytes en `00`) contra las fixtures en `tests/contract/framing.contract.test.js`
- [X] T006 [P] Unit test de los tamaños reales verificados por comando (research.md §1 revisado: `0xB4`=16B, `0xA4`=15B, `0xA8`=15B, ACK simple=10B) y de que `buildHandshakeCommand`/`buildParamsCommand` lanzan `ProtocoloNoImplementadoError` en `tests/unit/commands.test.js`

### Implementation

- [X] T007 Implementar constantes de comandos y builders de tramas reales para `0xB4`/`0xA4`/`0x81` (bytes verificados, con contador de secuencia LE parametrizado) en `src/protocol/commands.js`; `buildHandshakeCommand()`/`buildParamsCommand()` lanzan `ProtocoloNoImplementadoError` (research.md §2-bis) (hace pasar T006)
- [X] T008 Implementar framing: empaquetado/desempaquetado de tramas `55 AA`/`AA 55` con contador de secuencia LE incremental, y descarte de paquetes keepalive de 6 bytes en `src/protocol/framing.js` (depende de T007; hace pasar T005)
- [X] T009 Implementar cliente TCP con máquina de estados de sesión (`connecting → handshake → params → querying_pending → downloading_detail → exporting → closed`), cierre garantizado del socket incluso en error (FR-008), fallo inmediato sin reintentos ante conexión rechazada/anómala (FR-011), y fallo explícito y documentado en el paso `handshake` mientras `buildHandshakeCommand()` no esté implementado en `src/protocol/client.js` (depende de T008)
- [X] T010 [P] Implementar logger de sesión NDJSON (`SessionLogEntry` de data-model.md: timestamp, sessionId, event, commandCode, byteLength, detail — nunca `rawHex` completo ni credenciales, Principio V) en `src/logging/session-logger.js`
- [X] T011 Integrar el logger en el cliente TCP: registrar cada comando enviado, cada respuesta recibida, cada keepalive descartado y el cierre de sesión en `src/protocol/client.js` (depende de T009, T010)

**Checkpoint**: framing y comandos `0xB4`/`0xA4` verificados byte a byte
funcionan contra las fixtures reales; el handshake queda bloqueado y
documentado como gap conocido (no silencioso) hasta conseguir una captura
real.

---

## Phase 3: User Story 1 - Descargar fichadas pendientes del reloj (Priority: P1) 🎯 MVP

**Goal**: El script se conecta, consulta cuántas fichadas hay pendientes (`0xB4`), descarga el detalle (`0xA4`), decodifica cada registro y exporta el resultado a JSON + resumen en consola.

**Independent Test**: Ejecutar el script contra un reloj (o el mock TCP basado en fixtures) con ≥1 fichada pendiente y verificar que la cantidad de registros exportados coincide con la declarada por `0xB4`.

### Tests for User Story 1 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T012 [P] [US1] Contract test de parseo de registros de 20 bytes (un registro y dos registros pendientes) contra las fixtures de T004, verificando `recordTypeConstant`, `verificationMethodCode` y los tres `unresolvedFields` crudos en `tests/contract/records.contract.test.js`
- [X] T013 [P] [US1] Integration test del flujo CLI completo contra un mock TCP server basado en las fixtures (casos: 0 pendientes, N pendientes, host inalcanzable) en `tests/integration/consultar-fichadas.integration.test.js`

### Implementation for User Story 1

- [X] T014 [US1] Implementar el parseo de registros de 20 bytes a `FichadaRecord` (campos confirmados + `unresolvedFields` crudos, validación de que `rawHex` mida exactamente 40 hex chars — FR-010) en `src/protocol/records.js` (depende de T012)
- [X] T015 [US1] Implementar en el cliente TCP el envío de `0xB4` (conteo declarado) y `0xA4` (detalle), la validación de tamaño de payload múltiplo de 20 bytes (FR-010), y el manejo interino de discrepancia de conteo (FR-014: tratarla como el mismo error de payload inesperado, sin lógica de reconciliación — ver research.md §5) en `src/protocol/client.js` (depende de T009, T014)
- [X] T016 [US1] Implementar el exportador de JSON según `contracts/output-schema.json` (FR-006) en `src/output/json-exporter.js` (depende de T014)
- [X] T017 [US1] Implementar el punto de entrada CLI: parseo de `--host`/`--port`/`--output-dir`/`--log-dir`/`--timeout-ms` con `util.parseArgs`, orquestación completa de la sesión, y códigos de salida `0`/`1`/`2`/`3` (contracts/cli-contract.md) en `src/cli/consultar-fichadas.js` (depende de T015, T016)
- [X] T018 [US1] Implementar el resumen legible en consola (host, puerto, conteo declarado, conteo exportado, ruta del JSON, ruta del log) en `src/cli/consultar-fichadas.js` (depende de T017)

**Checkpoint**: User Story 1 funciona de punta a punta de forma independiente — este es el MVP.

---

## Phase 4: User Story 2 - Distinguir datos confiables de datos no resueltos (Priority: P2)

**Goal**: La salida del script marca explícitamente qué campos son confiables y cuáles no (timestamp y contadores sin resolver), sin presentarlos como si tuvieran el mismo nivel de certeza.

**Independent Test**: Inspeccionar la salida de un lote conocido de fichadas y confirmar que cada campo no resuelto aparece marcado explícitamente como "sin confirmar" en el JSON y en el resumen de consola.

### Tests for User Story 2 (escribir PRIMERO, deben fallar antes de implementar)

- [ ] T019 [P] [US2] Unit test que verifica que todo `FichadaRecord` expone `verificationMethodLabel.unconfirmed = true` y los tres `unresolvedFields`, y que el exportador nunca omite ese marcado en `tests/unit/records.test.js`

### Implementation for User Story 2

- [ ] T020 [US2] Agregar al resumen de consola una advertencia visible cuando existan fichadas con campos no confirmados, distinguiéndolos de los campos confiables (FR-005, SC-003) en `src/cli/consultar-fichadas.js` (depende de T014, T018)
- [ ] T021 [US2] Validar en el exportador que el JSON generado cumple `contracts/output-schema.json` (en particular, `unconfirmed: true` siempre presente en `verificationMethodLabel`) en `src/output/json-exporter.js` (depende de T016)

**Checkpoint**: User Story 1 y 2 funcionan juntas — el operador distingue dato confiable de no confiable sin leer código.

---

## Phase 5: User Story 3 - Ejecutar en modo solo lectura sin alterar el equipo (Priority: P3)

**Goal**: Garantizar que ninguna ejecución de consulta simple borra fichadas del reloj.

**Independent Test**: Ejecutar el script contra un reloj con fichadas pendientes y, mediante una segunda consulta `0xB4`, verificar que la cantidad de pendientes no cambió.

### Tests for User Story 3 (escribir PRIMERO, deben fallar antes de implementar)

- [ ] T022 [P] [US3] Integration test que confirma que el cliente TCP nunca envía el comando `0xA8` durante el flujo de consulta simple, usando el mock TCP de T013 en `tests/integration/no-delete.integration.test.js`

### Implementation for User Story 3

- [ ] T023 [US3] Confirmar que `src/protocol/commands.js` no expone ningún builder para `0xA8` y que `src/protocol/client.js` no lo invoca en el flujo de consulta (FR-007); dejar un comentario que referencie FR-007 justo donde termina el flujo de cierre de sesión, para que quede explícito que el borrado es una acción separada y deliberadamente no implementada acá (depende de T009, T015)

**Checkpoint**: Las tres historias de usuario funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end y auditoría de cumplimiento constitucional

- [ ] T024 [P] Ejecutar la guía de `quickstart.md` completa contra el mock TCP (casos: 0 pendientes, N pendientes, host inalcanzable, no-destructividad) y corregir cualquier desvío encontrado
- [ ] T025 [P] Auditar `src/logging/session-logger.js` y los logs generados para confirmar que nunca se escribe el `rawHex` completo de una fichada ni ninguna credencial (Constitución, Principio V)
- [ ] T026 [P] Revisar la lista de "Edge Cases" de `spec.md` uno por uno contra la suite de tests existente (T004-T023) y agregar el/los test(s) que falten para los casos no cubiertos aún (ej. conexión caída a mitad de secuencia)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias de usuario
- **User Story 1 (Phase 3)**: depende de Foundational — es el MVP, sin dependencias de otras historias
- **User Story 2 (Phase 4)**: depende de Foundational; reutiliza `FichadaRecord`/`json-exporter.js` de US1 pero es testeable de forma independiente sobre esa base
- **User Story 3 (Phase 5)**: depende de Foundational y de que exista el flujo de consulta de US1 (T009, T015) para poder verificar que `0xA8` nunca se invoca
- **Polish (Phase 6)**: depende de que las historias que se quieran pulir ya estén completas

### User Story Dependencies

- **US1 (P1)**: ninguna dependencia de otras historias — MVP autocontenido
- **US2 (P2)**: se apoya en las estructuras de datos creadas en US1 (T014, T016, T018) pero se prueba con su propio criterio independiente (T019)
- **US3 (P3)**: se apoya en el cliente y comandos de US1 (T009, T015) pero se prueba con su propio criterio independiente (T022)

### Within Each User Story

- Tests antes que implementación (deben fallar primero)
- `records.js`/modelo antes que `client.js`/servicio
- `client.js`/servicio antes que `cli/consultar-fichadas.js` (punto de entrada)
- Historia completa y con checkpoint validado antes de pasar a la siguiente prioridad

### Parallel Opportunities

- T001-T003 (Setup): T003 en paralelo con T001/T002 (archivos distintos)
- T004-T006 (tests Foundational): las tres en paralelo (archivos distintos, sin dependencias entre sí)
- T010 (logger) en paralelo con T007-T009 (archivos distintos)
- T012-T013 (tests US1): en paralelo entre sí
- T019 (test US2) puede empezar en paralelo con el trabajo de Setup/Foundational, aunque solo pasará una vez completado T014
- T022 (test US3) en paralelo con T019 una vez exista el mock de T013
- T024-T026 (Polish): las tres en paralelo

---

## Parallel Example: Foundational Tests

```bash
# Lanzar juntos los tests de la capa fundacional (antes de implementar nada):
Task: "Transcribir fixtures reales en tests/contract/fixtures/"
Task: "Contract test de framing en tests/contract/framing.contract.test.js"
Task: "Unit test de tabla de tamaños por comando en tests/unit/commands.test.js"
```

## Parallel Example: User Story 1

```bash
# Lanzar juntos los tests de User Story 1:
Task: "Contract test de parseo de registros en tests/contract/records.contract.test.js"
Task: "Integration test del flujo CLI en tests/integration/consultar-fichadas.integration.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Phase 3: User Story 1
4. **DETENER Y VALIDAR**: correr `quickstart.md` contra el mock y, si hay reloj disponible, contra hardware real
5. Este es el entregable mínimo: script que descarga y exporta fichadas pendientes

### Incremental Delivery

1. Setup + Foundational → base lista
2. User Story 1 → probar de forma independiente → MVP entregable
3. User Story 2 → probar de forma independiente → mejora de confiabilidad de los datos exportados
4. User Story 3 → probar de forma independiente → garantía de no-destructividad
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- [Story] mapea cada tarea a su historia de usuario para trazabilidad
- Verificar que los tests fallen antes de implementar (Constitución Principio IV)
- FR-014 (discrepancia `0xB4` vs `0xA4`) se implementa en T015 con el comportamiento interino documentado en research.md §5 — no inventar lógica de reconciliación adicional
- Ningún archivo fuera de `src/protocol/` debe construir o interpretar bytes crudos del protocolo (Constitución Principio III; ver contracts/protocol-contract.md)
- Detenerse en cada checkpoint para validar la historia de forma independiente antes de continuar
