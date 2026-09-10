---
description: "Task list — Informe de la Primera Quincena antes del Cierre del Mes"
---

# Tasks: Informe de la Primera Quincena antes del Cierre del Mes

**Input**: Design documents from `specs/022-informe-primera-quincena-anticipado/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/web-api.md](./contracts/web-api.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — the plan and the constitution (Principle IV) call for
contract tests on the API flow; a domain unit test pins the new
`primeraQuincenaTerminada` helper; component tests cover the "Resumen del
Período" UI. Write each test task before its implementation task and confirm it
fails first.

**Organization**: tasks grouped by user story. This feature reuses the
feature-018 `informe-cierre` domain/service/storage almost entirely; the real
work is a scoped exception to the "período cerrado" gate for `?tramo=Q1` on an
open QUINCENAL period, a `sello.anticipado` flag, a UI availability flag, and
tests that pin the window and the replace-on-close behaviour.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `US1` / `US2` / `US3` for user-story phases only

## Path Conventions

Web app: backend at `src/` (`src/web/api`, `src/presentismo`, `src/web/view-model.js`),
frontend at `frontend/src/`, backend tests at `tests/` (`node --test`:
`tests/contract`, `tests/unit`, `tests/integration`), frontend tests alongside
components (`vitest`).

---

## Phase 1: Setup

**Purpose**: baseline before touching shared modules

- [ ] T001 Run the baseline suites and confirm green before any change: `node --test tests/contract/web-api-informe-cierre.test.js tests/unit/presentismo-periodo-liquidacion.test.js tests/unit/presentismo-informe-cierre.test.js` and `cd frontend; npx vitest run src/components/AccionInformeCierre.test.jsx src/components/PaginaResumenPeriodo.test.jsx src/components/InformeCierrePrintable.test.jsx`. In a scratch file, note (a) the helper that builds a QUINCENAL entorno (`crearEntorno…({ envExtra: { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' } })`, see `tests/contract/web-api-resumen-periodo.test.js`), and (b) how existing tests fix "hoy" (`hoyLocal` / injected `hoy`) so the "Q1 ya terminó" window can be controlled deterministically.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the domain helper + the handler exception that lets `?tramo=Q1` be
emitted on an **open** QUINCENAL period inside the anticipated window, carrying a
`sello.anticipado` flag. Blocks every user story (all hit this path).

**⚠️ CRITICAL**: no user story work starts until Phase 2 is complete.

- [X] T002 [P] Add failing unit test for the pure helper in `tests/unit/presentismo-periodo-liquidacion.test.js` (case 31 of [contracts/web-api.md](./contracts/web-api.md)): `primeraQuincenaTerminada('202609', '2026-09-15') === false`; `('202609', '2026-09-16') === true`; `('202609', '2026-10-01') === true`; `('202610', '2026-09-30') === false`.
- [X] T003 [P] Add failing unit test for `sello.anticipado` in `tests/unit/presentismo-informe-cierre.test.js`: `construirInformeCierre({ …, anticipado: true })` puts `anticipado: true` in `sello`; omitting the argument yields `sello.anticipado === false` (no other field changes).
- [X] T004 [P] Add failing contract tests for the happy anticipated path in `tests/contract/web-api-informe-cierre.test.js` (cases 19–20): QUINCENAL, period **open**, first fortnight already elapsed → `POST /api/calendarios/:periodo/informe-cierre?tramo=Q1` with `X-Apex-Rol: editor` → `200` with `sello.tramo === 'Q1'`, `sello.anticipado === true`, `sello.modo === 'manual'`, `periodoId === '<YYYYMM>-Q1'`, populated `resumen.filas` and `detalle.secciones` (days 1–15), `pendientes`; then `GET …?tramo=Q1` → `200` with `sello.anticipado === true`, `obsoleto === false`.
- [X] T005 [P] Implement `primeraQuincenaTerminada(periodoMes, hoy)` in `src/presentismo/domain/periodo-liquidacion.js` (pure: `hoy` month after `periodoMes` month → `true`; same month and `Number(hoy.slice(8,10)) > 15` → `true`; else `false`). Export it. Makes T002 pass.
- [X] T006 [P] Add an optional `anticipado` parameter to `construirInformeCierre({ …, anticipado = false })` in `src/presentismo/domain/informe-cierre.js` and include it in the `sello` object (`sello = { …, anticipado }`). No calculation change. Makes T003 pass.
- [X] T007 Thread `anticipado` through the service in `src/presentismo/service/calcular-presentismo-service.js`: `emitirInformeCierre({ …, anticipado = false })` passes `anticipado` into `construirInformeCierre(...)`, and adds `anticipado` to the `logger.evento('informe_cierre_emitido', { … })` payload. The persisted `entrada` already carries it inside `informe.sello`.
- [X] T008 Rework the `POST /api/calendarios/:periodo/informe-cierre` gate in `src/web/api/informe-cierre-handlers.js`: (1) import `hoyLocal` (from `../view-model.js`) and `primeraQuincenaTerminada` (from `../../presentismo/domain/periodo-liquidacion.js`); (2) load the calendar first (404 `CALENDARIO_NO_GENERADO` if missing); (3) `const esAnticipadoQ1 = modo === 'QUINCENAL' && query.tramo === 'Q1' && calendario.cerrado !== true`; (4) if `esAnticipadoQ1` and `!primeraQuincenaTerminada(periodoMes, hoyLocal())` → `throw new ApiError(409, 'QUINCENA_EN_CURSO', …)`; (5) else if `calendario.cerrado !== true` → keep today's `409 PERIODO_ABIERTO`; (6) pass `anticipado: esAnticipadoQ1` into `servicio.emitirInformeCierre({ … })`. `tramosParaEmitir('QUINCENAL','Q1')` already returns `['Q1']` — do not change it. Makes T004 pass.

**Checkpoint**: the primera-quincena report can be emitted and re-read via the API on an open QUINCENAL period once day 15 has passed, and it is flagged `anticipado`.

---

## Phase 3: User Story 1 — Emitir el informe de la primera quincena sin esperar al cierre del mes (Priority: P1) 🎯 MVP

**Goal**: in a QUINCENAL installation, from "Resumen del Período" on a Q1 of an
open month whose first fortnight has ended, an admin manually emits and then
views/downloads the primera-quincena report (same format as feature 018),
scoped to days 1–15, with figures matching "Resumen del Período".

**Independent Test**: with a QUINCENAL open month (Q1 elapsed) that has fichadas
/ correcciones on days 1–15, open "Resumen del Período" on `YYYYMM-Q1`, use
"Emitir informe de la primera quincena", and verify the report can be viewed and
downloaded and that every per-employee figure equals what "Resumen del Período"
shows for that Q1.

### Tests for User Story 1

- [X] T009 [P] [US1] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 26): QUINCENAL open month, Q1 elapsed; emit the anticipated Q1 report; for each legajo assert `informeQ1.resumen.fila[c] === (GET /api/resumen-periodo?periodo=<YYYYMM>-Q1).fila[c]` for `c ∈ {horasTrabajadas, completas, incompletas, ausencias, llegadasTarde, retirosAnticipados}`; assert `Σ informeQ1.resumen.filas[].horasTrabajadas === informeQ1.resumen.encabezado.totalHoras`; and per `detalle.secciones[]`, `subtotalHoras ===` the resumen fila of the same legajo (SC-002 / SC-003). Also assert coverage of `pendientes` (SC-004 / SC-005): the fixture seeds, within days 1–15, at least one incomplete jornada, one day with a correction/justification, and one employee without categoría de presentismo; assert `informeQ1.resumen.filas.length === (padrón del período).length` (no omissions/dupes) and that `informeQ1.pendientes` lists exactly those incomplete days, ajustes and anomalías (the incomplete day's legajo+fecha in `pendientes.jornadasIncompletas`, the adjusted day in `pendientes.ajustes`, the uncategorised legajo in `pendientes.anomalias`), and `pendientes.hayPendientes === true`.
- [X] T010 [P] [US1] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 29): `GET /api/resumen-periodo?periodo=<YYYYMM>-Q1` on an open month with Q1 elapsed → body has `emisionAnticipadaQ1Disponible === true`.
- [ ] T011 [P] [US1] Frontend test in `frontend/src/components/AccionInformeCierre.test.jsx`: rendered with `cerrado={false}` + `anticipadoQ1Disponible` + a stub client where `obtener` rejects `INFORME_NO_EMITIDO`, it shows an "Emitir informe de la primera quincena" button; clicking it calls `cliente.emitir(periodo)` and then renders "Ver informe" / "Descargar PDF" / "Re-emitir" plus a persistent info alert about anticipated emission; "Ver informe" opens `InformeCierrePrintable`.
- [ ] T012 [P] [US1] Frontend test in `frontend/src/components/PaginaResumenPeriodo.test.jsx`: when the resumen view has `emisionAnticipadaQ1Disponible: true` and `cerrado: false`, `<AccionInformeCierre>` receives `anticipadoQ1Disponible` truthy and the emit button is in the document; when the flag is absent/false, no anticipated action renders.

### Implementation for User Story 1

- [X] T013 [US1] In `src/web/api/resumen-periodo-handlers.js`, compute `emisionAnticipadaQ1Disponible` inside `periodoEfectivo` (it already resolves `modo`, `tramo`, `periodoMes`, `calendario.cerrado`): `modo === 'QUINCENAL' && tramo === Tramo.Q1 && !cerrado && primeraQuincenaTerminada(periodoMes, hoyLocal())`. Import `primeraQuincenaTerminada`. Pass it through to `construirVistaResumenPeriodo({ …, emisionAnticipadaQ1Disponible })` in both list handlers.
- [X] T014 [US1] In `src/web/view-model.js`, extend `construirVistaResumenPeriodo({ …, emisionAnticipadaQ1Disponible = false })` to return `emisionAnticipadaQ1Disponible: Boolean(emisionAnticipadaQ1Disponible)` on the vista. Makes T010 pass.
- [ ] T015 [US1] In `frontend/src/components/AccionInformeCierre.jsx`, add an `anticipadoQ1Disponible` (boolean) prop. New branch for `!cerrado && anticipadoQ1Disponible`: on mount `traerGuardado()` already tries `cliente.obtener(periodo)` (periodo is `'<YYYYMM>-Q1'`, translated to `?tramo=Q1` by the client) — treat `INFORME_NO_EMITIDO` as "not emitted yet". Render "Emitir informe de la primera quincena" (calls `cliente.emitir(periodo)`, then `setGuardado`); once `guardado` exists render "Ver informe" / "Descargar PDF" / "Re-emitir" (re-emit = `cliente.emitir(periodo)` again) plus a persistent `<Alert type="info">` ("Emisión anticipada — el mes sigue abierto; las cifras de la primera quincena pueden cambiar hasta el cierre"). Keep the existing `!cerrado && !anticipadoQ1Disponible` note unchanged, and the `cerrado` branch unchanged. Makes T011 pass.
- [ ] T016 [US1] In `frontend/src/components/PaginaResumenPeriodo.jsx`, pass `anticipadoQ1Disponible={estado.vista.emisionAnticipadaQ1Disponible}` to the existing `<AccionInformeCierre>` mount (keep `key`, `periodo`, `cerrado`, `cliente`). Makes T012 pass.

**Checkpoint**: US1 fully functional — MVP. Emit + view + download the primera-quincena report from "Resumen del Período" without closing the month.

---

## Phase 4: User Story 2 — La primera quincena debe haber terminado para poder emitir su informe (Priority: P2)

**Goal**: the anticipated emission is offered only when the first fortnight has
fully elapsed and the month is still open; while Q1 is in progress the action is
absent and the API rejects it; once the month is closed the Q1 report comes from
the closing flow, not this path.

**Independent Test**: on an open month with Q1 still in progress, the anticipated
action is not offered and `POST …?tramo=Q1` → `409 QUINCENA_EN_CURSO`; after day
15 it appears; on a closed month the anticipated action is gone.

### Tests for User Story 2

- [X] T017 [P] [US2] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 21): QUINCENAL, period open, "hoy" ≤ day 15 of the period's month → `POST …/informe-cierre?tramo=Q1` (rol editor) → `409 QUINCENA_EN_CURSO`; assert nothing is written (`GET …?tramo=Q1` still `404 INFORME_NO_EMITIDO`).
- [X] T018 [P] [US2] Contract tests in `tests/contract/web-api-informe-cierre.test.js` (cases 22–24): (a) QUINCENAL open period, `POST …?tramo=Q2` → `409 PERIODO_ABIERTO`; (b) QUINCENAL open period, `POST` with no `?tramo` → `409 PERIODO_ABIERTO` (feature-018 behaviour intact); (c) MENSUAL, `POST …?tramo=Q1` on an open period → `400 PERIODO_INVALIDO`.
- [X] T019 [P] [US2] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 29 negatives): `GET /api/resumen-periodo` returns `emisionAnticipadaQ1Disponible === false` for (a) `?periodo=<YYYYMM>-Q1` with "hoy" ≤ day 15; (b) `?periodo=<YYYYMM>-Q2`; (c) a closed month's `-Q1`; (d) a MENSUAL installation.
- [ ] T020 [P] [US2] Frontend test in `frontend/src/components/AccionInformeCierre.test.jsx`: with `cerrado={false}` and `anticipadoQ1Disponible={false}`, only the existing plain note renders — no "Emitir informe de la primera quincena" button, no alert.

