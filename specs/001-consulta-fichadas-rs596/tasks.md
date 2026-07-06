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

**Nota de regeneración (2026-07-03)**: esta versión reconcilia `tasks.md`
contra el estado real del código y de `spec.md`/`data-model.md`/`research.md`
después de una sesión larga de trabajo directo sobre hardware real que
encontró y corrigió un bug de encuadre, agregó decodificación de legajo
(FR-015) y de hora parcial (AM/PM), y corrigió FR-002/FR-010 (ver
`/speckit-analyze` y `/speckit-clarify` de esta misma fecha). Se
renumeraron las tareas; las que ya estaban implementadas y probadas se
marcan `[X]` con referencia a dónde viven hoy, aunque no se hayan hecho en
el orden original.

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

> **Actualizada (2026-07-03)**: la nota original decía que `0x80`
> (handshake) y `0x13` (parámetros) quedaban implementados como stubs que
> fallaban con `ProtocoloNoImplementadoError` por falta de captura real.
> Eso quedó **obsoleto**: research.md §6.4 documenta la secuencia completa
> confirmada byte a byte (handshake + tres llamados `0x13`: parámetros,
> identificación, parámetros de nuevo), implementada en
> `src/protocol/commands.js`/`client.js` y validada en decenas de sesiones
> reales a lo largo de este documento. `ProtocoloNoImplementadoError` sigue
> existiendo como clase (para un futuro comando sin captura), pero ya no
> aplica a ningún builder de esta fase.
>
> Experimentos dirigidos (`experiments/`, ver research.md §6.6), con 13
> corridas en total (conteo `0xB4` solo, secuencia parcial, y detalle
> `0xA4` real completo), mostraron **13/13 éxitos** sin ningún `0x13` — ya
> no hay evidencia de que el reloj los requiera para ninguna operación de
> esta feature. Por eso el cliente ejecuta hoy la secuencia **reducida**
> (solo `0x80`) por defecto, con un flag `fullHandshake`/`--full-handshake`
> para restaurar la secuencia completa de tres `0x13` sin tocar código
> (T036, FR-002).

### Tests for Foundational layer (escribir PRIMERO, deben fallar antes de implementar — Constitución Principio IV)

- [X] T004 [P] Transcribir las capturas hex reales de `research/protocolo_prosoft_rs596.md` §6 (un registro pendiente, dos registros pendientes, tres registros con tarjeta, siete registros de control, comando de borrado) como fixtures en `tests/contract/fixtures/`
- [X] T005 [P] Contract test de framing (empaquetado de comando `55 AA` para `0xB4`/`0xA4`, detección de ACK `AA 55`, detección y descarte de paquete keepalive de 6 bytes en `00`) contra las fixtures en `tests/contract/framing.contract.test.js`
- [X] T006 [P] Unit test de los tamaños reales verificados por comando (research.md §1/§6.4: `0x80`=16B, `0x13` parámetros=16B/64B resp., `0x13` identificación=16B/1040B resp., `0xB4`=16B, `0xA4`=16B, `0xA8`=16B, ACK simple=10B) en `tests/unit/commands.test.js`

### Implementation

