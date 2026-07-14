# Tasks: Corrección de la paginación del detalle de fichadas (0xA4)

**Feature**: `006-fix-paginacion-fichadas` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Test policy**: TDD obligatorio en la capa de protocolo (Constitución, Principio IV —
NON-NEGOTIABLE). Cada tarea de implementación va precedida por su test en rojo.

**Convención de rutas**: single project; driver aislado en `src/protocol/`, tests en `tests/`.

---

## Phase 1: Setup

- [ ] T001 Verificar el fixture de tráfico versionado `tests/fixtures/fichada-3paginas/stream10.json` y su `README.md` (derivados de `research/fichada.pcapng`); confirmar que `research/fichada.pcapng` sigue trackeado en git (Constitución III).
- [ ] T002 [P] Agregar un helper de test `tests/helpers/fake-socket.js` (EventEmitter que emula `node:net` Socket: `write`, `on('data')`, `on('close')`, `destroy`) para reproducir respuestas del equipo desde el fixture, si no existe uno reutilizable en `tests/helpers/`.
- [ ] T003 [P] Agregar un helper `tests/helpers/stream10-fixture.js` que cargue `stream10.json` y exponga: comandos `0xA4` esperados por página y el guion de respuestas del equipo (ACK + `55AA` + payload) para alimentar el fake socket.

---

## Phase 2: Foundational (prerequisito de todas las historias)

**Propósito**: dejar el andamiaje de decodificación por invariante disponible para las 3 historias.

- [ ] T004 [US-shared] Escribir test unitario en rojo `tests/unit/encuadre-sincronizante.test.js` para una función pura de encuadre `frameRecords(buffer)` que trocee por invariante estructural (`recordType==00000001` + fecha/hora válida) y devuelva registros de 20 bytes, ignorando bytes de frontera. (FR-006, FR-010)
- [ ] T005 [US-shared] Implementar `frameRecords(buffer)` y `looksLikeRecordStart(buffer, offset)` en `src/protocol/records.js`, reutilizando `decodeFechaHora`/`looksValid` existentes; exportar sin romper la API actual de `parseFichadaRecord`. (FR-006, FR-010)
- [ ] T006 [US-shared] Escribir test unitario en rojo para `dedupeFichadas(records)` (clave `(legajo,fecha,hora,metodo)`, preserva orden de primera aparición) en `tests/unit/encuadre-sincronizante.test.js`. (FR-007)
- [ ] T007 [US-shared] Implementar `dedupeFichadas(records)` en `src/protocol/records.js` y ponerlo en verde. (FR-007)

**Checkpoint**: encuadre + dedup verdes y aislados, sin tocar todavía el flujo de sesión.

---

## Phase 3: User Story 1 — Descarga íntegra de lotes de 3+ páginas (P1) 🎯 MVP

**Goal**: que un lote de 123 fichadas (3 páginas) decodifique 122 únicas correctas, cero
corruptas, cero duplicadas.

**Independent Test**: replay de `stream10.json` por el fake socket → 122 fichadas válidas
idénticas a las del software oficial, `overlapCount==1`.

- [ ] T008 [P] [US1] Escribir test de integración en rojo `tests/integration/paginacion-3-paginas.integration.test.js`: correr `runQuerySession` (o `queryPendingFichadas`) contra el fake socket alimentado por el fixture; afirmar 122 registros únicos, todos con `fecha/hora/legajo/metodo` no nulos y `recordType==00000001`. (SC-001)
- [ ] T009 [US1] Corregir la fórmula de `byteLen` en `queryPendingFichadas` (`src/protocol/client.js`): `pageCount*20+4` si `hasMorePages`, `pageCount*20-8` en la última; leer `byteLen+4` de payload por página. (FR-001, FR-002, FR-003)
- [ ] T010 [US1] Corregir el arrastre entre continuaciones en `src/protocol/client.js`: 4 bytes inicial→1ª continuación, 8 bytes continuación→continuación, con el registro reenviado marcado para descarte. (FR-004, FR-005)
- [ ] T011 [US1] Reemplazar el troceo posicional del payload por `frameRecords` + `dedupeFichadas` al ensamblar `rawRecords` en `src/protocol/client.js`; mapear a `parseFichadaRecord`. (FR-005, FR-006, FR-007)
- [ ] T012 [US1] Poner en verde T008 y verificar la igualdad uno-a-uno contra los registros esperados del fixture (agregar el set esperado como dato del test). (SC-002)

**Checkpoint**: US1 verde de punta a punta — el defecto reportado queda resuelto (MVP entregable).

---

## Phase 4: User Story 2 — Comando de paginación idéntico al oficial (P1)

**Goal**: los tres comandos `0xA4` generados == los del software oficial, byte a byte.

**Independent Test**: comparar comandos generados vs. `stream10.json`, campo por campo.