### Implementation for User Story 2

- [X] T021 [US2] Verify the branch conditions in `src/web/api/informe-cierre-handlers.js` from T008: `esAnticipadoQ1` is true **only** for `modo === 'QUINCENAL' && query.tramo === 'Q1' && calendario.cerrado !== true`; every other open-period request still throws `409 PERIODO_ABIERTO`; `?tramo=Q1` in MENSUAL still hits `tramosParaEmitir`'s `400 PERIODO_INVALIDO` (unchanged). Adjust only if T017/T018 fail. Makes T017/T018 pass.
- [X] T022 [US2] Verify `emisionAnticipadaQ1Disponible` in `src/web/api/resumen-periodo-handlers.js` (T013) is `false` for closed periods, `Q2`, `Mes`, MENSUAL mode, and Q1-in-progress. Adjust only if T019/T020 fail. Makes T019/T020 pass.

**Checkpoint**: US1 + US2 verifiable — the anticipated report is available exactly inside the window [end of Q1, month close).

---

## Phase 5: User Story 3 — El informe anticipado se distingue del informe de cierre y se mantiene coherente (Priority: P3)

**Goal**: the anticipated Q1 document is visibly marked as an anticipated
emission; it can be re-emitted on demand while the month is open (without
blocking corrections on days 1–15); when the month is finally closed the closing
emission replaces the anticipated copy and it stops being flagged anticipated.

