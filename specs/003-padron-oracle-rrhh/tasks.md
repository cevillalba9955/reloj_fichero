---
description: "Task list for feature 003 — Padrón Real de Empleados Activos desde Oracle/RRHH"
---

# Tasks: Padrón Real de Empleados Activos desde Oracle/RRHH

**Input**: Design documents from `/specs/003-padron-oracle-rrhh/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (oracle-roster-repository, env-config, daily-roster-cache)

**Tests**: REQUIRED for this feature. Constitution Principle IV (Test-First en Capas Críticas) mandates Red-Green-Refactor for the new Oracle data/repository layer, config validation, roster normalization and the daily-cache decorator. Test tasks are ordered before their implementation and MUST fail before code is written.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 — maps to the user stories in spec.md
- All paths are relative to the repository root `C:\AI\rs956`

## Path Conventions

Single project (backend service), same repo as features 001/002: `src/`, `tests/` at root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce the first runtime dependency and configuration surface.

- [X] T001 Add `node-oracledb` `^6.x` to `dependencies` in package.json and run `npm install` (first runtime dependency of the project — research.md §1); confirm `npm test` still runs green afterward
- [X] T002 [P] Add an `.env.example` (or README section) documenting the `RRHH_ORACLE_*` variables (`RRHH_ORACLE_USER`, `RRHH_ORACLE_PASSWORD`, `RRHH_ORACLE_CONNECT_STRING`, `RRHH_ORACLE_VISTA_PADRON`, `RRHH_ORACLE_COLUMNA_LEGAJO`, `RRHH_ORACLE_TIMEOUT_MS`) with placeholder (non-secret) values — never commit real credentials (FR-004)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The roster-fetch NDJSON logger is consumed by the provider (US1), the decorator (US1) and the resilience paths (US2), so it must exist first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Write unit test in tests/unit/roster-fetch-logger.test.js asserting NDJSON events (`padron_fresco` | `padron_respaldo` | `padron_vacio` | `padron_error` | `legajo_descartado`) carry `ts`, `serviceId`, `cantidadLegajos`, `duracionMs`, `obtenidoEn`, `detail`, and that no line ever contains a password or a full connect string (FR-010, Principio V) — test MUST fail first
- [X] T004 Implement src/logging/roster-fetch-logger.js following the NDJSON pattern of src/logging/session-logger.js and src/logging/service-cycle-logger.js (data-model.md §4) — make T003 pass

**Checkpoint**: Logging infrastructure ready — user stories can now begin.

---

## Phase 3: User Story 1 - Evaluar completitud contra el padrón real de RRHH (Priority: P1) 🎯 MVP

**Goal**: Obtain the active-employee universe from the Oracle/RRHH view behind the existing `ActiveEmployeesProvider` contract and evaluate completeness against it, as a drop-in replacement — one query per service day (FR-014 fresh path), no local file involved.

**Independent Test**: Drive the feature-002 service (integration test) with a mock TCP clock and a *fake* Oracle connection returning a known legajo set (e.g. `[101, 102]`); assert the checkpoint closes by `cerrado_completo` and `getState().empleados[]` matches, with no local roster file and no changes to scheduler/store (quickstart.md scenarios 2 & 5).

### Tests for User Story 1 (write first — MUST fail before implementation) ⚠️

- [X] T005 [P] [US1] Write unit test in tests/unit/oracle-roster-repository.test.js using a fake `connectionFactory`: exact SQL `SELECT <columna> FROM <vista>` generated from config, rejection (without executing) when vista/columna fail the SQL-identifier pattern, raw (non-normalized) row mapping, connection `close()` guaranteed on success AND error, and failures surfacing as `RosterNoDisponibleError` with category `conexion|autenticacion|timeout|consulta` and no secrets in the message (oracle-roster-repository-contract.md)
- [X] T006 [P] [US1] Write unit test in tests/unit/oracle-active-employees-provider.test.js for normalization (FR-012): dedup repeated legajos, discard non-integer/negative/null values (logging each `legajo_descartado`), preserve the rest, output shape `{ legajo, activo: true }[]` (data-model.md §2)
- [X] T007 [P] [US1] Write unit test in tests/unit/daily-cached-active-employees-provider.test.js for the fresh path with injected `now()`: first call of the day queries `inner` and fixes the snapshot (`padron_fresco`); later same-day calls return the snapshot WITHOUT calling `inner` (FR-014); day change re-queries; and re-entrancy (two concurrent calls → a single `inner.getActiveEmployees()`) (daily-roster-cache-contract.md rows 1,2,7 + reentrancy)
- [X] T008 [P] [US1] Write integration test in tests/integration/consulta-programada-oracle-roster.integration.test.js: full feature-002 service with mock TCP clock + fake repository returning `[101, 102]` closes the checkpoint as `cerrado_completo` and exposes both legajos; and N getActiveEmployees calls in one day trigger EXACTLY 1 source query (quickstart.md scenarios 2 & 5)

### Implementation for User Story 1

- [X] T009 [US1] Implement src/db/oracle-roster-repository.js: `createOracleRosterRepository({ config, connectionFactory? })` with `fetchLegajosActivos()`, single read-only `SELECT`, strict re-validation of vista/columna identifiers, ephemeral connection closed in try/finally, timeout deadline from `config.timeoutMs`, errors wrapped in `RosterNoDisponibleError` (from src/roster/active-employees-provider.js) with categorized secret-free `detail` — make T005 pass (only file in the repo allowed to contain SQL — Principio II)
- [X] T010 [US1] Implement src/roster/oracle-active-employees-provider.js: repository rows → normalized `Empleado[]` (dedup + discard invalid, logging each discard via roster-fetch-logger) — make T006 pass (depends on T009)
- [X] T011 [US1] Implement src/roster/daily-cached-active-employees-provider.js: `createDailyCachedActiveEmployeesProvider({ inner, now?, logger? })` with fresh-path snapshot fix, one-successful-query-per-day (FR-014), re-entrancy via shared in-flight promise, `padron_fresco` logging — make T007 pass (backup/empty/error branches added in US2)

**Checkpoint**: The Oracle provider chain (repository → provider → daily decorator, fresh path) works end-to-end behind the existing contract and is independently testable via T008. MVP delivered.

---

## Phase 4: User Story 2 - Seguir operando ante indisponibilidad de la fuente (Priority: P2)

**Goal**: A mid-day (or startup) source outage must not stop collection nor produce false completeness: reuse the last valid snapshot (even from a prior day), treat an empty roster as unavailable, error with no prior snapshot, and retry until the daily success — all logged with the snapshot's age.

**Independent Test**: With a simulated `now()`, fake repo returns `[101, 102]` on day 1 (snapshot fixed) then rejects on day 2 → service keeps evaluating with `[101, 102]` and logs `padron_error` + `padron_respaldo` carrying day-1 `obtenidoEn`; fake returning `[]` with no prior snapshot → cycle logged as `error`/`RosterNoDisponibleError`, no checkpoint closes by completeness, next call retries (quickstart.md scenarios 3 & 4).

### Tests for User Story 2 (write first — MUST fail before implementation) ⚠️

- [X] T012 [US2] Extend tests/unit/daily-cached-active-employees-provider.test.js with the resilience rows of daily-roster-cache-contract.md: `inner` fails WITH prior snapshot → serves last valid snapshot + logs `padron_error`+`padron_respaldo` (FR-008); `inner` fails WITHOUT prior snapshot → rejects `RosterNoDisponibleError` (FR-007); `inner` returns `[]` → treated as failure, never fixed as snapshot, logs `padron_vacio` (FR-011); failure/empty on first call then retry same day; day-change keeps previous snapshot as backup — MUST fail first (same file as T007, so runs after it)
- [X] T013 [US2] Extend tests/integration/consulta-programada-oracle-roster.integration.test.js with scenario 3 (day-2 outage serves day-1 snapshot, degraded log with `obtenidoEn`, then recovery to `padron_fresco`) and scenario 4 (empty roster → cycle `error`, nothing closes by completeness) — MUST fail first

### Implementation for User Story 2

- [X] T014 [US2] Extend src/roster/daily-cached-active-employees-provider.js with backup on failure (FR-008), empty-as-unavailable (FR-011, never fixes empty as snapshot nor consumes the daily success), reject-without-snapshot (FR-007), retry-until-daily-success, and degraded/`padron_vacio`/`padron_error`+`padron_respaldo` logging with the served snapshot's `obtenidoEn` — make T012 & T013 pass

**Checkpoint**: US1 + US2 both work; the service is resilient to source outages without false completeness.

---

## Phase 5: User Story 3 - Configurar la conexión de forma segura y diagnosticable (Priority: P3)

**Goal**: Configure the Oracle/RRHH connection purely via environment variables with fail-fast, actionable, secret-free startup validation, and select the roster source (`archivo`|`oracle`) by configuration — completing the deployable CLI path.

**Independent Test**: Run the CLI with `--padron oracle` and (a) complete env → service starts and queries; (b) missing vars → aborts before scheduling cycles, naming all missing variables at once, with no credential value in any output; and verify no log/message ever contains `RRHH_ORACLE_PASSWORD` (quickstart.md scenario 1, env-config-contract.md).

### Tests for User Story 3 (write first — MUST fail before implementation) ⚠️

- [X] T015 [P] [US3] Write unit test in tests/unit/oracle-roster-config.test.js: complete config → object with defaults (`columnaLegajo=LEGAJO`, `timeoutMs=10000`); N missing required vars → a single `ConfiguracionPadronInvalidaError` naming all N; `RRHH_ORACLE_VISTA_PADRON` with spaces/`;`/quotes → error; `RRHH_ORACLE_TIMEOUT_MS` non-numeric or ≤ 0 → error; and an explicit assertion that no error message contains the `RRHH_ORACLE_PASSWORD` value (env-config-contract.md) — MUST fail first
- [X] T016 [P] [US3] Extend tests/unit/consulta-programada-cli.test.js: `--padron` flag defaults to `archivo`, accepts `oracle`, rejects unknown values; `createRosterProvider` in oracle mode with missing env throws `ConfiguracionPadronInvalidaError` naming missing vars with no secret values; archivo mode returns the local adapter unchanged (FR-013, SC-005) — MUST fail first

### Implementation for User Story 3

- [X] T017 [P] [US3] Implement src/db/oracle-roster-config.js: `readOracleRosterConfig(env=process.env)` returning `OracleRosterConfig` with defaults and strict SQL-identifier validation, throwing `ConfiguracionPadronInvalidaError` that enumerates all missing/invalid variable names at once and never echoes any value (data-model.md §1, env-config-contract.md) — make T015 pass
- [X] T018 [US3] Wire src/cli/consulta-programada.js: add `--padron archivo|oracle` flag (default `archivo`, behavior unchanged — FR-013); export `createRosterProvider` that on `oracle` calls `readOracleRosterConfig` (fail-fast) and assembles repository → oracle provider → daily-cache decorator; `main()` aborts with a non-zero exit code before `startService()` on `ConfiguracionPadronInvalidaError`; credentials only from env, never argv (FR-004/FR-005) — make T016 pass (depends on T009–T011, T014, T017)

**Checkpoint**: All three stories functional; the service is deployable against real Oracle via env config.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Verified quickstart.md/README run instructions match the shipped `--padron oracle` CLI (no README/CLAUDE.md exists; quickstart scenario 6 already aligned — no drift)
- [X] T020 Ran `npm test` (145 pass, feature-002 suite unchanged — SC-005) and demonstrated quickstart scenario 1 via the real CLI (exit 4, all missing vars named, no secret). Fake-repo roster fetch is sub-millisecond, well under 5s (SC-004)
- [X] T021 [P] Audit (SC-002): `git grep`/Grep of the sentinel password and connect string across the repo and `./logs/*.ndjson` → 0 occurrences in generated logs; `.env` stays gitignored while `.env.example` holds only placeholders; `getState()` never serializes `OracleRosterConfig`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS all user stories (logger consumed by US1/US2).
- **US1 (Phase 3)**: depends on Foundational. Delivers the MVP.
- **US2 (Phase 4)**: depends on US1 (extends the same decorator file, src/roster/daily-cached-active-employees-provider.js).
- **US3 (Phase 5)**: config module (T015/T017) is independent of US1/US2 and can start after Foundational; the CLI wiring (T018) depends on the US1/US2 chain being present.
- **Polish (Phase 6)**: depends on all desired stories.

### Within Each User Story

- Tests are written first and MUST fail before implementation (Principio IV).
- Repository (T009) → provider/normalization (T010) → decorator (T011).
- US2's decorator extension (T014) builds on US1's decorator (T011).

### Parallel Opportunities

- T002 runs parallel to T001's install step.
- US1 tests T005, T006, T007, T008 are different files → all `[P]` together.
- US3's T015 and T017 (config) can proceed in parallel to US1/US2 work (different files); only T018 must wait for the chain.
- Polish T019 and T021 are `[P]`.

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (logger) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: the fake-repo integration test (T008) proves drop-in completeness with no local file and one query/day.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → drop-in Oracle roster (MVP).
3. US2 → outage resilience (backup / empty / error / retry).
4. US3 → secure env config + `--padron oracle` CLI (deployable).
5. Polish → audits and quickstart validation.

---

## Notes

- Only src/db/oracle-roster-repository.js may contain SQL (Principio II); reviewers verify no SQL leaks into other layers.
- src/protocol/, src/scheduling/, src/store/, src/service/ are NOT modified — the daily policy lives entirely in the decorator (FR-014).
- `RosterNoDisponibleError` is reused from feature 002 (src/roster/active-employees-provider.js); the scheduler already logs such cycles as `error` without assuming an empty roster.
- Verify each test fails before implementing; commit after each task or logical group.