- [ ] T013 [P] [US2] Escribir test de contrato en rojo `tests/contract/pagination-0xA4.contract.test.js`: para el lote de 123, afirmar que `buildPendingDetailCommand`/`buildPendingDetailContinuationCommand` producen `byteLen` = 1024/1024/412 y `count` = 0x7B / 1<<16 / 2<<16, comparando con los bytes del fixture. (SC-003, FR-001, FR-002)
- [ ] T014 [US2] Ajustar `buildPendingDetailContinuationCommand` y/o el cálculo de `byteLen` en `src/protocol/commands.js` para que el valor provenga de la fórmula (no de `bytesNecesarios-4`), y documentar la fórmula con referencia a `research/fichada.pcapng`. (FR-001, FR-002)
- [ ] T015 [US2] Poner en verde T013 y confirmar que los comandos de 1 y 2 páginas no cambian respecto de las capturas previas. (SC-003, SC-004)

**Checkpoint**: comandos verificados contra ground truth.

---

## Phase 5: User Story 3 — Robustez ante 4+ páginas sin captura (P2)

**Goal**: el encuadre por invariante + dedup produce los únicos correctos aunque el arrastre
exacto varíe, sin captura oficial.

**Independent Test**: flujo sintético de ≥4 páginas con solapamientos → únicos esperados.

- [ ] T016 [P] [US3] Escribir test unitario en rojo en `tests/unit/encuadre-sincronizante.test.js`: construir un flujo sintético de 4+ páginas con registros solapados y bloques de cierre insertados; afirmar que `frameRecords`+`dedupeFichadas` devuelven exactamente los únicos esperados. (SC-005, FR-006, FR-007)
- [ ] T017 [US3] Implementar el manejo de discrepancia `declaredPendingCount` vs. únicos en `src/protocol/client.js`: calcular `overlapCount`, loguearlo de forma estructurada (Principio V) y NO abortar cuando es ≥0 por solapamiento. (FR-009)
- [ ] T018 [US3] Test en rojo→verde para el caso "bytes que no encuadran" → `RespuestaInesperadaError` explícito en lugar de exportar basura, en `tests/unit/encuadre-sincronizante.test.js`. (FR-010)

**Checkpoint**: robustez más allá de los casos con captura.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T019 [P] Actualizar la documentación del protocolo en el módulo adaptador (comentarios de `client.js`/`commands.js` y, si existe, el changelog del adaptador) con la fórmula de `byteLen`, el arrastre y la evidencia de `research/fichada.pcapng`. (Constitución III/IV)
- [ ] T020 [P] Correr la suite completa `npm test` y confirmar cero regresiones en framing/records/client-session/query-pending-fichadas. (SC-004)
- [ ] T021 [P] Verificar la sesión real de referencia: reprocesar `output/fichadas-192.168.1.78-2026-07-14T10_57_04.272Z.json` o su fixture y confirmar 0 registros corruptos (contra los 21 previos). (SC-001)
- [ ] T022 Actualizar `specs/006-fix-paginacion-fichadas/quickstart.md` con cualquier ajuste de comandos/salidas surgido durante la implementación.

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → antes de todo.
- **Foundational (T004–T007)** → bloquea US1 y US3 (proveen `frameRecords`/`dedupeFichadas`).
- **US1 (T008–T012)** → MVP; depende de Foundational. Entrega el fix del defecto.
- **US2 (T013–T015)** → independiente de US1 en código (toca `commands.js`), puede ir en
  paralelo tras Setup; conceptualmente refuerza US1.
- **US3 (T016–T018)** → depende de Foundational; se apoya en US1 para el manejo de sesión.
- **Polish (T019–T022)** → al final.

## Parallel Opportunities

- T002 y T003 en paralelo (archivos distintos).
- T008 (test US1) y T013 (test US2) en paralelo (archivos de test distintos).
- T019, T020, T021 en paralelo (documentación / verificación).

## Implementation Strategy

- **MVP = US1** (T001–T012): resuelve el defecto reportado y es entregable por sí solo.
- Incremental: US2 blinda contra regresión de comandos; US3 cierra la clase de bugs para 4+
  páginas. Cada historia es verde e independientemente testeable.

## Trazabilidad FR → Tasks

| FR | Tasks |
|----|-------|
| FR-001/002 | T009, T013, T014 |
| FR-003 | T009 |
| FR-004/005 | T010, T011 |
| FR-006 | T004, T005, T011, T016 |
| FR-007 | T006, T007, T011, T016 |
| FR-008 (no-regresión) | T015, T020 |
| FR-009 | T017 |
| FR-010 | T004, T005, T018 |
| FR-011 | T001, T003 |
| FR-012 (fuera de alcance) | — (verificado por revisión: no se toca 0xA8) |