**Independent Test**: emit the anticipated Q1 report → the document shows an
"emisión anticipada" marker; load a correction on a day 1–15 (not blocked) and
re-emit → the copy reflects it; close the month → `GET …?tramo=Q1` now has
`sello.anticipado === false` and `sello.modo === 'automatico'`.

### Tests for User Story 3

- [X] T023 [P] [US3] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 27): emit the anticipated Q1 report on an open month; `POST /api/calendarios/:periodo/cerrar` (rol editor); then `GET …?tramo=Q1` → `200` with `sello.anticipado === false` and `sello.modo === 'automatico'`, and `GET …?tramo=Q2` and `?tramo=Mes` → `200`.
- [X] T024 [P] [US3] Contract tests in `tests/contract/web-api-informe-cierre.test.js` (cases 28 & 30 + SC-008): (a) two consecutive anticipated `POST …?tramo=Q1` with no data change in between → both `200`, `sello.anticipado === true`, only `sello.emitidoEn` differs; (b) after an anticipated Q1 emission, a correction on a day 1–15 (`POST /api/correcciones` or the existing correction route, rol editor) → success (not `PERIODO_CERRADO`); a `GET …?tramo=Q1` **before** re-emitting still returns the previous copy (no auto-invalidation); then a second anticipated `POST …?tramo=Q1` → `200` and the affected legajo's `resumen.fila.horasTrabajadas` (and the matching `detalle` day) in the new copy reflects the corrected value, i.e. differs from the pre-correction copy by the expected delta (SC-008).
- [X] T025 [P] [US3] Contract test in `tests/contract/web-api-informe-cierre.test.js` (case 25): anticipated `POST …?tramo=Q1` with `X-Apex-Rol: lector` → `403 ACCESO_DENEGADO`; `GET …?tramo=Q1` (no rol) after an editor emission → `200`.
- [ ] T026 [P] [US3] Frontend test in `frontend/src/components/InformeCierrePrintable.test.jsx` (and a new `frontend/src/components/InformeCierreContenido.test.jsx` if the marker lives in the content component): given a `vista` with `sello.anticipado === true`, a visible "EMISIÓN ANTICIPADA — mes no cerrado" marker renders in the sello header; with `sello.anticipado` falsy it does not. Also assert in `AccionInformeCierre.test.jsx` that the persistent info alert renders when the anticipated `guardado` has `sello.anticipado === true`.