- [X] T007 Implementar constantes de comandos y builders de tramas reales para `0x80`/`0x13` (parámetros e identificación)/`0xB4`/`0xA4`/`0x81` (bytes verificados contra el equipo real, con contador de secuencia LE parametrizado) en `src/protocol/commands.js`; sin builder para `0xA8` (FR-007) (hace pasar T006)
- [X] T008 Implementar framing: empaquetado/desempaquetado de tramas `55 AA`/`AA 55` con contador de secuencia LE incremental, y descarte de paquetes keepalive de 6 bytes en `src/protocol/framing.js` (depende de T007; hace pasar T005)
- [X] T009 Implementar cliente TCP con máquina de estados de sesión (`connecting → handshake → params → identificacion → params → querying_pending → downloading_detail → exporting → closed`), cierre garantizado del socket incluso en error (FR-008), fallo inmediato sin reintentos ante conexión rechazada/anómala (FR-011), con la secuencia real completa de apertura (FR-002) en `src/protocol/client.js` (depende de T008)
- [X] T010 [P] Implementar logger de sesión NDJSON (`SessionLogEntry` de data-model.md: timestamp, sessionId, event, commandCode, byteLength, detail — nunca `rawHex` completo ni credenciales, Principio V) en `src/logging/session-logger.js`
- [X] T011 Integrar el logger en el cliente TCP: registrar cada comando enviado, cada respuesta recibida, cada keepalive descartado y el cierre de sesión en `src/protocol/client.js` (depende de T009, T010)
- [X] T012 Corregir el encuadre de las fichadas en `src/protocol/client.js`/`src/protocol/records.js`: dejar de descartar el header de 4 bytes previo al primer registro (es el legajo de esa fichada, no un valor sin significado) y re-cortar el stream como `[legajo][campo0][campo1][campo2][campo3]` por fichada; el legajo colgante del último registro de cada respuesta se descarta explícitamente (research.md §5.9) (depende de T009)

**Checkpoint**: framing, comandos y secuencia de apertura completa (`0x80`
+ tres `0x13`) confirmados byte a byte contra el equipo real y funcionando
end-to-end; encuadre de fichadas corregido.

---

## Phase 3: User Story 1 - Descargar fichadas pendientes del reloj (Priority: P1) 🎯 MVP

**Goal**: El script se conecta, consulta cuántas fichadas hay pendientes (`0xB4`), descarga el detalle (`0xA4`), decodifica cada registro y exporta el resultado a JSON + resumen en consola.

**Independent Test**: Ejecutar el script contra un reloj (o el mock TCP basado en fixtures) con ≥1 fichada pendiente y verificar que la cantidad de registros exportados coincide con la declarada por `0xB4`.

### Tests for User Story 1 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T013 [P] [US1] Contract test de parseo de registros de 20 bytes ya re-encuadrados (`recordTypeConstant`, `verificationMethodCode`, `unresolvedFields.legajoRaw`/`field0`/`field1`) contra las fixtures de T004 en `tests/contract/records.contract.test.js`
- [X] T014 [P] [US1] Integration test del flujo CLI completo contra un mock TCP server basado en las fixtures (casos: 0 pendientes, N pendientes, host inalcanzable) en `tests/integration/consultar-fichadas.integration.test.js`

### Implementation for User Story 1

- [X] T015 [US1] Implementar el parseo de registros de 20 bytes ya re-encuadrados a `FichadaRecord` (campos confirmados + `unresolvedFields` crudos, validación de que `rawHex` mida exactamente 40 hex chars — FR-010) en `src/protocol/records.js` (depende de T012, T013)
- [X] T016 [US1] Implementar en el cliente TCP el envío de `0xB4` (conteo declarado) y `0xA4` (detalle), la validación del marcador `55 AA` (FR-010), y el manejo interino de discrepancia de conteo (FR-014: tratarla como el mismo error de payload inesperado cuando sobran bytes, sin lógica de reconciliación — ver research.md §5) en `src/protocol/client.js` (depende de T009, T012, T015)
- [X] T017 [US1] Implementar el exportador de JSON según `contracts/output-schema.json` (FR-006) en `src/output/json-exporter.js` (depende de T015)
- [X] T018 [US1] Implementar el punto de entrada CLI: parseo de `--host`/`--port`/`--output-dir`/`--log-dir`/`--timeout-ms` con `util.parseArgs`, orquestación completa de la sesión, y códigos de salida `0`/`1`/`2`/`3` (contracts/cli-contract.md) en `src/cli/consultar-fichadas.js` (depende de T016, T017)
- [X] T019 [US1] Implementar el resumen legible en consola (host, puerto, conteo declarado, conteo exportado, ruta del JSON, ruta del log) en `src/cli/consultar-fichadas.js` (depende de T018)

