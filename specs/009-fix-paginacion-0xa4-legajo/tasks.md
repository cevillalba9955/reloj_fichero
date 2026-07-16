# Tasks: Corrección de la paginación por bytes del 0xA4 y del ancho del legajo

**Feature**: `009-fix-paginacion-0xa4-legajo` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Test policy**: TDD obligatorio en la capa de protocolo (Constitución, Principio IV —
NON-NEGOTIABLE). Cada tarea de implementación va precedida por su test en rojo.

**Convención de rutas**: single project; driver aislado en `src/protocol/`, tests en `tests/`.

**Nota de documentación retroactiva**: ambas correcciones ya estaban implementadas y
verificadas de punta a punta (305/305 tests, CLI real contra `192.168.1.78` con 173
fichadas) antes de generar este `tasks.md` — se documenta el trabajo tal como se hizo, todas
las tareas quedan marcadas `[X]`.

---

## Phase 1: Setup

- [X] T001 Verificar que las capturas nuevas `research/fichada_2.pcapng` y
  `research/fichada_3.pcapng` están trackeadas en git (Constitución III).
- [X] T002 Extraer con `tshark` (`follow,tcp,raw`) el stream TCP 43 de
  `research/fichada_2.pcapng` (sesión completa: handshake + `0x13`x3 + `0xB4` + 4 páginas de
  `0xA4` + `0x81`) para analizar la paginación real byte a byte.
- [X] T003 [P] Extraer con `tshark` el stream TCP 19 de `research/fichada_3.pcapng` (mismo
  lote de 173, `ID DISPOSITIVO=255` en equipo y software) para confirmar que la paginación y
  los bloques de cierre no dependen del `ID DISPOSITIVO`.

---

## Phase 2: Foundational (prerequisito de ambas historias de paginación)

**Propósito**: reemplazar la constante de paginación por la fórmula correcta antes de tocar
el driver de sesión.

- [X] T004 Reemplazar `MAX_RECORDS_PER_PAGE=51` por `MAX_PAGE_BYTES=1024` en
  `src/protocol/commands.js`, documentando la evidencia de `research/fichada_2.pcapng`/
  `fichada_3.pcapng` en el comentario. (FR-001)

**Checkpoint**: constante disponible para el cálculo de `byteLen` por bytes en `client.js`.

---

## Phase 3: User Story 1 — Descarga íntegra de lotes de 4+ páginas (P1) 🎯 MVP

**Goal**: que un lote real de 173 fichadas (4 páginas) se descargue completo sin error de
payload inesperado.

**Independent Test**: replay del fixture de 173 fichadas por un servidor de loopback →
173 fichadas válidas, sin error FR-010.

- [X] T005 [P] [US1] Generar el fixture de contrato
  `tests/contract/fixtures/ciento-setenta-y-tres-pendientes-paginado.json` a partir del
  stream 43 de `research/fichada_2.pcapng` (comandos y respuestas reales de las 4 páginas,
  normalizando el byte `ID DISPOSITIVO` del ACK a `01` para consistencia con el resto de los
  fixtures). (FR-010)
