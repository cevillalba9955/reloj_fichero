---

description: "Task list template for feature implementation"
---

# Tasks: Control de Acceso por Roles (Lector / Editor / Configurador)

**Input**: Design documents from `/specs/016-control-acceso-roles/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluidos — el plan compromete cobertura unitaria/contrato/integración
(Technical Context, sección Testing) y el proyecto ya tiene ese patrón en toda
feature anterior (`tests/contract`, `tests/integration`, `tests/unit`,
`*.test.jsx`).

**Organization**: Tareas agrupadas por historia de usuario del spec (US1–US3,
prioridad P1–P3), para poder implementar y probar cada una de forma
independiente. Como los 3 roles son jerárquicos (data-model.md), el gate
`exigirRol('editor'|'configurador', ...)` se aplica una sola vez por ruta
(Fase 3, US1 — es la historia que fija la línea de base restrictiva); US2 y
US3 verifican que ese mismo gate ya deja pasar a Editor/Configurador, sin
volver a tocar el backend.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Web application existente: backend en `src/`, frontend en `frontend/src/`,
tests backend en `tests/` (repo root), tests frontend co-ubicados
(`*.test.jsx` junto al componente) — misma convención que 007/010/011/012/014/015.

---

## Phase 1: Setup (andamiaje compartido de la feature)

**Purpose**: Crear los puntos de entrada (config, ruta, clientes, contexto) vacíos antes de implementar la lógica.

- [ ] T001 [P] Crear `config/roles.example.json` (plantilla, sin nombres reales de APEX) y `config/roles.json` de desarrollo, con la forma `{ "rolPorDefecto": "lector", "mapeo": { "...": "editor", "...": "configurador" } }` (contracts/web-api-acl.md, data-model.md)
- [ ] T002 [P] Crear `src/web/api/acl-handlers.js` con `export function registrarRutas(router, ctx) {}` vacío, y registrarlo en `src/web/server.js` (import + llamada, junto a los demás `registrarRutas*`)
- [ ] T003 [P] Crear `frontend/src/api/acl-client.js` con `export function crearClienteAcl({ fetchImpl, base = '/api' } = {}) {}` vacío (mismo patrón que `frontend/src/api/configuracion-client.js`)
- [ ] T004 [P] Crear `frontend/src/contexto/RolContext.jsx` esqueleto: `RolContext`, `RolProvider` y el hook `useRol()`, sin lógica de fetch todavía

**Checkpoint**: los puntos de entrada existen, vacíos; el resto de la app sigue funcionando exactamente igual que antes de esta feature.

---

## Phase 2: Foundational (bloqueante para las 3 historias)

**Purpose**: Mecanismo de resolución de rol y de autorización que las 3 historias reutilizan (research.md §1–§2, data-model.md).

**⚠️ CRITICAL**: Ninguna historia puede implementarse sin esto.

- [ ] T005 Implementar `loadRolesConfig(path)` en `src/config/roles-config.js`: parsea `config/roles.json`, valida que `rolPorDefecto` y cada valor de `mapeo` sean uno de `lector`/`editor`/`configurador` (fail-fast, mismo estilo que `env-file.js`), expone `{ rolPorDefecto, mapear(rolOrigen) }` (depende de T001)
- [ ] T006 [P] Test unitario de `roles-config.js` en `tests/unit/roles-config.test.js`: carga válida, `rolPorDefecto` inválido, valor de `mapeo` inválido, archivo ausente → todo cae a `lector` (depende de T005)
- [ ] T007 Implementar `src/web/acl/autorizacion.js`: lista `ROLES` ordenada (`lector` < `editor` < `configurador`), `resolverRolActual(req, ctx)` (lee el header configurado — `ctx.aclHeaderRol` —, aplica `ctx.rolesConfig.mapear`, cae a `rolPorDefecto` si el header falta o no está mapeado, FR-004), y `exigirRol(rolMinimo, handler)` (envoltorio de handler del router; lanza `ApiError(403, 'ACCESO_DENEGADO', mensaje)` si el rango no alcanza, FR-009/FR-010) (depende de T005)
- [ ] T008 [P] Test unitario de `autorizacion.js` en `tests/unit/autorizacion.test.js`: `resolverRolActual` con header ausente/desconocido/mapeado a cada uno de los 3 roles; `exigirRol` con rango suficiente e insuficiente para cada combinación (depende de T007)
- [ ] T009 Exponer `rolesConfigPath` (default `./config/roles.json`, override por entorno), `aclHeaderRol` (default `x-apex-rol`, override por entorno) y `rolesConfig` (getter con re-lectura por request, mismo criterio que `motivosAusenciaConfig`) desde `src/web/wiring.js` (depende de T005)
- [ ] T010 Implementar `GET /api/acl/mi-rol` en `src/web/api/acl-handlers.js` — sin `exigirRol`, siempre `200 { rol }` (contracts/web-api-acl.md) (depende de T007, T009, T002)
- [ ] T011 [P] Test de contrato de `GET /api/acl/mi-rol` en `tests/contract/web-api-acl.test.js`: sin header → `lector`; header mapeado → el rol correspondiente; header con valor no mapeado → `lector` (depende de T010)
- [ ] T012 Implementar `obtenerMiRol()` en `frontend/src/api/acl-client.js` (depende de T003)
- [ ] T013 Implementar el fetch inicial (al montar) y `{ rol, puede(rolMinimo) }` en `frontend/src/contexto/RolContext.jsx`; envolver el árbol de `frontend/src/App.jsx` con `RolProvider` (depende de T004, T012)

**Checkpoint**: el mecanismo de resolución de rol funciona de punta a punta (header → API `/api/acl/mi-rol` → contexto de React), pero ninguna ruta de negocio lo exige todavía — es la base común de las 3 historias.

---

## Phase 3: User Story 1 - Ver todo, sin poder modificar nada, como Lector (Priority: P1) 🎯 MVP

**Goal**: aplicar el gate a TODAS las rutas de escritura (→ requieren `editor`) y a TODAS las rutas de Configuración (→ requieren `configurador`, FR-007); ocultar en la interfaz los controles correspondientes; mostrar el rol actual.

**Independent Test**: sin header de rol (o con un valor no mapeado), navegar las 4 secciones operativas viendo su contenido, sin poder completar ninguna operación de escritura ni ver Configuración — ni desde la interfaz ni forzando la API directamente.

### Tests for User Story 1 ⚠️

> Escribir estos tests primero: deben fallar (las rutas todavía no exigen rol) antes de T016-T020.

- [ ] T014 [P] [US1] Test de contrato: rol `lector` (sin header) → `403 ACCESO_DENEGADO` en al menos una ruta de escritura de cada handler (`calendarios/:periodo/generar`, `fichadas-hoy/correcciones`, `justificaciones` POST, `vacaciones/asignaciones` POST) y en `GET /api/configuracion/reloj`, en `tests/contract/web-api-acl.test.js`
- [ ] T015 [P] [US1] Test de integración de los Acceptance Scenarios de US1 (incluye el Edge Case de rol indeterminado) en `tests/integration/control-acceso.integration.test.js`

### Implementation for User Story 1

- [ ] T016 [US1] Envolver `POST /api/calendarios/:periodo/generar|cerrar|reabrir|reclasificar` con `exigirRol('editor', ...)` en `src/web/api/calendario-handlers.js` (depende de T007)
- [ ] T017 [US1] Envolver `POST /api/fichadas-hoy/correcciones|pausas|retiros-anticipados|consultar-reloj` con `exigirRol('editor', ...)` en `src/web/api/fichadas-hoy-handlers.js` (depende de T007)
- [ ] T018 [US1] Envolver `POST`/`DELETE /api/justificaciones` con `exigirRol('editor', ...)` en `src/web/api/justificaciones-handlers.js` (depende de T007)
- [ ] T019 [US1] Envolver `POST /api/vacaciones/asignaciones` y `DELETE /api/vacaciones/asignaciones/:id` con `exigirRol('editor', ...)` en `src/web/api/vacaciones-handlers.js` (depende de T007)
- [ ] T020 [US1] Envolver TODAS las rutas (incluidos los `GET`) de `src/web/api/configuracion-handlers.js` con `exigirRol('configurador', ...)` (FR-007) (depende de T007)
- [ ] T021 [US1] En `frontend/src/components/AppShell.jsx`: mostrar el rol actual (`useRol()`) y ocultar la entrada de navegación "Configuración" salvo `puede('configurador')`; actualizar `AppShell.test.jsx` (depende de T013)
- [ ] T022 [P] [US1] Ocultar/deshabilitar el control de guardar salvo `puede('editor')` en `frontend/src/components/FormularioCorreccion.jsx`; actualizar `FormularioCorreccion.test.jsx` (depende de T013)
- [ ] T023 [P] [US1] Ídem en `frontend/src/components/FormularioPausaRetiro.jsx`; actualizar su test (depende de T013)
- [ ] T024 [P] [US1] Ídem en `frontend/src/components/FormularioJustificacion.jsx`; actualizar su test (depende de T013)
- [ ] T025 [P] [US1] Ídem en `frontend/src/components/FormularioAsignarVacaciones.jsx`; actualizar su test (depende de T013)
- [ ] T026 [US1] Ocultar/deshabilitar los botones generar/cerrar/reabrir/reclasificar salvo `puede('editor')` en `frontend/src/components/PaginaCalendario.jsx` (y `DialogoConfirmarReclasificar.jsx` si dispara la acción directamente); actualizar los tests existentes (depende de T013)

**Checkpoint**: US1 completa — un usuario Lector (o sin rol determinable) puede ver todo y no puede escribir nada, ni siquiera forzando la API directamente.

---

## Phase 4: User Story 2 - Operar el día a día como Editor (Priority: P2)

**Goal**: confirmar que un usuario Editor completa de punta a punta cada operación de escritura y que Configuración le sigue vedada. No agrega gate nuevo: `exigirRol('editor', ...)` (T016-T019) ya deja pasar a `editor` por ser de rango suficiente (data-model.md).

**Independent Test**: con el header mapeado a `editor`, completar corrección, pausa/retiro, justificar/quitar justificación, asignar/revertir vacaciones y generar/cerrar/reabrir un período — todo con éxito; Configuración sigue devolviendo `403`.

### Tests for User Story 2 ⚠️

- [ ] T027 [P] [US2] Test de contrato: rol `editor` → `200` en cada ruta de escritura envuelta en T016-T019, y `403 ACCESO_DENEGADO` en `GET /api/configuracion/reloj`, en `tests/contract/web-api-acl.test.js` (depende de T016, T017, T018, T019, T020)
- [ ] T028 [US2] Test de integración de los Acceptance Scenarios de US2 en `tests/integration/control-acceso.integration.test.js` (depende de T016, T017, T018, T019, T020)
- [ ] T029 [P] [US2] Test de componente: con rol `editor`, los controles de T022-T026 aparecen habilitados (extiende los tests ya actualizados en esas tareas) (depende de T022, T023, T024, T025, T026)

**Checkpoint**: US1 y US2 verificadas de forma independiente (US2 no agrega implementación nueva, solo prueba el gate ya construido en US1 con un rol distinto).

---

## Phase 5: User Story 3 - Administrar la configuración técnica como Configurador (Priority: P3)

**Goal**: confirmar que un usuario Configurador tiene acceso completo a Configuración además de todo lo de Editor. Tampoco agrega gate nuevo: `exigirRol('configurador', ...)` (T020) y `exigirRol('editor', ...)` (T016-T019) ya dejan pasar a `configurador` por ser el rango más alto.

**Independent Test**: con el header mapeado a `configurador`, entrar a Configuración, guardar un cambio (por ejemplo la IP del reloj) y verificar que persiste; todas las operaciones de Editor y Lector siguen funcionando.

### Tests for User Story 3 ⚠️

- [ ] T030 [P] [US3] Test de contrato: rol `configurador` → `200` en todas las rutas de `/api/configuracion/*` (T020) y en las rutas de escritura de T016-T019, en `tests/contract/web-api-acl.test.js` (depende de T020)
- [ ] T031 [US3] Test de integración de los Acceptance Scenarios de US3 en `tests/integration/control-acceso.integration.test.js` (depende de T020)
- [ ] T032 [P] [US3] Test de componente: con rol `configurador`, `AppShell` muestra la entrada "Configuración" (extiende `AppShell.test.jsx` de T021) (depende de T021)

**Checkpoint**: las 3 historias funcionan de forma independiente y en conjunto — control de acceso completo.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end y revisión de higiene de seguridad sobre lo construido en las fases anteriores.

- [ ] T033 [P] Ejecutar los escenarios de `quickstart.md` de punta a punta contra `npm run web` (los 3 roles + el Edge Case de rol indeterminado) y dejar constancia del resultado
- [ ] T034 Revisar que el mensaje de `ACCESO_DENEGADO` en los handlers tocados por T016-T020 no filtre detalles internos (rutas de archivo, contenido de `config/roles.json`) — solo el rol actual y el rol mínimo requerido (Principio V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede arrancar de inmediato.
- **Foundational (Phase 2)**: Depende de Setup — BLOQUEA las 3 historias.
- **User Stories (Phase 3+)**: Todas dependen de Foundational.
  - US1 (Phase 3) debe completarse antes de que US2/US3 tengan algo que verificar (es quien aplica `exigirRol` a las rutas reales).
  - US2 (Phase 4) y US3 (Phase 5) son independientes entre sí una vez que US1 terminó; ambas solo agregan tests contra el gate ya existente.
- **Polish (Phase 6)**: Depende de que US1, US2 y US3 estén completas.

### User Story Dependencies

- **User Story 1 (P1)**: Puede arrancar después de Foundational (Phase 2). Es la única que modifica el backend de negocio (T016-T020) y el frontend de gating (T021-T026).
- **User Story 2 (P2)**: Puede arrancar después de que US1 complete T016-T020 (necesita el gate ya aplicado para tener algo que probar con rol `editor`).
- **User Story 3 (P3)**: Puede arrancar después de que US1 complete T016-T020 (mismo motivo, con rol `configurador`); no depende de US2.

### Within Each User Story

- Tests antes que la implementación que envuelven (T014-T015 antes de T016-T026).
- Backend (T016-T020) antes que frontend de gating (T021-T026) dentro de US1, para que los tests de contrato ya puedan fallar/pasar de forma aislada del frontend.

### Parallel Opportunities

- Todas las tareas [P] de Setup (T001-T004) en paralelo.
- Dentro de Foundational: T006 y T008 en paralelo entre sí (tests unitarios de módulos distintos); T005→T006 y T007→T008 son cadenas separadas hasta que ambas convergen en T009.
- Dentro de US1: T016-T019 en paralelo entre sí (archivos de handlers distintos); T022-T025 en paralelo entre sí (componentes distintos); T020, T021 y T026 no compiten por archivo con las anteriores.
- US2 (Phase 4) y US3 (Phase 5) se pueden trabajar en paralelo una vez que US1 terminó T016-T020.

---

## Parallel Example: User Story 1

```bash
# Backend: envolver los 4 grupos de rutas de escritura en paralelo (archivos distintos)
Task: "Envolver rutas de calendario con exigirRol('editor', ...) en src/web/api/calendario-handlers.js"
Task: "Envolver rutas de fichadas-hoy con exigirRol('editor', ...) en src/web/api/fichadas-hoy-handlers.js"
Task: "Envolver rutas de justificaciones con exigirRol('editor', ...) en src/web/api/justificaciones-handlers.js"
Task: "Envolver rutas de vacaciones con exigirRol('editor', ...) en src/web/api/vacaciones-handlers.js"

# Frontend: gating de los 4 formularios de escritura en paralelo (componentes distintos)
Task: "Ocultar/deshabilitar salvo puede('editor') en frontend/src/components/FormularioCorreccion.jsx"
Task: "Ocultar/deshabilitar salvo puede('editor') en frontend/src/components/FormularioPausaRetiro.jsx"
Task: "Ocultar/deshabilitar salvo puede('editor') en frontend/src/components/FormularioJustificacion.jsx"
Task: "Ocultar/deshabilitar salvo puede('editor') en frontend/src/components/FormularioAsignarVacaciones.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup.
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias).
3. Completar Phase 3: User Story 1.
4. **PARAR Y VALIDAR**: probar US1 de forma independiente (`quickstart.md`, sección US1) — el sistema ya es seguro por defecto (todo Lector) aunque APEX ni siquiera exista todavía.
5. Desplegar/demostrar si está listo.

### Incremental Delivery

1. Setup + Foundational → mecanismo de rol listo, sin gates aplicados.
2. + US1 → gate aplicado a todo, sistema seguro por defecto (MVP).
3. + US2 → confirmado que Editor opera sin fricción.
4. + US3 → confirmado que Configurador administra Configuración.
5. + Polish → validación end-to-end y revisión de mensajes de error.

---

## Notes

- [P] tasks = archivos distintos, sin dependencias entre sí.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- US2 y US3 no agregan gates nuevos al backend: la jerarquía de roles
  (data-model.md) hace que el gate de US1 ya alcance para ambas; sus tareas
  son de verificación (tests) y, en US3, de visibilidad de UI ya cableada en
  US1 (T021).
- Verificar que los tests de T014-T015 fallan antes de T016-T026.
- Commitear después de cada tarea o grupo lógico.
- Parar en cada checkpoint para validar la historia de forma independiente.