**Checkpoint**: User Story 1 funciona de punta a punta — confirmado no
solo contra el mock, sino contra hardware real en múltiples sesiones
(2026-07-02 y 2026-07-03, incluyendo lotes de hasta 28 fichadas).

---

## Phase 4: User Story 2 - Distinguir datos confiables de datos no resueltos (Priority: P2)

**Goal**: La salida del script marca explícitamente qué campos son confiables y cuáles no (método de verificación, timestamp, legajo), sin presentarlos como si tuvieran el mismo nivel de certeza.

**Independent Test**: Inspeccionar la salida de un lote conocido de fichadas y confirmar que cada campo no resuelto aparece marcado explícitamente como "sin confirmar" en el JSON y en el resumen de consola.

### Tests for User Story 2 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T020 [P] [US2] Unit/contract test que verifica que todo `FichadaRecord` expone `metodo`, `legajo`, `hora` y `fecha` como valores directos (sin wrapper `unconfirmed`, ver research.md §5.11) junto con los `unresolvedFields` crudos y los códigos crudos (`verificationMethodCode`) para trazabilidad — cubierto en `tests/contract/records.contract.test.js` y `tests/unit/json-exporter.test.js` (no en un archivo separado `tests/unit/records.test.js` como se planeó originalmente; la cobertura es equivalente). Nota: esta tarea describía originalmente un wrapper `{value, unconfirmed: true}` que fue reemplazado por valores directos antes de completarse (ver Clarifications spec.md sesión 2026-07-03)

### Implementation for User Story 2

- [X] T021 [US2] Agregar al resumen de consola una advertencia visible cuando existan fichadas con campos no confirmados, distinguiéndolos de los campos confiables (FR-005, SC-003) en `src/cli/consultar-fichadas.js` (depende de T015, T019)
- [X] T022 [US2] Validar en el exportador que el JSON generado cumple `contracts/output-schema.json` (en particular, que `metodo`, `legajo`, `hora` y `fecha` se expongan como valores directos sin wrapper, y que `null` se use únicamente cuando el campo no se pudo resolver o se sabe no confiable, ver research.md §5.11) en `src/output/json-exporter.js` (depende de T017)
- [X] T023 [US2] Decodificar el legajo/ID de empleado (FR-015): primer byte del bloque re-encuadrado, expuesto como `legajo` (valor numérico directo, sin wrapper); confirmado contra tres sesiones reales independientes para los tres métodos de verificación (huella, rostro y tarjeta — dos fichadas por tarjeta en control_fichada.csv, filas 3 y 6), en `src/protocol/records.js` (research.md §5.9/§5.11) (depende de T012, T015)
- [X] T024 [US2] Decodificar parcialmente `hora` combinando `hourMod8` con un flag AM/PM (bit0 del byte de hora, límite `hora<=12`): resolver la hora sin ambigüedad cuando el flag alcanza a descartar 2 de los 3 candidatos posibles, devolver `null` en caso contrario; confirmado 7/7 contra horarios reales conocidos incluyendo el caso límite hora=12, en `src/protocol/records.js` (research.md §5.10) (depende de T015)
- [X] T025 [US2] Relajar el gate de validez de minuto (`minuteByte` bits bajos, exigía `01` exacto) en `decodeHora` — datos reales de múltiples sesiones (28, 4 y 5 fichadas, 2026-07-03) mostraban minutos correctamente decodificados que el gate rechazaba; se sacó el chequeo, solo queda validar `minuteByte >> 2 <= 59` (research.md §5.13) en `src/protocol/records.js`. También se agregó T024's criterio de desempate del bloque 8-15hs cuando el flag AM/PM deja 2 candidatos (research.md §5.12), confirmado 4/4 contra horarios reales.
- [ ] T026 [P] [US2] Conseguir fichadas de calibración real para la hora `0` (medianoche) y las horas todavía sin confirmar, para seguir angostando la ambigüedad de `decodeTimestampHypothesis` (research.md §5.10 "pendiente")

