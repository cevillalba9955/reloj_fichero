# Tasks: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature**: `023-ocultar-fichadas-vacaciones` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Test policy**: TDD para el cambio de dominio (mismo hábito Red-Green del repo,
research.md §2-§3): los casos nuevos de `presentismo-informe-cierre.test.js` se
escriben primero, en rojo, antes de tocar `informe-cierre.js`.

**Convención de rutas**: single project (web app); dominio en
`src/presentismo/domain/`, tests en `tests/`. Sin cambios de frontend (research.md §5).

---

## Phase 1: Setup

- [X] T001 Confirmar la línea base: correr en verde
  `node --test tests/unit/presentismo-informe-cierre.test.js tests/unit/presentismo-resumen-periodo.test.js tests/integration/informe-cierre.integration.test.js`
  antes de tocar código, para partir de un estado conocido (plan.md §Testing).

---

## Phase 2: Foundational

**Propósito**: N/A para esta feature — no hay andamiaje compartido nuevo entre
historias. El único cambio de producción (`informe-cierre.js`) es en sí mismo
el contenido de la Historia 1; la Historia 2 es puramente de verificación y no
depende de trabajo previo adicional. Se pasa directo a la Fase 3.

---

## Phase 3: User Story 1 — Emitir un informe de detalle sin fichadas de días de vacaciones (Priority: P1) 🎯 MVP

**Goal**: que el informe de detalle de asistencia (018/021/022) presente un día
`Vacaciones` con fichadas excepcionales exactamente igual que un día de
vacaciones sin ninguna fichada: sin entrada, salida, pausas ni marca de
revisión.

**Independent Test**: con un período que tiene, para un legajo, un día
cubierto por una Asignación de Vacaciones vigente con fichadas registradas ese
día, se emite el informe de cierre (`construirInformeCierre`) y se verifica
que el renglón de ese día en `detalle.secciones[].dias[]` trae
`entrada: null, salida: null, pausas: [], requiereJustificacionRevision: false`.

### Tests for User Story 1 ⚠️

> **Escribir estos tests PRIMERO y confirmar que fallan antes de implementar.**

- [X] T002 [US1] En `tests/unit/presentismo-informe-cierre.test.js`, agregar
  los casos (usando los helpers `dia()`/`filaNormal()` ya existentes en el
  archivo):
  - día con `justificacion.motivoId === MotivoVacaciones.id` (importar
    `MotivoVacaciones` desde `../../src/presentismo/domain/vacaciones.js`),
    `entrada`/`salida` numéricas (fichadas completas) y
    `requiereJustificacionRevision: true` → el renglón de `renglonDe`/
    `construirInformeCierre` debe traer `entrada: null, salida: null,
    pausas: [], requiereJustificacionRevision: false` (FR-001, FR-002 escenario 1).
  - mismo caso con sólo `entrada` numérica y `salida: null` (fichada de
    entrada sin salida) → mismo resultado oculto (FR-002 escenario 2, edge case
    "varias fichadas / entrada sin salida").
  - mismo `justificacion.motivoId === MotivoVacaciones.id` pero SIN fichadas
    (`entrada: null, salida: null, requiereJustificacionRevision: false` desde
    el origen) → el renglón resultante es idéntico byte a byte al de los dos
    casos anteriores (FR-002 escenario 3, paridad).
  - control negativo: un día con `requiereJustificacionRevision: true` y una
    `justificacion` de motivo DISTINTO a `MotivoVacaciones.id` (p. ej.
    `'sin_aviso'`) → el renglón conserva su `entrada`/`salida`/
    `requiereJustificacionRevision: true` sin cambios (confirma que el
    ocultamiento es específico de Vacaciones, no de cualquier revisión
    pendiente; FR-007 relacionado).
  - `filaResumenDe`/`resumen.filas[]` de la fila que contiene el día oculto:
    sus contadores (`vacaciones`, `ausencias`, `horasTrabajadas`) no cambian
    respecto de los mismos datos de entrada (FR-003).