- [X] T006 [US1] Escribir el test de integración en rojo
  `tests/integration/query-pending-fichadas.integration.test.js` ("173 fichadas pendientes
  pagina 0xA4 en 4 llamadas por bytes"): reproducir los 4 comandos/respuestas reales del
  fixture contra `queryPendingFichadas`; afirmar 173 registros, sin error de payload, y que
  el registro partido en la frontera de página (índice 51) decodifica legajo/fecha correctos.
  (SC-001, FR-004)
- [X] T007 [US1] Reescribir el cálculo de `byteLen` por página en `queryPendingFichadas`
  (`src/protocol/client.js`): `totalStreamBytes = declaredPendingCount*RECORD_SIZE`,
  `byteLen = min(totalStreamBytes - deliveredBytes, MAX_PAGE_BYTES)`, eliminando los
  conceptos de `pageCount`/`hasMorePages`/`carrySize` del modelo anterior. (FR-001, FR-002)
- [X] T008 [US1] Ajustar el log de `command_sent` para reportar `byteLen`/`restantes` en vez
  de `pageCount`, manteniendo el logging estructurado existente (Principio V). (FR-001)
- [X] T009 [US1] Poner en verde T006 y confirmar que el stream reconstruido mide
  `declaredPendingCount*20` y encuadra exactamente 173 fichadas. (SC-001)

**Checkpoint**: US1 verde de punta a punta — el defecto reportado (sesión fallida con 173
pendientes) queda resuelto (MVP entregable).

---

## Phase 4: User Story 2 — Comando de paginación alineado al equipo real (P1)

**Goal**: los 4 comandos `0xA4` generados == los del software oficial, byte a byte, en su
campo `byteLen`.

**Independent Test**: el test de integración de T006 ya compara byte a byte los comandos
enviados contra los 4 comandos reales del fixture (`assert.deepEqual` en el servidor
guionado); no hace falta un test de contrato adicional.

- [X] T010 [US2] Confirmar, dentro de T006, que los `byteLen` generados para las 4 páginas
  del lote de 173 coinciden exactamente con los del fixture: `1024/1024/1024/388`. (SC-002)
- [X] T011 [US2] Confirmar que los comandos de 1 a 3 páginas (fixtures existentes de la
  feature 006: `cincuenta-tres-pendientes-paginado.json`) no cambian de bytes tras el
  refactor de T007. (SC-003)

**Checkpoint**: comandos verificados contra ground truth de dos capturas independientes.

---

## Phase 5: User Story 3 — El legajo no fabrica dígitos sin evidencia (P2)

**Goal**: `legajo` se decodifica con los 2 bytes confirmados; bytes altos ≠ 0 → `legajo: null`.

**Independent Test**: registro sintético con bytes altos de legajo ≠ `00 00` → `legajo: null`,
resto del registro decodifica igual.

- [X] T012 [P] [US3] Escribir el test de contrato en rojo
  `tests/contract/records.contract.test.js` ("parseFichadaRecord reporta legajo null si los
  bytes 2-3 del campo no son 00 00"): tomar el fixture real de legajo 9999, alterar el byte 2
  del campo, y afirmar `legajo === null` con el resto del registro (fecha, anomaly) sin
  cambios. (FR-007, SC-005)
- [X] T013 [US3] Cambiar `parseFichadaRecord` en `src/protocol/records.js`:
  `legajo = (bytes[2..3] === 0x0000) ? readUInt16LE(0) : null`, documentando la evidencia
  (bytes altos siempre `00 00` en toda captura real) en el comentario. (FR-006, FR-007, FR-008)
- [X] T014 [US3] Poner en verde T012 y confirmar que el fixture
  `tests/contract/fixtures/legajo-multibyte-9999.json` (legajo de prueba 9999) sigue
  decodificando igual, actualizando su nota a "2 bytes" en vez de "4 bytes". (SC-004, FR-009)
- [X] T015 [US3] Acotar `legajo` a `0..65535` (antes `0..4294967295`) y actualizar su
  descripción en `specs/001-consulta-fichadas-rs596/contracts/output-schema.json`, alineado
  con el nuevo ancho confirmado. (FR-006)

**Checkpoint**: legajo con ancho auditable; ningún caso real ya visto cambia de valor.

---

## Phase 6: Polish & Cross-Cutting

- [X] T016 [P] Actualizar `research/protocolo_prosoft_rs596.md` con las secciones §5.19
  (paginación por bytes, evidencia de `fichada_2.pcapng`) y §5.20 (`ID DISPOSITIVO` del
  comando, ancho real del legajo, evidencia de `fichada_3.pcapng`), incluyendo retractaciones
  explícitas de las interpretaciones previas de la feature 006/001 que quedaron superadas.
  (Constitución III/IV)
- [X] T017 [P] Actualizar el mock de `tests/integration/performance.integration.test.js`
  (`startReducedSessionServer`) al modelo de paginación por bytes, para que el smoke test de
  SC-001 de la feature 001 siga vigente con el nuevo cálculo de `byteLen`.
- [X] T018 [P] Corregir `tests/unit/json-exporter.test.js`: el registro de prueba usaba un
  encuadre sin el re-encuadre de legajo de la feature 001 (§5.9), lo que producía un
  `legajo` no numérico bajo la nueva guarda de plausibilidad; reemplazado por el registro
  real re-encuadrado de `research.md` §6.1 (legajo 1, Cesar Villalba).
- [X] T019 [P] Correr la suite completa `npm test` y confirmar cero regresiones
  (305/305 tests en verde, incluidas las 8 features previas). (SC-003, SC-004)
- [X] T020 Verificar contra el equipo real (`node src/cli/consultar-fichadas.js --host
  192.168.1.78`): 173 declaradas → 173 exportadas, mismos 4 `byteLen` y mismos 4 bloques de
  cierre que el software oficial, sin ningún `legajo` null inesperado (0 de 173). (SC-001,
  SC-002, SC-005)

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → antes de todo.
- **Foundational (T004)** → bloquea US1 (provee `MAX_PAGE_BYTES`).
- **US1 (T005–T009)** → MVP; depende de Foundational. Resuelve el defecto de paginación.
- **US2 (T010–T011)** → se verifica dentro de los mismos tests de US1 (comparten fixture);
  conceptualmente refuerza US1, sin tareas de código propias.
- **US3 (T012–T015)** → independiente de US1/US2 en código (toca `records.js`), puede ir en
  paralelo tras Setup.
- **Polish (T016–T020)** → al final, depende de US1/US2/US3 completas.

## Parallel Opportunities

- T002 y T003 en paralelo (dos capturas distintas).
- T005 (fixture de US1) y T012 (test de US3) en paralelo (archivos de test/fixture
  distintos).
- T016, T017, T018, T019 en paralelo (documentación / mocks / verificación, archivos
  distintos).

## Implementation Strategy

- **MVP = US1** (T001–T009): resuelve el defecto reportado (sesión fallida con 173
  pendientes) y es entregable por sí solo.
- Incremental: US2 confirma que el fix generaliza el contrato de comandos sin tareas nuevas;
  US3 es una corrección de integridad de datos independiente, con su propio ciclo
  test-primero. Ambas quedan verdes e independientemente testeables.

## Trazabilidad FR → Tasks

| FR | Tasks |
|----|-------|
| FR-001 | T004, T007, T008, T010 |
| FR-002 | T007 |
| FR-003 | T006 (verificado por el encuadre existente, sin tarea de código propia) |
| FR-004 | T006, T009, T011 |
| FR-005 | T009 (sin cambios respecto a feature 001/006, verificado por regresión) |
| FR-006 | T013, T015 |
| FR-007 | T012, T013 |
| FR-008 | T013 |
| FR-009 | T014 |
| FR-010 | T001, T005 |
| FR-011 (fuera de alcance) | — (verificado por revisión: no se toca 0xA8 ni presentismo) |
