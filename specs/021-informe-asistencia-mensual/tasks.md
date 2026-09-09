---
description: "Task list — Informe de Asistencia Mensual desde el Calendario"
---

# Tasks: Informe de Asistencia Mensual desde el Calendario

**Input**: Design documents from `specs/021-informe-asistencia-mensual/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/web-api.md](./contracts/web-api.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — the plan and the constitution (Principle IV) call for
contract tests on the API flow; component tests cover the Calendario UI. Write
each test task before its implementation task and confirm it fails first.

**Organization**: tasks grouped by user story. This feature reuses the
feature-018 informe-cierre domain/service/storage almost entirely; most work is
handler acceptance of the `Mes` tramo, wiring the UI, and tests that pin the
unification and gating behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `US1` / `US2` / `US3` for user-story phases only

## Path Conventions

Web app: backend at `src/` (`src/web/api`, `src/presentismo`), frontend at
`frontend/src/`, backend tests at `tests/` (`node --test`), frontend tests
alongside components (`vitest`).

---

## Phase 1: Setup

**Purpose**: baseline before touching shared modules

- [X] T001 Run the baseline suites and confirm green before any change: `node --test tests/contract/web-api-informe-cierre.test.js` and `cd frontend; npx vitest run src/components/PaginaCalendario.test.jsx src/components/AccionInformeCierre.test.jsx`. Note in a scratch file which helper builds a QUINCENAL entorno (`crearEntornoFichadasHoy({ …, envExtra: { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' } })`, see `tests/contract/web-api-resumen-periodo.test.js:164`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: make the `/informe-cierre` endpoints accept the `Mes` tramo in
**both** installation modes. Blocks every user story (all hit the endpoint).

**⚠️ CRITICAL**: no user story work starts until Phase 2 is complete.

- [X] T002 [P] Add failing contract tests for `tramo=Mes` acceptance in `tests/contract/web-api-informe-cierre.test.js` (cases 10, 11, 16, 17 of [contracts/web-api.md](./contracts/web-api.md)): (a) QUINCENAL + closed period, `POST …/informe-cierre?tramo=Mes` → `200` with `sello.tramo === 'Mes'` and `periodoId` without `-Q` suffix; (b) `GET …?tramo=Mes` after that `POST` → `200`; (c) `POST …?tramo=Xx` (value not in `{Q1,Q2,Mes}`) → `400 PERIODO_INVALIDO`; (d) MENSUAL: `GET …?tramo=Mes` returns the same body as `GET …/informe-cierre` with no `tramo`.
- [X] T003 Update `tramosParaEmitir(modo, tramoQuery)` and `tramoParaLeer(modo, tramoQuery)` in `src/web/api/informe-cierre-handlers.js` so `'Mes'` is a valid `?tramo` value in both `MENSUAL` and `QUINCENAL` (maps to storage tramo `'Mes'`; in `MENSUAL`, `?tramo=Mes` and omitted are equivalent; in `QUINCENAL`, omitted still means `['Q1','Q2']`, not `Mes`). Make T002 pass. Keep the existing `400` for any other explicit tramo.

**Checkpoint**: the monthly report can be emitted and read via the API in any mode.

---

## Phase 3: User Story 1 — Ver y descargar el informe mensual desde el Calendario (Priority: P1) 🎯 MVP

**Goal**: on the Calendario page, when the shown month's period is closed, an
admin can view on-screen and download the monthly attendance report (same
format as feature 018), covering the full calendar month.

**Independent Test**: close a month's period; on the Calendario page for that
month, "Ver informe" opens the report (sello + resumen por empleado del mes +
detalle + pendientes) and "Descargar PDF" produces the same document.

### Tests for User Story 1

- [X] T004 [P] [US1] Contract tests in `tests/contract/web-api-informe-cierre.test.js` (cases 13, 14, 15): (a) closing a QUINCENAL period writes `Q1`, `Q2` **and** `Mes` — `GET` for the three tramos all return `200`; (b) `POST …?tramo=Mes` with header `X-Apex-Rol: lector` → `403 ACCESO_DENEGADO`; (c) `POST …?tramo=Mes` on an open period → `409 PERIODO_ABIERTO`.
- [X] T005 [P] [US1] Frontend test in `frontend/src/components/AccionInformeCierre.test.jsx`: rendered with the new `mensual` prop + `cerrado` and a stub client, it calls `cliente.obtenerMensual(periodoMes)` on mount, shows "Ver informe" and "Descargar PDF", and "Ver informe" opens `InformeCierrePrintable`.
- [X] T006 [P] [US1] Frontend test in `frontend/src/components/PaginaCalendario.test.jsx`: when the calendar view has `cerrado: true`, the monthly-report action renders inside the `.calendario` section; wiring passes `periodo` as `YYYYMM` and `mensual`. Use a stub informe client.

### Implementation for User Story 1

- [X] T007 [US1] In `src/web/api/calendario-handlers.js`, extend `emitirInformesDelCierre(ctx, periodoMes, autor)`: when `modo === 'QUINCENAL'`, emit tramos `['Q1', 'Q2', 'Mes']` (MENSUAL stays `['Mes']`). Keep it best-effort (a failure logs `informe_cierre_emision_fallida` and does not revert the close). Makes T004(a) pass.
- [X] T008 [P] [US1] In `frontend/src/api/informe-cierre-client.js`, add `obtenerMensual(periodoMes)` and `emitirMensual(periodoMes)` that call `/calendarios/<YYYYMM>/informe-cierre?tramo=Mes` (GET / POST). Leave `obtener` / `emitir` unchanged.
- [X] T009 [US1] In `frontend/src/components/AccionInformeCierre.jsx`, add a `mensual` (boolean) prop: when set, treat `periodo` as `YYYYMM` and use `cliente.obtenerMensual` / `cliente.emitirMensual` instead of `obtener` / `emitir`; the "Resumen del Período" usage (prop absent) is unchanged. Reuse `InformeCierrePrintable`, `InformeCierreContenido` and `descargarInformePdf` as-is. Makes T005 pass.
- [X] T010 [US1] In `frontend/src/components/PaginaCalendario.jsx`, import `AccionInformeCierre` and `crearClienteInformeCierre`; inside the `estado.tipo === 'con-datos' && estado.vista.cerrado` branch (next to the "Período cerrado" indicator) render `<AccionInformeCierre key={periodoMostrado} periodo={periodoMostrado} cerrado mensual />`. Makes T006 pass.

**Checkpoint**: US1 fully functional — MVP. View + download the monthly report from the Calendario page for any closed month.

---

## Phase 4: User Story 2 — El informe mensual unifica las quincenas (Priority: P2)

**Goal**: in a QUINCENAL installation the monthly report covers days 1–end for
every employee, and every per-employee figure equals the sum of that
employee's Q1 + Q2 figures for the same closed month.

**Independent Test**: for a closed QUINCENAL period, emit Q1, Q2 and Mes; for
each legajo, `Mes` hours and each counter equal `Q1 + Q2`; in a MENSUAL
installation the `Mes` report equals what "Resumen del Período" shows.

### Tests for User Story 2

- [X] T011 [P] [US2] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 12): closed QUINCENAL period with fichadas across both halves; emit `Q1`, `Q2`, `Mes`; assert for each legajo that `resumenMes.fila.horasTrabajadas === resumenQ1.fila.horasTrabajadas + resumenQ2.fila.horasTrabajadas`, and likewise for `ausencias`, `llegadasTarde`, `retirosAnticipados`, `completas`, `incompletas`.
- [X] T012 [P] [US2] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 18): for the `Mes` tramo, `Σ resumen.filas[].horasTrabajadas === resumen.encabezado.totalHoras`, and each `detalle.secciones[].subtotalHoras` equals the resumen fila of the same legajo (cuadre SC-002/SC-003). Also assert `detalle` days span day 1..end-of-month.

### Implementation for User Story 2

- [X] T013 [US2] Confirm no domain/service change is needed: `emitirInformeCierre({ tramo: 'Mes' })` calls `calcularResumenPeriodo(periodoMes, legajos, hasta, { tramo: null })`, which concatenates the full month's jornadas (= Q1 ∪ Q2). If T011/T012 reveal a gap, fix it in `src/presentismo/domain/informe-cierre.js` or `src/presentismo/service/calcular-presentismo-service.js` (expected: none). Record the outcome in `specs/021-informe-asistencia-mensual/research.md` §1.

**Checkpoint**: US1 + US2 both verifiable — the monthly report is a faithful union of the quincenas.

---

## Phase 5: User Story 3 — La acción sólo está disponible con el período cerrado (Priority: P3)

**Goal**: the view/download action appears on the Calendario page only when the
shown month's period is closed; reopening a month marks its saved monthly
report as outdated.

**Independent Test**: on a month that is not closed (or has no calendar), the
action is absent; after closing, it appears; after reopening, the monthly
report shows the "desactualizado" notice.

### Tests for User Story 3

- [X] T014 [P] [US3] Frontend test in `frontend/src/components/PaginaCalendario.test.jsx`: the monthly-report action is NOT rendered when the view has `cerrado: false`, nor in the `vacio-mes` state, nor in the `vacio-global` state.
- [X] T015 [P] [US3] Frontend test in `frontend/src/components/AccionInformeCierre.test.jsx`: with `mensual` + `cerrado` and `obtenerMensual` resolving a copy with `obsoleto: true`, the "desactualizado" alert renders; with `cerrado={false}` it renders the nota and no action buttons.
- [X] T016 [P] [US3] Contract test in `tests/contract/web-api-informe-cierre.test.js`: after closing a QUINCENAL period and then `POST …/reabrir`, `GET …/informe-cierre?tramo=Mes` returns `obsoleto: true` (alongside `Q1`/`Q2`); closing again returns `obsoleto: false`.

### Implementation for User Story 3

- [X] T017 [US3] In `frontend/src/components/PaginaCalendario.jsx`, ensure the `AccionInformeCierre` mount from T010 is strictly inside `estado.tipo === 'con-datos' && estado.vista.cerrado` and nowhere else (no render in `vacio-mes` / `vacio-global` / open period). Makes T014 pass.
- [X] T018 [US3] Confirm `reabrirPeriodoMes` in `src/presentismo/service/calcular-presentismo-service.js` marks the `Mes` entry `obsoleto` through its existing "iterate every tramo of the informe map" loop (expected: no code change). If it skips `Mes`, adjust the loop. Makes T016 pass.

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Update `docs/presentismo.md`: document that closing a QUINCENAL period now also produces a unified monthly report and that it is reachable from the Calendario page (`?tramo=Mes` on the informe-cierre endpoints).
- [X] T020 [P] Run the full backend suite `node --test` and the full frontend suite `cd frontend; npx vitest run`; fix any regression in feature-018 tests caused by the extra `Mes` tramo at close.
- [X] T021 Execute `specs/021-informe-asistencia-mensual/quickstart.md` §1 (automated) and §2 (API by curl, QUINCENAL) and confirm every listed expectation.
- [ ] T022 Manual UI pass per `quickstart.md` §3: navigate to a non-closed month (no action) → close (rol editor) → "Ver informe" → "Descargar PDF" → reabrir → "desactualizado" notice → month without calendar (no action).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. **Blocks Phases 3–5** (every story calls the endpoint).
- **US1 (Phase 3)**: after Phase 2. Delivers the MVP.
- **US2 (Phase 4)**: after Phase 2. Independent of US1 (pure API verification); in practice run after US1 since it reuses the same close-time emission and QUINCENAL fixtures.
- **US3 (Phase 5)**: after Phase 2. Shares the `PaginaCalendario` mount with US1 (T017 refines T010); do US1 first.
- **Polish (Phase 6)**: after all desired stories.

### Within each story

- Test tasks (T002/T004/T005/T006/T011/T012/T014/T015/T016) before their implementation tasks; confirm they fail first.
- Backend before frontend where the frontend stubs the client (T005/T006 stub, so they can precede T007).

### Parallel opportunities

- T002 runs alone (Phase 2 has one impl task after it).
- US1: T004, T005, T006 in parallel (different files). Then T007 (backend) and T008 (client) in parallel; T009 after T005/T008; T010 after T006/T009.
- US2: T011, T012 in parallel.
- US3: T014, T015, T016 in parallel.
- Phase 6: T019, T020 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files, no deps):
Task: "T004 contract tests for close-writes-3-tramos / lector 403 / open 409 in tests/contract/web-api-informe-cierre.test.js"
Task: "T005 AccionInformeCierre mensual-prop test in frontend/src/components/AccionInformeCierre.test.jsx"
Task: "T006 PaginaCalendario closed-period action test in frontend/src/components/PaginaCalendario.test.jsx"

# Then implementation, backend + client in parallel:
Task: "T007 emit ['Q1','Q2','Mes'] at close in src/web/api/calendario-handlers.js"
Task: "T008 obtenerMensual/emitirMensual in frontend/src/api/informe-cierre-client.js"
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (endpoint accepts `Mes`) → 3. Phase 3 US1 → 4. **STOP and validate**: close a month, view + download the monthly report from the Calendario page → 5. demo.

### Incremental delivery

1. Setup + Foundational → endpoint ready.
2. US1 → view/download from Calendario → demo (MVP).
3. US2 → contract tests pin `Mes == Q1 + Q2` and the cuadres → demo.
4. US3 → gating + obsolete-on-reopen tests green → demo.
5. Polish → docs, full suites, quickstart.