### Implementation for User Story 3

- [ ] T027 [P] [US3] In `frontend/src/components/InformeCierreContenido.jsx`, when `vista.sello.anticipado` is truthy, render a visible marker line in the `.informe-sello` header (e.g. `<p className="informe-anticipado" role="note">EMISIÓN ANTICIPADA — el mes no está cerrado; las cifras de la primera quincena pueden cambiar hasta el cierre.</p>`) and add a matching style rule next to `.informe-obsoleto`. Include it in the printed/PDF copy. Makes T026 pass.
- [ ] T028 [P] [US3] In `frontend/src/components/InformeCierrePrintable.jsx`, append "· emisión anticipada" to the `etiqueta` when `vista.sello.anticipado` is truthy.
- [X] T029 [US3] Confirm `emitirInformesDelCierre` in `src/web/api/calendario-handlers.js` calls `emitirInformeCierre` **without** an `anticipado` argument (defaults to `false`) so closing overwrites the anticipated `Q1` entry with `anticipado: false` / `emision: 'automatico'`; and confirm `reabrirPeriodoMes` in `src/presentismo/service/calcular-presentismo-service.js` still marks the `Q1` entry `obsoleto` via its "iterate every tramo" loop. Expected: no code change. Makes T023 pass.

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Update `docs/presentismo.md`: document that in QUINCENAL mode the primera-quincena (`Q1`) report can be emitted manually from "Resumen del Período" once day 15 has passed and before the month is closed (`POST …/informe-cierre?tramo=Q1` on an open period), that such copies carry `sello.anticipado: true`, and that closing the month replaces them with the definitive closing copy.
- [ ] T031 [P] Run the full backend suite `node --test` and the full frontend suite `cd frontend; npx vitest run`; fix any regression in feature-018 / feature-021 tests caused by the gate rework or the extra `sello.anticipado` field.
- [ ] T032 Execute `specs/022-informe-primera-quincena-anticipado/quickstart.md` §1 (automated) and §2 (API by curl, QUINCENAL) and confirm every listed expectation.
- [ ] T033 Manual UI pass per `quickstart.md` §3: Resumen del Período on a Q1 with fortnight in progress (no action) → Q1 elapsed, open month (Emitir button) → emit → Ver/Descargar/Re-emitir + "emisión anticipada" alert → correction on a day 1–15 (not blocked) + re-emit → Q2 / MENSUAL (no action) → close period (Q1 no longer anticipated).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. **Blocks Phases 3–5** (every story exercises the anticipated `?tramo=Q1` path and/or the `anticipado` flag).
- **US1 (Phase 3)**: after Phase 2. Delivers the MVP (manual emit + view/download + cuadre + UI availability flag).
- **US2 (Phase 4)**: after Phase 2. Mostly verification of the window conditions already implemented in T008/T013; independent of US1 but shares those files, so run after US1.
- **US3 (Phase 5)**: after Phase 2. The frontend marker (T027/T028) is independent; the replace-on-close check (T029) is pure verification. Run after US1 (shares `AccionInformeCierre`).
- **Polish (Phase 6)**: after all desired stories.

