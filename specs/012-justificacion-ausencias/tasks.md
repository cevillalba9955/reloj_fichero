# Tasks: Justificación de Ausencias

**Input**: Design documents from `/specs/012-justificacion-ausencias/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/motivos-ausencia-config.schema.md](contracts/motivos-ausencia-config.schema.md), [contracts/web-api.md](contracts/web-api.md), [quickstart.md](quickstart.md)

**Tests**: Incluidos. La Constitución (Principio IV) trata como crítico todo lo que
impacta liquidación de haberes; el crédito de jornada esperada de una Justificación
`Paga` (FR-013/FR-014) toca el motor de cálculo de 004, así que se exige test-first en
esa capa, igual que en 004/011.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en orden de
prioridad P1→P3, sobre una fase Foundational compartida.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 (P1) / US2 (P2) / US3 (P3)

## Path Conventions

Web app existente (single repo): backend en `src/`, frontend en `frontend/src/`,
tests en `tests/` (raíz, `node:test`) y `frontend/src/components/*.test.jsx`
(Vitest) — ver plan.md § Project Structure.

---

## Phase 1: Setup

- [X] T001 [P] Crear `config/motivos-ausencia.json` (catálogo activo, 9 motivos por
  defecto) y `config/motivos-ausencia.example.json` (plantilla versionada), forma de
  `contracts/motivos-ausencia-config.schema.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: catálogo de motivos, dominio de Justificación (elegibilidad, expansión
de rango, crédito de jornada esperada, señalado para revisión) y persistencia — base
de las tres historias.

**⚠️ CRITICAL**: ninguna historia puede completarse sin esta fase.

- [X] T002 [P] Tests unitarios de `motivos-ausencia-config.js` (fail-fast: config
  ausente/JSON inválido, `id` duplicado o vacío, `tipoPago` fuera de
  `{Paga, No paga}`, catálogo sin ningún motivo `activo`) en
  `tests/unit/presentismo-motivos-ausencia-config.test.js` — DEBEN fallar antes de T004
- [X] T003 [P] Tests unitarios de `justificacion.js`: `esDiaElegible` (Laborable +
  Sin fichadas pasado, o futuro; rechaza No Laborable/Feriado y Laborable con
  fichadas — FR-001/002), `expandirRangoElegible` (omite No Laborable en silencio,
  separa no aplicables sin bloquear el resto — FR-003a, Acceptance Scenarios 6-7 de
  US1), `crearJustificacion` (motivo obligatorio, un vigente por día — FR-003/008),
  `revertirJustificacion` (falla si no hay vigente — US3 Acceptance Scenario 2) en
  `tests/unit/presentismo-justificacion.test.js` — DEBEN fallar antes de T006
- [X] T004 Implementar `motivos-ausencia-config.js` en
  `src/presentismo/config/motivos-ausencia-config.js` (carga + validación fail-fast,
  mismo criterio que `categorias-config.js`) — depende de T001, T002
- [X] T005 [P] Tests unitarios de `aplicarAjustes` (jornada.js) extendido con
  `justificacion`: día `Sin fichadas` con Justificación `Paga` vigente queda
  acreditado (mismo camino que `Feriado`); `No paga` no acredita nada; si llegan
  fichadas sobre un día con Justificación vigente (`auto.estado` deja de ser
  `Sin fichadas`), el resultado queda con `requiereJustificacionRevision: true` sin
  descartar la Justificación ni las fichadas (FR-010/013/014, edge case "fichadas que
  llegan después de justificar") en `tests/unit/presentismo-jornada.test.js` — DEBEN
  fallar antes de T007
- [X] T006 Implementar `justificacion.js` en `src/presentismo/domain/justificacion.js`
  (dominio puro: `esDiaElegible`, `expandirRangoElegible`, `crearJustificacion`,
  `revertirJustificacion`, `justificacionVigenteDe` — research.md §2-§3) — depende de
  T003
- [X] T007 Extender `aplicarAjustes` en `src/presentismo/domain/jornada.js` para
  aceptar un parámetro `justificacion` opcional y aplicar el crédito/señalado de T005
  — depende de T005, T006
- [X] T008 [P] Tests unitarios de `construirResumen` (resumen-presentismo.js):
  `horasEsperadas` acredita un día Laborable con Justificación `Paga` vigente igual
  que un `Feriado`; `No paga` no cambia el número (FR-013/FR-014) en
  `tests/unit/presentismo-resumen.test.js` — DEBEN fallar antes de T009
- [X] T009 Verificado que `construirResumen` (`resumen-presentismo.js`) NO necesita
  ningún cambio de código: `horasEsperadas` ya cuenta todo día `Laborable` (con o sin
  fichadas) y `horasTrabajadas` ya suma `resultado.totalDiario`; como `aplicarAjustes`
  (T007) fija `totalDiario = jornadaEsperada` para un día `Paga`, el crédito llega
  solo. T008 quedó como test de calibración que fija este comportamiento (research.md
  §4) — depende de T007, T008
- [X] T010 Extender `file-presentismo-repository.js`
  (`src/presentismo/adapters/file-presentismo-repository.js`) con la colección
  `justificaciones` del archivo por período (`listarJustificaciones`,
  `agregarJustificacion`, `revertirJustificacion`), misma escritura atómica
  (temp+rename) que `correcciones`/`pausas` (data-model.md) — depende de T006
- [X] T011 Extender `calcular-presentismo-service.js`
  (`src/presentismo/service/calcular-presentismo-service.js`):
  `cargarJustificacion({ periodo, legajo, fecha, hasta?, motivoId, autor })` (usa
  `expandirRangoElegible` de T006 y persiste vía T010, devuelve `registradas` /
  `omitidas` / `noAplicables`) y `revertirJustificacion({ periodo, legajo, fecha,
  autor })`; y modificar `calcularEmpleado` para leer
  `repo.listarJustificaciones(periodo, legajo)` y pasar la Justificación vigente de
  cada día a `aplicarAjustes` (T007) y a `jornadas[].justificacion` (para que
  `resumen-periodo.js` la consuma en US2) — depende de T006, T007, T009, T010
- [X] T012 [P] Wiring: cargar `motivos-ausencia-config` al arranque del servidor
  (mismo lugar que `categoriasConfig`) y exponerlo como `ctx.motivosAusencia` en el
  contexto web — depende de T004

**Checkpoint**: catálogo, dominio de Justificación, crédito de horas y persistencia
listos y calibrados; las historias pueden avanzar en orden de prioridad.

---

## Phase 3: User Story 1 - Registrar el motivo de una ausencia (Priority: P1) 🎯 MVP

**Goal**: un responsable registra, para un legajo y un día (o un rango de días)
`Laborable` sin fichadas o futuro, un motivo de una lista cerrada, con su
clasificación `Paga`/`No paga` y auditoría (autor, fecha/hora).

**Independent Test**: `POST /api/justificaciones` sobre un día `Sin fichadas` con un
`motivoId` válido devuelve el día registrado con su `tipoPago`; sobre un día con
fichadas o `No Laborable`/`Feriado` lo rechaza; sobre un rango de fechas registra cada
día `Laborable` elegible y omite/informa el resto, sin necesitar consultar el
resumen (US2) ni revertir (US3).

### Tests for User Story 1

- [X] T013 [P] [US1] Test de contrato para `GET /api/motivos-ausencia` (200 con los
  motivos activos) y `POST /api/justificaciones` (200 con
  `registradas`/`omitidas`/`noAplicables`, 400 `JUSTIFICACION_INVALIDA`, 404
  `CALENDARIO_NO_GENERADO`, 409 `JUSTIFICACION_NO_APLICABLE` /
  `RANGO_SIN_DIAS_ELEGIBLES`) en `tests/contract/web-api-justificaciones.test.js` —
  DEBE fallar antes de T015
- [X] T014 [P] [US1] Test de integración US1 en
  `tests/integration/justificacion.integration.test.js`: día único `Enfermedad`
  (Paga) y `Sin Aviso` (No paga); rechazo sin motivo; rechazo sobre día con fichadas;
  rechazo sobre `No Laborable`/`Feriado`; rango con días futuros que omite fin de
  semana y no bloquea por un día no aplicable (Acceptance Scenarios 6-7 de US1);
  crédito de jornada esperada tras justificar `Paga` (Acceptance Scenario 8) — DEBE
  fallar antes de T015
- [X] T015 [US1] Crear `src/web/api/justificaciones-handlers.js` con
  `GET /api/motivos-ausencia` y `POST /api/justificaciones` (contracts/web-api.md) y
  registrarlo en `src/web/server.js` — depende de T011, T012; hace pasar T013/T014

### Implementation for User Story 1

- [X] T016 [P] [US1] Crear `frontend/src/api/justificaciones-client.js`:
  `obtenerMotivos()`, `crearJustificacion({ legajo, fecha, hasta?, motivoId, autor?
  })` (mismo patrón que `fichadas-hoy-client.js`)
- [X] T017 [P] [US1] Crear `frontend/src/components/FormularioJustificacion.jsx`:
  selector de motivo (catálogo, `GET /api/motivos-ausencia`), rango de fechas
  opcional (`desde`/`hasta`), motivo obligatorio (botón Guardar deshabilitado sin
  motivo, mismo patrón que `FormularioCorreccion.jsx`)
- [X] T018 [US1] Integrar el botón "Justificación" en
  `frontend/src/components/TablaFichadasHoy.jsx` junto a "Corregir": habilitado en
  días `Sin fichadas`/futuros, deshabilitado si el día ya tiene fichadas — depende de
  T016, T017
- [X] T019 [P] [US1] Tests de componente para `FormularioJustificacion.jsx` (motivo
  obligatorio, envío con/sin rango) en
  `frontend/src/components/FormularioJustificacion.test.jsx`, y ajuste de
  `frontend/src/components/TablaFichadasHoy.test.jsx` (botón Justificación
  habilitado/deshabilitado)

**Checkpoint**: US1 entrega el registro de Justificación, completo y demostrable.

---

## Phase 4: User Story 2 - Consultar el motivo y la condición de pago (Priority: P2)

**Goal**: el detalle de un empleado y el resumen del período muestran, por día
justificado, el motivo y su clasificación; el resumen agrega columnas `Feriado` y
`Licencia` junto a las 7 existentes, sin duplicar `Ausencias`.

**Independent Test**: sobre datos de US1 ya cargados, `GET /api/resumen-periodo`
devuelve `feriado`/`licencia` por legajo y `GET /api/resumen-periodo/{legajo}`
devuelve `justificacion` por día, sin necesitar registrar (US1, ya resuelto por
datos de fixture) ni revertir (US3).

### Tests for User Story 2

- [X] T020 [P] [US2] Tests unitarios de `resumen-periodo.js`: `feriado` cuenta días
  `Feriado`, `licencia` cuenta días con Justificación `Paga` vigente, `ausencias`
  sigue contando `Sin fichadas` (incluye `No paga`, sin sumar también a `licencia`),
  `detalleDeJornada` expone `justificacion: {motivoId, etiquetaMotivo, tipoPago} |
  null` (Acceptance Scenario 3 de US2, data-model.md "Proyección en el resumen del
  período") en `tests/unit/presentismo-resumen-periodo.test.js` — DEBEN fallar antes
  de T021
- [X] T021 [US2] Extender `proyectarResumenPeriodo` y `detalleDeJornada` en
  `src/presentismo/domain/resumen-periodo.js` con los contadores `feriado`/`licencia`
  y el campo `justificacion` por día — depende de T011 (jornadas ya traen
  `justificacion`), T020
- [X] T022 [P] [US2] Test de contrato para `GET /api/resumen-periodo` (filas con
  `feriado`/`licencia`) y `GET /api/resumen-periodo/{legajo}` (`dias[].justificacion`)
  en `tests/contract/web-api-resumen-periodo.test.js` — DEBE fallar antes de T023
- [X] T023 [US2] Extender `construirVistaResumenPeriodo` y
  `construirDetalleEmpleado` en `src/web/view-model.js` con `feriado`/`licencia` por
  fila y `justificacion` por día — depende de T021; hace pasar T022

### Implementation for User Story 2

- [X] T024 [P] [US2] Extender `frontend/src/components/TablaResumenPeriodo.jsx` con
  las columnas `Feriado` y `Licencia` junto a las 7 existentes
- [X] T025 [P] [US2] Extender `frontend/src/components/DialogoDetalleEmpleado.jsx`
  para mostrar el motivo y la clasificación `Paga`/`No paga` de cada día justificado
  — depende de T023
- [X] T026 [P] [US2] Tests de componente actualizados:
  `TablaResumenPeriodo.test.jsx` (columnas `Feriado`/`Licencia`) y
  `DialogoDetalleEmpleado.test.jsx` (motivo/clasificación por día)

**Checkpoint**: US1 y US2 funcionan de forma independiente y en conjunto.

---

## Phase 5: User Story 3 - Revertir una Justificación cargada por error (Priority: P3)

**Goal**: un responsable revierte una Justificación vigente, dejando constancia de la
reversión, y puede volver a justificar el mismo día con otro motivo.

**Independent Test**: sobre un día ya justificado (US1), `DELETE
/api/justificaciones` lo revierte; una segunda reversión sobre el mismo día devuelve
404; tras revertir, un nuevo `POST` sobre ese día vuelve a aceptarse.

### Tests for User Story 3

- [X] T027 [P] [US3] Test de contrato para `DELETE /api/justificaciones` (200
  `{fecha, revertida: true}`, 400 `JUSTIFICACION_INVALIDA`, 404
  `JUSTIFICACION_NO_ENCONTRADA`) en `tests/contract/web-api-justificaciones.test.js`
  — DEBE fallar antes de T029
- [X] T028 [P] [US3] Test de integración US3 en
  `tests/integration/justificacion.integration.test.js`: revertir deja el día sin
  Justificación vigente (ya no aparece en `licencia`/detalle), la original queda
  visible como no vigente, revertir dos veces el mismo día → 404, y tras revertir se
  puede cargar un motivo nuevo sobre ese día (US3 Acceptance Scenarios 1-2) — DEBE
  fallar antes de T029
- [X] T029 [US3] Agregar `DELETE /api/justificaciones` a
  `src/web/api/justificaciones-handlers.js` — depende de T015; hace pasar T027/T028

### Implementation for User Story 3

- [X] T030 [P] [US3] Agregar `revertirJustificacion({ legajo, fecha, autor? })` a
  `frontend/src/api/justificaciones-client.js`
- [X] T031 [US3] Agregar la acción "Revertir" donde se muestra el motivo vigente
  (`TablaFichadasHoy.jsx`/`DialogoDetalleEmpleado.jsx`, junto al botón
  "Justificación") — depende de T030, T018, T025
- [X] T032 [P] [US3] Test de componente para la acción de revertir (confirma,
  llama al cliente, refleja el resultado)

**Checkpoint**: las 3 historias funcionan de forma independiente y en conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T033 [P] Test de integración de los edge cases restantes del spec: fichadas
  tardías sobre un día justificado (`requiereJustificacionRevision` visible extremo a
  extremo, T005/T007 ya cubren el dominio) y reclasificación de un día justificado
  (`Laborable`→`Feriado`/`No Laborable`, mismo señalado que una Corrección Manual
  reclasificada) en `tests/integration/justificacion.integration.test.js`
- [X] T034 Ejecutar manualmente los 4 escenarios de `quickstart.md` de punta a punta
  (incluida la verificación transversal de fichadas tardías) y registrar el
  resultado en el propio `quickstart.md`
- [X] T035 [P] Correr las suites completas (backend `node --test` y frontend
  `npx vitest run`) confirmando que nada de 001–011 se rompe

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA las tres historias.
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: su backend (T021/T023) depende de que `calcularEmpleado` ya
  traiga `justificacion` por día (T011, Foundational); no depende de que exista UI de
  US1, pero sí necesita datos cargados (vía API directa o vía US1) para ser
  demostrable con contenido real.
- **US3 (Phase 5)**: su backend (T029) depende del handler base de US1 (T015); su UI
  (T031) depende de dónde US1 (T018) y US2 (T025) muestran el motivo vigente.
- **Polish (Phase 6)**: depende de las historias entregadas.

### User Story Dependencies

- **US1 (P1)**: solo Foundational.
- **US2 (P2)**: independiente de US3; converge con US1 en el dato que produce
  `calcularEmpleado` (Foundational) y, en la UI, en las mismas tablas/diálogo de
  010/011.
- **US3 (P3)**: depende de que exista el endpoint de creación de US1
  (`justificaciones-handlers.js`) y de los mismos puntos de UI que US1/US2 para
  ofrecer "Revertir".

### Within Each User Story

- Tests antes de implementación (Principio IV) — deben fallar primero.
- Dominio (justificacion.js, jornada.js, resumen-presentismo.js) → persistencia
  (repositorio) → servicio → view-model/handler → cliente frontend → componente →
  integración en la UI existente → tests de componente.

### Parallel Opportunities

- T002, T003, T005, T008 (tests unitarios de Foundational) en paralelo entre sí
  (archivos distintos).
- T012 (wiring) en paralelo con T010/T011 una vez que T004 está listo.
- Dentro de cada historia, los tests marcados [P] en paralelo entre sí.
- T016/T017 (US1), T024/T025/T026 (US2), T030/T032 (US3) en paralelo con otras tareas
  de su fase que no dependan de ellas.
- Tras Foundational, US1 y el backend de US2 (T020-T023) pueden avanzar en paralelo
  por personas distintas; US3 solo puede empezar su handler (T027-T029) una vez que
  exista `justificaciones-handlers.js` de US1 (T015).

---

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo:
Task: "Contract test GET /api/motivos-ausencia + POST /api/justificaciones in tests/contract/web-api-justificaciones.test.js"
Task: "Integration test US1 in tests/integration/justificacion.integration.test.js"

# Piezas de frontend de US1 en paralelo (antes de integrarlas en TablaFichadasHoy):
Task: "Create frontend/src/api/justificaciones-client.js"
Task: "Create frontend/src/components/FormularioJustificacion.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup (T001).
2. Completar Phase 2: Foundational (T002–T012, crítica: incluye el crédito de horas
   FR-013/FR-014 y el señalado FR-010).
3. Completar Phase 3: US1 (T013–T019).
4. **DETENER Y VALIDAR**: correr el Escenario 1 de `quickstart.md`.
5. Demo/deploy si está listo — ya permite registrar el motivo de una ausencia con su
   clasificación de pago.

### Incremental Delivery

1. Setup + Foundational → catálogo, dominio y crédito de horas calibrados.
2. US1 → validar (Escenario 1-2 de quickstart) → demo (MVP: registrar Justificación,
   día único o rango).
3. US2 → validar (Escenario 2, columnas del resumen) → demo (consultar motivo y
   condición de pago).
4. US3 → validar (Escenario 3) → demo (revertir y volver a justificar).
5. Polish → edge cases cruzados, quickstart completo (Escenario 4 y verificación
   transversal) y suites totales en verde.

### Parallel Team Strategy

Con más de una persona, tras Foundational: una persona lleva US1 completa (backend +
UI); al quedar T011 y T015 disponibles, otra puede tomar US2 (columnas del resumen:
dominio + view-model + UI) y una tercera puede dejar preparado el backend de US3
(T027-T029, depende solo de T015), coordinando solo los toques convergentes a
`TablaFichadasHoy.jsx`/`DialogoDetalleEmpleado.jsx` (T018, T025, T031).