**Checkpoint**: US1 y US2 funcionan juntas — el operador distingue dato
confiable (método de verificación, legajo, y hora cuando el flag AM/PM
alcanza a resolverla) de no confiable, sin leer código, confirmado contra
hardware real.

---

## Phase 5: User Story 3 - Ejecutar en modo solo lectura sin alterar el equipo (Priority: P3)

**Goal**: Garantizar que ninguna ejecución de consulta simple borra fichadas del reloj.

**Independent Test**: Ejecutar el script contra un reloj con fichadas pendientes y, mediante una segunda consulta `0xB4`, verificar que la cantidad de pendientes no cambió.

### Tests for User Story 3 (escribir PRIMERO, deben fallar antes de implementar)

- [ ] T027 [P] [US3] Integration test que confirma que el cliente TCP nunca envía el comando `0xA8` durante el flujo de consulta simple, usando el mock TCP de T014 en `tests/integration/no-delete.integration.test.js` — hoy la garantía existe solo por ausencia de builder (T028), sin un test de regresión dedicado

### Implementation for User Story 3

- [X] T028 [US3] Confirmar que `src/protocol/commands.js` no expone ningún builder para `0xA8` y que `src/protocol/client.js` no lo invoca en el flujo de consulta (FR-007); comentario que referencia FR-007 ya presente en `src/protocol/commands.js` (depende de T009, T016)

**Checkpoint**: Las tres historias de usuario funcionan de forma
independiente contra hardware real; falta únicamente el test de
regresión dedicado de T027.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end, auditoría de cumplimiento constitucional, y cierre de gaps encontrados en `/speckit-analyze` (2026-07-03)

- [ ] T029 [P] Ejecutar la guía de `quickstart.md` completa como checklist formal (casos: 0 pendientes, N pendientes, host inalcanzable, no-destructividad) — de facto ya validado en múltiples sesiones reales a lo largo de este documento, pero no como recorrido explícito de la guía
- [X] T030 [P] Auditar `src/logging/session-logger.js` y los logs generados para confirmar que nunca se escribe el `rawHex` completo de una fichada ni ninguna credencial (Constitución, Principio V) — cubierto por test unitario dedicado en `tests/unit/session-logger.test.js`
- [ ] T031 [P] Revisar la lista de "Edge Cases" de `spec.md` uno por uno contra la suite de tests existente y agregar el/los test(s) que falten (ej. conexión caída a mitad de secuencia, entre `0x80` y el primer `0x13`)
- [ ] T032 [P] Agregar un test que mida el tiempo de ejecución contra un mock de ~100 fichadas pendientes y verifique el objetivo de SC-001 (<10s)
- [ ] T033 [P] Agregar un test de integración que confirme FR-013: ejecutar el flujo dos veces contra el mismo estado de pendientes en el mock y verificar que ambas exportaciones contienen los mismos registros, sin deduplicar
- [ ] T034 [P] Agregar los lotes reales de fichadas usados para validar legajo/hora (28 registros y 5 registros, sesiones del 2026-07-03) como fixtures de contrato versionadas en `tests/contract/fixtures/` (hoy solo documentados en `research.md` y en CSVs sueltos — research.md §5.9/§5.10 lo marca como pendiente)
- [X] T035 [P] Extender el experimento sin `0x13` para pedir `0xA4` real (fichadas pendientes), no solo `0xB4`, reutilizando `queryPendingFichadas`/`parseFichadaRecord` de producción — 3/3 corridas exitosas, mismos registros decodificados que con la secuencia completa (`experiments/probar-solo-handshake-con-a4.mjs`, research.md §6.6). 13/13 corridas exitosas en total entre los tres experimentos.
- [X] T036 [US1] Simplificar `src/protocol/client.js`: secuencia reducida (solo `0x80`) por defecto, con `fullHandshake`/`--full-handshake` para restaurar la secuencia completa de tres `0x13` sin tocar código si un equipo/firmware distinto lo requiere. FR-002, `contracts/cli-contract.md` y `tests/integration/client-session.integration.test.js` actualizados; ambos modos confirmados de punta a punta contra el equipo real (research.md §6.6)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias de usuario
- **User Story 1 (Phase 3)**: depende de Foundational — es el MVP, sin dependencias de otras historias
- **User Story 2 (Phase 4)**: depende de Foundational; reutiliza `FichadaRecord`/`json-exporter.js` de US1 pero es testeable de forma independiente sobre esa base
- **User Story 3 (Phase 5)**: depende de Foundational y de que exista el flujo de consulta de US1 (T009, T016) para poder verificar que `0xA8` nunca se invoca
- **Polish (Phase 6)**: depende de que las historias que se quieran pulir ya estén completas

