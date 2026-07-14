---
description: "Task list for feature 007 — IU: Calendario Mensual con Período Activo"
---

# Tasks: IU — Pantalla Principal: Calendario Mensual con Período Activo

**Input**: Design documents from `/specs/007-ui-calendario-mensual/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: SÍ se incluyen. El Principio IV de la constitución exige tests en la capa de
datos/acceso (el nuevo método de repositorio y la API); la UI usa tests de componente más
flexibles. Los tests de capa crítica se escriben **antes** de su implementación (Red-Green).

**Organization**: agrupadas por User Story para implementación y testeo independientes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1..US4 según [spec.md](./spec.md); Setup/Foundational/Polish sin etiqueta
- Rutas de archivo exactas en cada descripción

## Path Conventions

Aplicación **web (frontend + backend)** sobre el repo Node ESM existente:
- Backend: `src/web/` (API `node:http`) + `src/presentismo/` (dominio reutilizado, feat. 004)
- Frontend: `frontend/` (React 18 + Vite + Vitest, workspace propio)
- Tests backend: `tests/` (raíz, `node --test`); tests frontend: `frontend/src/**/*.test.jsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicialización del workspace de frontend y del esqueleto del backend web.

- [ ] T001 Agregar scripts npm y esqueleto de backend web: en `package.json` (raíz) añadir `"web": "node --env-file-if-exists=.env src/web/server.js"`, y crear la estructura de directorios `src/web/` y `src/web/api/`.
- [ ] T002 [P] Scaffold del workspace frontend: crear `frontend/package.json` (deps `react`, `react-dom`; devDeps `vite`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`), `frontend/index.html` y `frontend/vite.config.js` (proxy dev de `/api` al backend + bloque `test` con entorno `jsdom`).
- [ ] T003 [P] Configurar el arranque y los tests del frontend: `frontend/vitest.setup.js` (matchers de jest-dom) y `frontend/src/main.jsx` (monta `<App/>` en `#root`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: capa de datos + API + cliente de datos que TODAS las historias consumen.

**⚠️ CRITICAL**: ninguna historia puede completarse hasta terminar esta fase.

- [ ] T004 [P] Documentar el puerto `listarPeriodos(): Promise<string[]>` en `src/presentismo/ports/index.js` (agregar a `METODOS.PresentismoRepository` y su JSDoc).
- [ ] T005 [P] Test unitario (primero, debe FALLAR) de `listarPeriodos` en `tests/unit/file-presentismo-repository-listar.test.js`: devuelve `YYYYMM` con calendario no nulo, ordenados; ignora archivos no `^\d{6}\.json$`; `[]` si el directorio está vacío.
- [ ] T006 Implementar `listarPeriodos()` en `src/presentismo/adapters/file-presentismo-repository.js` (escanea `repoDir`, filtra `^\d{6}\.json$` con `calendario` no nulo, devuelve `YYYYMM` ordenados). Hace pasar T005. (dep: T004, T005)
- [ ] T007 [P] Crear la factory de cableado `src/web/wiring.js` que resuelve `repoDir`/config/logger (reutilizando la lógica de `src/cli/calcular-presentismo.js`) y construye repositorio + servicio de presentismo. (dep: T006)
- [ ] T008 [P] Crear el armador de view-model `src/web/view-model.js`: construye `VistaCalendarioMes` (días con `diaSemana`/`esHoy`/`enPeriodoActivo`/`resaltado`, `hoy` null si la fecha no cae en el mes, `periodoActivo` con `Tramo=Mes` vía `periodo-liquidacion.recortar`, `leyenda`, `esUltimoGenerado`), según [data-model.md](./data-model.md). Sin datos personales (FR-014).
- [ ] T009 [P] Crear el router HTTP mínimo `src/web/api/router.js` (ruteo por método+path para `/api/*`, parseo de body JSON, forma de error `{error:{codigo,mensaje}}`).
- [ ] T010 Implementar los handlers GET en `src/web/api/calendario-handlers.js`: `GET /api/calendarios` (usa `listarPeriodos` → `{periodos, ultimo}`) y `GET /api/calendarios/:periodo` (usa `wiring`+`view-model` → `VistaCalendarioMes`; 404 `CALENDARIO_NO_GENERADO`; 400 período inválido), según [contracts/web-api.md](./contracts/web-api.md). (dep: T007, T008)
- [ ] T011 Implementar `src/web/server.js` (`node:http`): monta el router en `/api`, sirve los estáticos del build de `frontend/`, puerto configurable por entorno. (dep: T009, T010)
- [ ] T012 [P] Test de contrato de los GET en `tests/contract/web-api-calendario.test.js`: forma de `{periodos, ultimo}`, forma de `VistaCalendarioMes`, `hoy` null fuera de mes, ausencia de nombres/legajos/fichadas (FR-014), 404 en mes no generado. (dep: T010, T011)
- [ ] T013 [P] Crear el cliente de datos del frontend `frontend/src/api/calendario-client.js` con los métodos GET (`listarCalendarios()`, `obtenerCalendario(periodo)`). Es el ÚNICO acceso a datos de la UI (Principio I).

**Checkpoint**: la API sirve la lista de meses y la vista de un mes; el frontend puede
obtenerlas. Aún no hay pantalla renderizada.

---

## Phase 3: User Story 1 - Ver de un vistazo el calendario laboral del mes (Priority: P1) 🎯 MVP

**Goal**: al abrir la app, se ve la grilla del último mes generado con días clasificados,
hábiles y feriados resaltados, hoy señalado (si aplica), leyenda, y estado vacío global.

**Independent Test**: abrir con al menos un calendario generado → grilla del `YYYYMM` más
alto, 28–31 días ubicados por día de semana, hábiles/feriados resaltados, leyenda visible;
sin ningún calendario → estado vacío claro sin error.

### Tests for User Story 1 (escribir primero)

- [ ] T014 [P] [US1] Test de componente de `App` (carga/vacío-global/error) en `frontend/src/App.test.jsx`: pide lista → carga el último; con `ultimo===null` muestra estado vacío global; error de red → mensaje con reintento.
- [ ] T015 [P] [US1] Test de componente de `GrillaMes` en `frontend/src/components/GrillaMes.test.jsx`: cantidad exacta de días (28/29/30/31) y ubicación por `diaSemana`, huecos iniciales/finales sin días de meses vecinos (SC-007).
- [ ] T016 [P] [US1] Test de componente de `CeldaDia` en `frontend/src/components/CeldaDia.test.jsx`: cada clasificación expone color + 2º recurso (texto/`aria-label`) (FR-004); `esHoy` marca por forma; sin `hoy` no marca (FR-007).
- [ ] T017 [P] [US1] Test de componente de `Leyenda` en `frontend/src/components/Leyenda.test.jsx`: un ítem por clave recibida (hábil/no-laborable/feriado/hoy/período activo) (FR-006).

### Implementation for User Story 1

- [ ] T018 [P] [US1] Componente `frontend/src/components/CeldaDia.jsx`: número de día, clasificación por color + etiqueta/ícono + `aria-label`, marca de `esHoy` por forma (FR-003/004/005/007).
- [ ] T019 [P] [US1] Componente `frontend/src/components/Leyenda.jsx` que renderiza los `LeyendaItem` (FR-006).
- [ ] T020 [P] [US1] Componente `frontend/src/components/EstadoVacio.jsx` (mes/estado sin calendario generado, sin acción de reclasificar) (FR-011/018).
- [ ] T021 [US1] Componente `frontend/src/components/GrillaMes.jsx`: grilla de 7 columnas que ubica cada `CeldaDia` por `diaSemana` con huecos correctos (FR-002). (dep: T018)
- [ ] T022 [US1] Orquestación en `frontend/src/App.jsx`: carga el último mes vía cliente, renderiza `GrillaMes`+`Leyenda`, maneja estados cargando/error/vacío-global (US1). (dep: T013, T019, T020, T021)
- [ ] T023 [P] [US1] Estilos de grilla/celda/leyenda en `frontend/src/styles/` (resaltado de hábiles y feriados vs. no laborables, FR-005; marca de hoy por forma).

**Checkpoint**: MVP funcional — se ve el calendario del último mes generado y el estado vacío.

---

## Phase 4: User Story 2 - Identificar el período de liquidación activo (Priority: P2)

**Goal**: la pantalla nombra el período activo (etiqueta + rango) y distingue en la grilla
los días que le pertenecen.

**Independent Test**: mes con período activo → encabezado con etiqueta y rango; días del
período distinguidos; período mes-completo → todos los días dentro; sin período → aviso y
grilla igual.

### Tests for User Story 2 (escribir primero)

- [ ] T024 [P] [US2] Test de componente de `EncabezadoPeriodo` en `frontend/src/components/EncabezadoPeriodo.test.jsx`: con período muestra etiqueta+rango (FR-008); con `periodoActivo===null` indica "sin período activo" (FR-010).
- [ ] T025 [P] [US2] Test de `CeldaDia` (pertenencia) en `frontend/src/components/CeldaDia.periodo.test.jsx`: `enPeriodoActivo` produce una distinción diferenciable de la clasificación (FR-009).

### Implementation for User Story 2

- [ ] T026 [P] [US2] Componente `frontend/src/components/EncabezadoPeriodo.jsx` (etiqueta + rango `desde–hasta`, o aviso sin período) (FR-008/010).
- [ ] T027 [US2] Agregar el tratamiento visual de `enPeriodoActivo` en `frontend/src/components/CeldaDia.jsx` (banda/fondo del rango, distinto de la clasificación) (FR-009). (dep: T018)
- [ ] T028 [US2] Integrar `EncabezadoPeriodo` en `frontend/src/App.jsx` (mostrarlo sobre la grilla) (FR-008/010). (dep: T022, T026)

**Checkpoint**: US1 + US2 funcionan; el usuario ubica el período activo.

---

## Phase 5: User Story 3 - Reclasificar un día del calendario (Priority: P2)

**Goal**: cambiar la clasificación de un día desde la pantalla, con confirmación explícita;
al confirmar persiste vía dominio y la grilla lo refleja.

**Independent Test**: iniciar reclasificación y cancelar → sin cambios ni POST; confirmar →
día cambia, grilla refleja, archivo del período con `reclasificadoManual: true`; en estado
vacío no se ofrece reclasificar.

### Tests for User Story 3 (escribir primero)

- [ ] T029 [P] [US3] Test de contrato/integración del POST en `tests/integration/reclasificar-desde-api.test.js`: `POST /api/calendarios/:periodo/reclasificar` persiste y el GET siguiente refleja el cambio; período inexistente → 404 (FR-018); clasificación inválida/fecha fuera de mes → 400.
- [ ] T030 [P] [US3] Test de componente de `DialogoConfirmarReclasificar` en `frontend/src/components/DialogoConfirmarReclasificar.test.jsx`: cancelar NO dispara POST (día intacto, FR-016); confirmar dispara POST y refresca con la vista devuelta (FR-017).

### Implementation for User Story 3

- [ ] T031 [US3] Agregar el handler `POST /api/calendarios/:periodo/reclasificar` en `src/web/api/calendario-handlers.js` (valida body, llama `service.reclasificarDia`, devuelve `VistaCalendarioMes` actualizada; 400/404 según [contracts/web-api.md](./contracts/web-api.md)). (dep: T010)
- [ ] T032 [P] [US3] Agregar el método `reclasificar(periodo, {fecha, clasificacion, autor})` a `frontend/src/api/calendario-client.js`. (dep: T013)
- [ ] T033 [P] [US3] Componente `frontend/src/components/DialogoConfirmarReclasificar.jsx` (muestra día y cambio propuesto; botones confirmar/cancelar) (FR-016).
- [ ] T034 [US3] Cablear la acción de reclasificar en `frontend/src/components/CeldaDia.jsx` y `frontend/src/App.jsx`: elegir clasificación → abrir diálogo → confirmar → POST → refrescar grilla; deshabilitada en estado vacío (FR-016/017/018). (dep: T031, T032, T033)

**Checkpoint**: US1–US3 funcionan; el calendario es editable con confirmación.

---

## Phase 6: User Story 4 - Consultar el calendario de otros meses (Priority: P3)

**Goal**: navegar a meses anterior/siguiente y volver al mes por defecto; mes sin calendario
muestra estado vacío.

**Independent Test**: desde el mes por defecto, ir a siguiente/anterior → grilla y resaltado
se actualizan; "volver" regresa al último generado; navegar a un mes sin generar → estado
vacío sin error.

### Tests for User Story 4 (escribir primero)

- [ ] T035 [P] [US4] Test de componente de `NavegacionMes` en `frontend/src/components/NavegacionMes.test.jsx`: anterior/siguiente calculan el `YYYYMM` adyacente; "volver" apunta al último; navegar a mes 404 muestra `EstadoVacio` (FR-011/012).

### Implementation for User Story 4

- [ ] T036 [US4] Componente `frontend/src/components/NavegacionMes.jsx` (controles anterior/siguiente/volver con aritmética de `YYYYMM`) (FR-012).
- [ ] T037 [US4] Integrar la navegación y el estado vacío por mes (respuesta 404) en `frontend/src/App.jsx` (FR-011/012). (dep: T022, T036)

**Checkpoint**: las cuatro historias funcionan de forma independiente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: accesibilidad, documentación y validación end-to-end.

- [ ] T038 [P] Auditoría de accesibilidad sin color (SC-004/FR-004): verificar en escala de grises que clasificación, hoy y período activo siguen distinguibles; ajustar `frontend/src/styles/`.
- [ ] T039 [P] Documentar cómo levantar/compilar la UI (build de `frontend/` + servir con `npm run web`) en la doc del repo (`README.md` y/o `docs/`).
- [ ] T040 Verificar el servido de estáticos en producción: el build de `frontend/` se sirve desde `src/web/server.js` (build → carpeta servida). (dep: T011)
- [ ] T041 Ejecutar la validación de [quickstart.md](./quickstart.md) (los 7 escenarios) y `npm test` + `cd frontend && npm run test` en verde.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar ya.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias.
- **User Stories (Phase 3–6)**: dependen de Foundational. US1 es el MVP y establece el
  "shell" de la pantalla (`App.jsx`, `CeldaDia.jsx`); US2/US3/US4 son incrementos que
  extienden ese shell (dependencia blanda sobre US1), cada uno testeable de forma
  independiente a nivel de componente.
- **Polish (Phase 7)**: depende de las historias que se quieran incluir.

### User Story Dependencies

- **US1 (P1)**: solo Foundational. MVP.
- **US2 (P2)**: Foundational + shell de US1 (integra en `App.jsx`, extiende `CeldaDia.jsx`).
- **US3 (P2)**: Foundational + shell de US1 (agrega POST y acción en `CeldaDia`/`App`).
- **US4 (P3)**: Foundational + shell de US1 (agrega navegación en `App.jsx`).

### Within Each User Story

- Los tests (capa crítica) se escriben y FALLAN antes de implementar.
- Componentes hoja (CeldaDia/Leyenda/EstadoVacio) antes de los contenedores (GrillaMes/App).
- Handler/servicio antes del cableado en la UI.

### Parallel Opportunities

- Setup: T002 y T003 en paralelo.
- Foundational: T004/T005 en paralelo; luego T007/T008/T009 en paralelo; T012/T013 en paralelo.
- US1: tests T014–T017 en paralelo; componentes hoja T018/T019/T020 (+estilos T023) en paralelo.
- US2: T024/T025 en paralelo; US3: T029/T030 y luego T032/T033 en paralelo.
- Con equipo: tras Foundational, un dev por historia (respetando que comparten `App.jsx`).

---

## Parallel Example: User Story 1

```bash
# Tests de US1 juntos (deben fallar primero):
Task: "T014 App test en frontend/src/App.test.jsx"
Task: "T015 GrillaMes test en frontend/src/components/GrillaMes.test.jsx"
Task: "T016 CeldaDia test en frontend/src/components/CeldaDia.test.jsx"
Task: "T017 Leyenda test en frontend/src/components/Leyenda.test.jsx"

# Componentes hoja de US1 juntos:
Task: "T018 CeldaDia.jsx"
Task: "T019 Leyenda.jsx"
Task: "T020 EstadoVacio.jsx"
Task: "T023 estilos en frontend/src/styles/"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRÍTICA — habilita la API y el cliente de datos).
3. Phase 3: US1 → **parar y validar**: se ve el calendario del último mes y el estado vacío.
4. Demo/deploy si está listo.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → validar → demo (MVP: ver el calendario).
3. US2 → validar → demo (período activo).
4. US3 → validar → demo (reclasificar con confirmación).
5. US4 → validar → demo (navegación entre meses).

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Los tests de la capa de datos/API (T005, T012, T029) se escriben primero (Principio IV).
- La UI nunca accede a Oracle/reloj/filesystem del dominio: solo al cliente `/api` (Principio I).
- Ninguna vista expone nombres, legajos ni fichadas (FR-014, Principio V).
- Commit tras cada tarea o grupo lógico; parar en cualquier checkpoint para validar.
