# Tasks: Página "Resumen del Período"

**Input**: Design documents from `/specs/011-resumen-periodo/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/web-api.md](contracts/web-api.md), [quickstart.md](quickstart.md)

**Tests**: Incluidos. La Constitución (Principio IV) exige test-first en capas
críticas; la proyección de acumulados alimenta la revisión previa a liquidación, así
que el dominio nuevo (`resumen-periodo.js`) se trata como crítico — mismo criterio
que 004/010.

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

Sin tareas de setup: no hay dependencias nuevas, variables de entorno ni cambios de
estructura (la feature reutiliza el contexto web y el dominio ya cableados por 010).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la proyección pura de acumulados y detalle, base de las tres historias.

**⚠️ CRITICAL**: ninguna historia puede completarse sin esta fase.

- [X] T001 [P] Tests unitarios de `proyectarResumenPeriodo({ resumen, hoy })` con
  fixtures derivados de los Acceptance Scenarios de US1 (completas, incompletas
  vencidas, ausencias solo en Laborable vencido, día futuro NO cuenta, tarde por
  entrada fuera de margen, tarde anulada por corrección de entrada, retiro
  anticipado por pausa `tipo`, correcciones vigentes, coherencia fila↔detalle
  SC-002) en `tests/unit/presentismo-resumen-periodo.test.js` — DEBEN fallar antes
  de T003 (Principio IV)
- [X] T002 Extraer el predicado compartido de "entrada fuera de margen de apertura"
  (regla `TARDE` de `src/presentismo/domain/situacion-dia.js`) a un helper exportado
  reutilizable por ambos módulos (research.md §2), sin cambiar el comportamiento de
  010 (las suites existentes de situacion-dia deben seguir verdes)
- [X] T003 Implementar `proyectarResumenPeriodo({ resumen, hoy })` y
  `esLlegadaTarde(jornada, params)` en
  `src/presentismo/domain/resumen-periodo.js` (data-model.md: fila de acumulados +
  `detalle[]` del mismo arreglo filtrado por `fecha <= hoy`) — depende de T001, T002
- [X] T004 Agregar `calcularResumenPeriodo(periodo, legajos, hoy)` a
  `src/presentismo/service/calcular-presentismo-service.js`: por legajo llama
  `calcularEmpleado` y aplica la proyección; suma tramos Q1+Q2 en una fila mensual
  para quincenales (research.md §3); legajo `sinCalculo` → fila con anomalía —
  depende de T003

**Checkpoint**: la proyección está calibrada y disponible desde el servicio; las
historias pueden avanzar en orden de prioridad.

---

## Phase 3: User Story 1 - Ver el resumen del período por empleado (Priority: P1) 🎯 MVP

**Goal**: un administrador ve, para el período seleccionado, una fila por empleado
con los 7 acumulados (horas, completas, incompletas, ausencias, llegadas tarde,
retiros anticipados, correcciones).

**Independent Test**: con fichadas/correcciones/pausas cargadas para un período,
`GET /api/resumen-periodo` devuelve las filas correctas y la página las renderiza,
sin necesitar el diálogo (US2) ni el selector (US3).

### Tests for User Story 1

- [X] T005 [P] [US1] Test de contrato para `GET /api/resumen-periodo` (200 con la
  forma de `VistaResumenPeriodo`, fila con `anomalia` para legajo sin categoría,
  filas vacías con padrón vacío, 400 `PERIODO_INVALIDO`, 404
  `CALENDARIO_NO_GENERADO`, sin rawHex/biométricos) en
  `tests/contract/web-api-resumen-periodo.test.js` — DEBE fallar antes de T008
- [X] T006 [P] [US1] Test de integración US1 en
  `tests/integration/resumen-periodo.integration.test.js`: escenarios 1.2–1.5 del
  spec (ausencia por día laborable sin fichadas, 2 llegadas tarde, corrección
  prevalece en horas y anula la tarde, día futuro no cuenta) + verificación
  transversal de solo lectura (SC-005: el archivo del período no cambia tras los
  GET) — DEBE fallar antes de T008

### Implementation for User Story 1

- [X] T007 [US1] Agregar `construirVistaResumenPeriodo({ periodo, periodos, filas,
  nombres })` a `src/web/view-model.js` (forma `FilaResumenPeriodo` de
  data-model.md; `horasTrabajadas` en minutos, nombre del padrón como único dato
  personal) — depende de T004
- [X] T008 [US1] Crear `src/web/api/resumen-periodo-handlers.js` con
  `GET /api/resumen-periodo` (query `periodo` opcional con default al más reciente,
  FR-002; validaciones y códigos de contracts/web-api.md) y registrarlo en
  `src/web/server.js` — depende de T007; hace pasar T005/T006
- [X] T009 [P] [US1] Crear `frontend/src/api/resumen-periodo-client.js` con
  `obtenerResumen(periodo?)` (mismo patrón que `fichadas-hoy-client.js`)
- [X] T010 [P] [US1] Crear `frontend/src/components/TablaResumenPeriodo.jsx`:
  fila por empleado con los 7 indicadores + anomalía distinguible; horas
  formateadas H:MM (mismo helper/criterio que `TablaFichadasHoy`); componente de
  presentación puro con `onSeleccionar(fila)` opcional
- [X] T011 [US1] Crear `frontend/src/components/PaginaResumenPeriodo.jsx`: carga la
  vista al montar (período default), estados cargando/con-datos/error con
  reintento, renderiza `TablaResumenPeriodo` — depende de T009, T010
- [X] T012 [US1] Agregar la pestaña "Resumen período" en `frontend/src/App.jsx`
  montando `PaginaResumenPeriodo` (mismo patrón de pestañas sin librería de ruteo)
  — depende de T011
- [X] T013 [P] [US1] Tests de componente para `TablaResumenPeriodo`
  (indicadores por fila, anomalía, formato de horas) en
  `frontend/src/components/TablaResumenPeriodo.test.jsx` y para
  `PaginaResumenPeriodo` (carga, error, reintento) en
  `frontend/src/components/PaginaResumenPeriodo.test.jsx`

**Checkpoint**: US1 entrega el resumen de solo lectura, completo y demostrable.

---

## Phase 4: User Story 2 - Ver el detalle de fichadas de un empleado (Priority: P2)

**Goal**: clic en una fila abre un diálogo modal con el detalle día por día
(fecha, clasificación, entrada/salida, pausas con tipo, horas, estado), señalando
correcciones y retiros anticipados.

**Independent Test**: sobre el resumen de US1, `GET /api/resumen-periodo/{legajo}`
devuelve los días vencidos coherentes con la fila (SC-002); en la UI el diálogo se
abre por clic y se cierra por botón/Escape/clic fuera sin efecto.

### Tests for User Story 2

- [X] T014 [P] [US2] Test de contrato para `GET /api/resumen-periodo/{legajo}`
  (200 con `dias[]` ordenados y horas 'HH:MM', 400 `LEGAJO_INVALIDO`, 409
  `EMPLEADO_SIN_CATEGORIA`, 404 `CALENDARIO_NO_GENERADO`) en
  `tests/contract/web-api-resumen-periodo.test.js` — DEBE fallar antes de T016
- [X] T015 [P] [US2] Test de integración US2 en
  `tests/integration/resumen-periodo.integration.test.js`: día corregido con
  `corregida: true`, retiro anticipado distinguible de pausa intermedia en
  `pausas[].tipo`, y coherencia SC-002 (Σ `dias[].horas` = fila; conteos de la fila
  derivables de `dias[]`) — DEBE fallar antes de T016

### Implementation for User Story 2

- [X] T016 [US2] Agregar `construirDetalleEmpleado(...)` a `src/web/view-model.js`
  (forma `VistaDetalleEmpleado`/`DetalleJornada`, horas 'HH:MM') e implementar
  `GET /api/resumen-periodo/{legajo}` en
  `src/web/api/resumen-periodo-handlers.js` — depende de T008; hace pasar T014/T015
- [X] T017 [P] [US2] Agregar `obtenerDetalle(legajo, periodo?)` a
  `frontend/src/api/resumen-periodo-client.js`
- [X] T018 [US2] Crear `frontend/src/components/DialogoDetalleEmpleado.jsx`: pide el
  detalle al abrir (estados cargando/error), lo muestra dentro del `Dialogo` modal
  reutilizable (010 it. 2) con botón cerrar; días corregidos y retiros señalados —
  depende de T017
- [X] T019 [US2] Integrar en `PaginaResumenPeriodo.jsx`: clic en fila sin anomalía
  abre `DialogoDetalleEmpleado` (filas con anomalía no abren); cerrar vuelve al
  resumen sin efecto — depende de T018, T011
- [X] T020 [P] [US2] Tests de componente para `DialogoDetalleEmpleado` (render del
  detalle, cierre por botón/Escape sin efecto, señalado de corregidos/retiros) en
  `frontend/src/components/DialogoDetalleEmpleado.test.jsx`

**Checkpoint**: US1 y US2 funcionan de forma independiente y en conjunto.

---

## Phase 5: User Story 3 - Cambiar de período (Priority: P3)

**Goal**: un selector de período (solo períodos con calendario generado, default el
más reciente) actualiza la tabla sin recargar la aplicación.

**Independent Test**: con dos períodos con datos, alternar el selector refleja los
acumulados de cada uno; un período con calendario pero sin fichadas muestra
acumulados en 0 con las ausencias del calendario.

### Tests for User Story 3

- [X] T021 [P] [US3] Test de integración US3 en
  `tests/integration/resumen-periodo.integration.test.js`: dos períodos generados →
  el GET de cada uno devuelve sus propios acumulados; período con calendario sin
  fichadas → acumulados 0 y ausencias según días laborables vencidos — DEBE fallar
  antes de T022 solo si el backend aún no cubre el caso (el GET por período ya
  existe desde T008; este test puede nacer verde y vale como regresión)

### Implementation for User Story 3

- [X] T022 [P] [US3] Crear `frontend/src/components/SelectorPeriodo.jsx`:
  desplegable con `periodos` de la vista (formato legible "Julio 2026"), valor
  actual `periodo`; componente de presentación puro con `onCambiar(periodo)`
- [X] T023 [US3] Integrar el selector en `PaginaResumenPeriodo.jsx`: estado de
  período seleccionado, recarga de la vista al cambiar (SC-003, sin recargar la
  aplicación) — depende de T022, T011
- [X] T024 [P] [US3] Tests de componente para `SelectorPeriodo` (opciones, cambio) y
  el caso "cambiar período recarga la tabla" en
  `frontend/src/components/SelectorPeriodo.test.jsx` y
  `frontend/src/components/PaginaResumenPeriodo.test.jsx`

**Checkpoint**: las 3 historias funcionan de forma independiente y en conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Test de rendimiento (SC-004): fixture sintético de 500 legajos →
  `GET /api/resumen-periodo` responde en <10 s, en
  `tests/integration/resumen-periodo.integration.test.js` (o archivo de performance
  aparte si el tiempo de suite lo justifica); si excede, aplicar la optimización
  local de research.md §6 (cachear calendario/correcciones/pausas por request)
- [X] T026 Ejecutar manualmente los 3 escenarios de `quickstart.md` de punta a punta
  (incluidas las verificaciones de solo lectura SC-005 y rendimiento SC-004) y
  registrar el resultado en el propio `quickstart.md`
- [X] T027 [P] Correr las suites completas (backend `node --test` y frontend
  `npx vitest run`) confirmando que nada de 001–010 se rompe

---

## Phase 7: Cambios post-entrega (2026-07-20)

**Nota de documentación retroactiva**: ambos cambios ya estaban implementados y
verificados de punta a punta (backend 418/418, frontend 84/84, chequeo manual contra
datos reales del repo) antes de registrar esta fase — se documenta el trabajo tal como
se hizo, todas las tareas quedan marcadas `[X]`. Detalle de diseño en research.md §7.

- [X] T028 [P] Granularidad configurable por `.env` (FR-013): `PRESENTISMO_RESUMEN_PERIODO`
  (`MENSUAL`|`QUINCENAL`) en `src/web/wiring.js`; `fechaEnTramo(fecha, tramo)` en
  `src/presentismo/domain/periodo-liquidacion.js`; parámetro `{ tramo }` en
  `calcularResumenPeriodo` (`calcular-presentismo-service.js`); expansión/validación de
  `YYYYMM-Q1`/`YYYYMM-Q2` en `src/web/api/resumen-periodo-handlers.js`; etiquetas de
  quincena en `frontend/src/components/SelectorPeriodo.jsx`. Tests: unit
  (`presentismo-periodo-liquidacion.test.js`), contract
  (`web-api-resumen-periodo.test.js`), componente (`SelectorPeriodo.test.jsx`,
  `PaginaResumenPeriodo.test.jsx`).
- [X] T029 [P] Detalle: entrada/salida muestran la hora real fichada (o la corregida
  vigente), no la efectiva ajustada por tolerancia — `entradaConsiderada`/
  `salidaConsiderada` en `src/presentismo/domain/resumen-periodo.js`. Tests: unit
  (`presentismo-resumen-periodo.test.js`), contract
  (`web-api-resumen-periodo.test.js`).

**Checkpoint**: quincena configurable y hora real en el detalle, sin romper US1–US3.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: sin dependencias — BLOQUEA las tres historias.
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: su backend (T016) depende del handler base de US1 (T008); su UI
  (T019) depende de la página de US1 (T011).
- **US3 (Phase 5)**: el backend por período ya existe desde T008; solo agrega UI
  sobre la página de US1 (T023 depende de T011).
- **Polish (Phase 6)**: depende de las historias entregadas.

### User Story Dependencies

- **US1 (P1)**: solo Foundational.
- **US2 (P2)**: independiente de US3; converge con US1 en
  `resumen-periodo-handlers.js`, el cliente y `PaginaResumenPeriodo.jsx`.
- **US3 (P3)**: independiente de US2; converge con US1 en la página.

### Within Each User Story

- Tests antes de implementación (Principio IV) — deben fallar primero (T021 es la
  excepción documentada: regresión que puede nacer verde).
- Dominio → servicio → view-model/handler → cliente frontend → componente →
  integración en página → tests de componente.

### Parallel Opportunities

- T001 y T002 (Foundational) en paralelo (archivos distintos).
- Dentro de cada historia, los tests marcados [P] en paralelo entre sí.
- T009/T010 (US1), T017 (US2), T022 (US3) en paralelo con otras tareas de su fase
  que no dependan de ellas.
- Tras T008 + T011, los pares (US2: T014–T020) y (US3: T021–T024) pueden avanzar en
  paralelo por personas distintas; coordinar en serie solo los toques convergentes a
  `PaginaResumenPeriodo.jsx` (T019, T023) y sus tests.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo:
Task: "Contract test GET /api/resumen-periodo in tests/contract/web-api-resumen-periodo.test.js"
Task: "Integration test US1 in tests/integration/resumen-periodo.integration.test.js"

# Piezas de frontend de US1 en paralelo (antes de integrarlas en la página):
Task: "Create frontend/src/api/resumen-periodo-client.js"
Task: "Create frontend/src/components/TablaResumenPeriodo.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 2: Foundational (T001–T004, crítica).
2. Completar Phase 3: US1 (T005–T013).
3. **DETENER Y VALIDAR**: correr el Escenario 1 de `quickstart.md`.
4. Demo/deploy si está listo — ya es una vista de revisión de período útil sin
   diálogo ni selector.

### Incremental Delivery

1. Foundational → base calibrada.
2. US1 → validar → demo (MVP: resumen del período más reciente).
3. US2 → validar → demo (agrega el detalle por empleado).
4. US3 → validar → demo (agrega el cambio de período).
5. Polish → rendimiento SC-004, quickstart completo y suites totales en verde.

### Parallel Team Strategy

Con más de una persona, tras Foundational: una persona lleva US1 completa (incluida
la página); al quedar T008 y T011 disponibles, otras dos pueden tomar US2 (detalle:
API + diálogo) y US3 (selector) en paralelo, coordinando solo la integración final
en `PaginaResumenPeriodo.jsx`.