### User Story Dependencies

- **US1 (P1)**: ninguna dependencia de otras historias — MVP autocontenido
- **US2 (P2)**: se apoya en las estructuras de datos creadas en US1 (T015, T017, T019) pero se prueba con su propio criterio independiente (T020)
- **US3 (P3)**: se apoya en el cliente y comandos de US1 (T009, T016) pero se prueba con su propio criterio independiente (T027)

### Within Each User Story

- Tests antes que implementación (deben fallar primero)
- `records.js`/modelo antes que `client.js`/servicio
- `client.js`/servicio antes que `cli/consultar-fichadas.js` (punto de entrada)
- Historia completa y con checkpoint validado antes de pasar a la siguiente prioridad

### Parallel Opportunities

- T001-T003 (Setup): T003 en paralelo con T001/T002 (archivos distintos)
- T004-T006 (tests Foundational): las tres en paralelo (archivos distintos, sin dependencias entre sí)
- T010 (logger) en paralelo con T007-T009 (archivos distintos)
- T013-T014 (tests US1): en paralelo entre sí
- T020 (test US2) en paralelo con T026
- T027 (test US3) en paralelo con T020/T026
- T029-T035 (Polish): todas en paralelo entre sí (archivos/alcances distintos)

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

## Parallel Example: Polish

```bash
# Lanzar juntos los tests/tareas de cierre pendientes:
Task: "Quickstart checklist formal"
Task: "Test de performance SC-001"
Task: "Test de FR-013 (dedup)"
Task: "Fixtures versionadas para lotes de legajo/hora"
Task: "Experimento 0x13 + 0xA4 real"
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

### Estado actual (2026-07-03)

MVP (US1) y US2 están funcionalmente completas y validadas contra
hardware real, incluida la simplificación de la apertura de sesión (T036)
con su flag de compatibilidad y la relajación del gate de minuto (T025).
Quedan pendientes, todas de bajo riesgo para lo ya entregado: el test
dedicado de no-borrado (T027), calibración adicional de hora (T026), y
los ítems de Polish (T029, T031-T034) encontrados en la auditoría de
`/speckit-analyze`.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- [Story] mapea cada tarea a su historia de usuario para trazabilidad
- Verificar que los tests fallen antes de implementar (Constitución Principio IV) — para las tareas nuevas (T025-T035) sigue aplicando
- FR-014 (discrepancia `0xB4` vs `0xA4`) se implementa en T016 con el comportamiento interino documentado en research.md §5 — no inventar lógica de reconciliación adicional
- FR-002 exige la secuencia completa de tres `0x13`; la validación técnica de que una secuencia reducida funciona ya está completa (T035) — reducirla en producción es ahora una decisión de diseño pendiente (T036), no una validación pendiente
- Ningún archivo fuera de `src/protocol/` debe construir o interpretar bytes crudos del protocolo (Constitución Principio III; ver contracts/protocol-contract.md)
- Detenerse en cada checkpoint para validar la historia de forma independiente antes de continuar