### Implementation for User Story 1

- [X] T003 [US1] En `src/presentismo/domain/informe-cierre.js`: importar
  `MotivoVacaciones` desde `./vacaciones.js` y, dentro de `renglonDe(d)`,
  cuando `d.justificacion?.motivoId === MotivoVacaciones.id`, forzar
  `entrada: null`, `salida: null`, `pausas: []` y
  `requiereJustificacionRevision: false` en el objeto devuelto, dejando el
  resto de los campos (`fecha`, `clasificacion`, `estado`, `horas`,
  `llegadaTarde`, `corregida`, `motivoCorreccion`, `justificacion`) sin tocar
  (data-model.md, research.md §3). No modificar `filaResumenDe`,
  `seccionDetalleDe` ni `construirPendientes` más allá de que ya delegan en
  `renglonDe`.
- [X] T004 [US1] Poner en verde los casos de T002; correr
  `node --test tests/unit/presentismo-informe-cierre.test.js` completo y
  confirmar cero regresiones en los casos preexistentes del archivo.
- [X] T005 [P] [US1] En `tests/integration/informe-cierre.integration.test.js`,
  agregar (o extender, si ya existe un escenario de vacaciones) un caso
  end-to-end: emitir el informe de cierre de un período con un legajo que
  tiene una Asignación de Vacaciones vigente y una fichada excepcional ese
  día; verificar sobre la `VistaInformeCierre` guardada/devuelta que el
  renglón del día no expone `entrada`/`salida`/`pausas` ni
  `requiereJustificacionRevision`, y que `resumen.filas[]` para ese legajo
  cuenta el día en `vacaciones` (no en `ausencias`), igual que antes de esta
  feature (US1 Independent Test, quickstart.md §1).

**Checkpoint**: US1 verde de punta a punta — el informe de detalle ya no
expone fichadas de días de vacaciones (MVP entregable).

---

## Phase 4: User Story 2 — Mantener sin cambios la revisión en las pantallas interactivas (Priority: P2)

**Goal**: confirmar que "Fichadas de Hoy" (010) y "Resumen del Período" (011)
siguen mostrando, sin ningún cambio, la fichada excepcional y la señal de
revisión de un día de vacaciones — el ocultamiento de la Historia 1 es
exclusivo de los documentos de informe.

**Independent Test**: con el mismo día excepcional de la Historia 1, la
proyección de `resumen-periodo.js` (que alimenta ambas pantallas) sigue
devolviendo `entrada`/`salida`/`requiereJustificacionRevision: true` sin
cambios.

- [X] T006 [US2] Correr
  `node --test tests/unit/presentismo-resumen-periodo.test.js tests/contract/web-api-resumen-periodo.test.js tests/integration/resumen-periodo.integration.test.js`
  y confirmar que pasan sin ninguna modificación de código en
  `src/presentismo/domain/resumen-periodo.js` ni en los handlers de
  `fichadas-hoy`/`resumen-periodo` (FR-004; `resumen-periodo.js` no se toca en
  ninguna tarea de este plan, así que esto es una verificación de no-regresión,
  no requiere tests nuevos: los casos existentes —`vacaciones cuenta la
  Justificación-espejo…` y `requiereJustificacionRevision se expone en el
  detalle del día`, `tests/unit/presentismo-resumen-periodo.test.js:277` y
  `:301`— ya cubren por separado cada mitad del escenario combinado).
- [X] T007 [US2] En `tests/unit/presentismo-resumen-periodo.test.js`, agregar
  un único caso combinado que junte ambas condiciones ya cubiertas por
  separado en T006: un día con `justificacion.motivoId === MotivoVacaciones.id`,
  `entrada`/`salida` numéricas (fichada excepcional) y
  `requiereJustificacionRevision: true` → `proyectarResumenPeriodo` expone
  `detalle[0].entrada`, `detalle[0].salida` y
  `detalle[0].requiereJustificacionRevision === true` sin cambios, y
  `r.vacaciones === 1` / no suma a `r.ausencias` (documenta explícitamente,
  para esta feature, el contrato de no-modificación de FR-004).