### Within each story

- Test tasks before their implementation tasks; confirm they fail first.
- Foundational order: T005/T006 (domain) → T007 (service) → T008 (handler). T002/T003/T004 are the failing tests written first.
- US1: T013 (handler) → T014 (view-model) unblock T010; T015 (component) needs T014's field shape; T016 wires the page.

### Parallel opportunities

- Phase 2: T002, T003, T004 in parallel (3 different test files). Then T005, T006 in parallel (different domain files); T007 after T006; T008 after T005+T007.
- US1: T009, T010, T011, T012 in parallel (different files). Then T013 → T014; T015 and T016 after.
- US2: T017, T018, T019, T020 in parallel. T021, T022 are verification-only and usually need no edit.
- US3: T023, T024, T025, T026 in parallel; T027, T028 in parallel; T029 verification-only.
- Phase 6: T030, T031 in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files, no deps):
Task: "T009 cuadre anticipated-Q1 vs resumen-periodo in tests/contract/web-api-informe-cierre.test.js"
Task: "T010 emisionAnticipadaQ1Disponible true in tests/contract/web-api-informe-cierre.test.js"
Task: "T011 AccionInformeCierre anticipated mode in frontend/src/components/AccionInformeCierre.test.jsx"
Task: "T012 PaginaResumenPeriodo passes anticipadoQ1Disponible in frontend/src/components/PaginaResumenPeriodo.test.jsx"

# Then implementation:
Task: "T013 compute emisionAnticipadaQ1Disponible in src/web/api/resumen-periodo-handlers.js"
Task: "T014 propagate the field in src/web/view-model.js"   # after T013 lands the caller
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (helper + `sello.anticipado` + handler exception) → 3. Phase 3 US1 → 4. **STOP and validate**: on an open QUINCENAL month with Q1 elapsed, emit the primera-quincena report from "Resumen del Período", view it, download it, and confirm the figures match "Resumen del Período" for that Q1 → 5. demo.

### Incremental delivery

1. Setup + Foundational → API path ready, flagged `anticipado`.
2. US1 → manual emit + view/download from "Resumen del Período" + availability flag → demo (MVP).
3. US2 → contract tests pin the window (`409 QUINCENA_EN_CURSO`, `409 PERIODO_ABIERTO`, MENSUAL `400`, flag negatives) → demo.
4. US3 → visible "emisión anticipada" marker, re-emission while open, replace-on-close → demo.
5. Polish → docs, full suites, quickstart.

### Parallel team strategy

1. Team completes Phase 1 + Phase 2 together.
2. Then: Dev A on US1 (backend flag + UI), Dev B on US2 (window contract tests), Dev C on US3 (document marker + lifecycle tests). US2/US3 are largely test + verification once US1's handler/view-model edits land.