**Checkpoint**: ambas historias verdes — US1 oculta en los informes, US2
confirma que las pantallas interactivas no perdieron la señal de revisión.

---

## Phase 5: Polish & Cross-Cutting

- [X] T008 [P] Correr la suite completa `npm test` (o `node --test tests/`) y
  confirmar cero regresiones fuera del alcance de esta feature.
- [X] T009 Ejecutar la validación manual de `quickstart.md` §2 (API) y §3 (UI):
  confirmar en pantalla que "Fichadas de Hoy"/"Resumen del Período" no
  cambiaron y que el informe de cierre (vista + PDF) oculta el día de
  vacaciones excepcional. **Nota de ejecución**: el escenario §2 (API) ya
  queda ejecutado íntegramente por el test de integración de T005 (servidor
  real, misma llamada HTTP, entorno aislado); no se repitió a mano contra
  `.env`/`PRESENTISMO_REPO_DIR=./data` (datos locales reales) para no escribir
  una asignación de vacaciones sobre datos operativos reales. El paso §3 (UI)
  se da por cubierto por inspección de código (research.md §5): cero cambios
  de frontend, y `InformeCierreContenido.jsx`/`InformeCierrePrintable.jsx` ya
  renderizan `entrada`/`salida`/`pausas`/`requiereJustificacionRevision` de
  forma genérica, sin lógica propia de Vacaciones que pudiera necesitar
  verificación visual adicional.
- [X] T010 Revisar que ningún comentario/documentación interna de
  `src/presentismo/domain/informe-cierre.js` quede desactualizado tras el
  cambio (agregar una nota breve, en el estilo ya usado en el archivo, sobre
  el ocultamiento de FR-001/FR-002 junto a `renglonDe`). Ya agregada como
  parte de T003 (comentario `023-ocultar-fichadas-vacaciones` sobre
  `esVacaciones`/`renglonDe`).

---

## Dependencies & Execution Order

- **Setup (T001)** → antes de todo.
- **Foundational (Fase 2)** → N/A, no bloquea nada.
- **US1 (T002–T005)** → MVP; depende de Setup. Entrega el ocultamiento en los
  tres informes generados (018/021/022, mismo punto de código, research.md §4).
- **US2 (T006–T007)** → independiente de US1 en código (no toca
  `informe-cierre.js`); puede correr en paralelo tras Setup, pero
  conceptualmente confirma que US1 no tuvo efectos colaterales, así que se
  lista después.
- **Polish (T008–T010)** → al final, tras US1 y US2.

## Parallel Opportunities

- T005 (integración de US1) puede avanzar en paralelo a T006/T007 (US2, otro
  archivo) una vez completado T004.
- T008 y T010 en paralelo (verificación vs. documentación).

## Implementation Strategy

- **MVP = US1** (T001–T005): resuelve el pedido del usuario (ocultar fichadas
  en los tres informes generados) y es entregable por sí sola.
- **US2** (T006–T007) es la red de seguridad que confirma, con un test
  explícito, que las pantallas interactivas (010/011) no perdieron nada — sin
  ella, un futuro refactor de `resumen-periodo.js` podría romper FR-004 sin
  que ningún test lo detecte.
- Polish cierra con la suite completa y la validación manual de
  `quickstart.md`.

## Trazabilidad FR → Tasks

| FR | Tasks |
|----|-------|
| FR-001 | T002, T003, T004, T005 |
| FR-002 | T002, T003, T004 |
| FR-003 | T002 (fila resumen), T005 |
| FR-004 | T006, T007 |
| FR-005 | T003 (no se borra nada, sólo se fuerza el valor del renglón; la fichada real sigue en el estado operativo) |
| FR-006 | T002 (caso "entrada sin salida"), T003 |
| FR-007 | T002 (control negativo con otro motivo de justificación) |
