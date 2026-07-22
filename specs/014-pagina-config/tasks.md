---

description: "Task list template for feature implementation"
---

# Tasks: Página de Configuración

**Input**: Design documents from `/specs/014-pagina-config/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluidos — el plan compromete cobertura unitaria/contrato/integración
(Technical Context, sección Testing) y el proyecto ya tiene ese patrón en toda
feature anterior (`tests/contract`, `tests/integration`, `tests/unit`,
`*.test.jsx`).

**Organization**: Tareas agrupadas por historia de usuario del spec (US1–US4,
prioridad P1–P4), para poder implementar y probar cada una de forma
independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3, US4)
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Web application existente: backend en `src/`, frontend en `frontend/src/`,
tests backend en `tests/` (repo root), tests frontend co-ubicados
(`*.test.jsx` junto al componente) — misma convención que 007/010/011/012.

---

## Phase 1: Setup (andamiaje compartido de la feature)

**Purpose**: Crear el punto de entrada de la nueva página/API antes de
implementar cualquier historia.

- [X] T001 [P] Agregar entrada de navegación "Configuración" (`icon`, `label`, título) en `frontend/src/components/AppShell.jsx` (arrays `SECCIONES`/`TITULOS`)
- [X] T002 [P] Crear `src/web/api/configuracion-handlers.js` con `export function registrarRutas(router, ctx) {}` vacío, y registrarlo en `src/web/server.js` (import + llamada, junto a los demás `registrarRutas*`)
- [X] T003 [P] Crear `frontend/src/api/configuracion-client.js` con `export function crearClienteConfiguracion({ fetchImpl, base = '/api' } = {}) {}` vacío (mismo patrón que `frontend/src/api/resumen-periodo-client.js`)
- [X] T004 Crear `frontend/src/components/PaginaConfiguracion.jsx` con `Tabs` de AntD (pestañas vacías "Reloj y servicio", "Motivos de ausencia", "Categorías y modalidades") + `PaginaConfiguracion.test.jsx` esqueleto; agregar rama `'configuracion'` en `frontend/src/App.jsx` (depende de T001, T003)

**Checkpoint**: la página existe, vacía, navegable, y la API responde 404 en `/api/configuracion/*` de forma controlada (ruta registrada sin handlers todavía).

---

## Phase 2: Foundational (bloqueante para todas las historias)

**Purpose**: Módulo de lectura/escritura de `.env` que usan US1 y US4 (host/puerto y el resto de los parámetros comparten el mismo archivo y el mismo mecanismo de escritura atómica).

**⚠️ CRITICAL**: Ninguna historia sobre `.env` (US1, US4) puede implementarse sin esto.

- [X] T005 Crear `src/config/env-file.js` con lectura genérica de pares `CLAVE=valor` (preserva comentarios/orden/claves no gestionadas) y escritura atómica genérica (archivo temporal + `rename`), sin reglas de validación por clave todavía (contracts/env-config.schema.md)
- [X] T006 [P] Test unitario de `env-file.js` en `tests/unit/env-file.test.js`: lectura preserva comentarios y claves ajenas (`RRHH_ORACLE_*`), escritura atómica no corrompe el archivo ante un fallo simulado de disco

**Checkpoint**: `env-file.js` puede leer y reescribir cualquier subconjunto de claves de un `.env` de prueba sin perder el resto del contenido.

---

## Phase 3: User Story 1 - Configurar la conexión al reloj sin editar archivos a mano (Priority: P1) 🎯 MVP

**Goal**: ver y modificar `FICHADAS_HOST`/`FICHADAS_PORT` desde la UI, con
validación, prueba de conexión antes de guardar, y aviso de reinicio
requerido.

**Independent Test**: entrar a Configuración, cambiar IP y puerto del reloj,
guardar, y verificar que persiste (recarga de página y próximo arranque del
servicio), sin tocar categorías ni motivos.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Test de contrato `GET`/`PUT /api/configuracion/reloj` (solo `host`/`port`) en `tests/contract/web-api-configuracion.test.js`: guardado válido, puerto fuera de rango → 400 sin persistir
- [X] T008 [P] [US1] Test de contrato `POST /api/configuracion/reloj/probar-conexion` en `tests/contract/control-api-probar-conexion.test.js`, mockeando el control-API (éxito, fallo de conexión, control-API no disponible → 502)
- [X] T009 [P] [US1] Test unitario de validación de `FICHADAS_HOST` (no vacío) y `FICHADAS_PORT` (entero 1–65535) en `tests/unit/env-file.test.js`

### Implementation for User Story 1

- [X] T010 [US1] Agregar validación + lectura/escritura de `FICHADAS_HOST`/`FICHADAS_PORT` a `leerParametrosEditables`/`escribirParametrosEditables` en `src/config/env-file.js` (depende de T005)
- [X] T011 [US1] Agregar ruta `POST /probar-conexion` a `crearServidorControl` en `src/cli/consulta-programada.js`: recibe `{ host, port }`, usa `connectSocket(host, port, timeoutMs)` de `src/protocol/client.js` con el `FICHADAS_TIMEOUT_MS` vigente, cierra el socket, responde `{ ok, motivo? }` (contracts/control-api.md)
- [X] T012 [US1] Implementar `GET /api/configuracion/reloj` y `PUT /api/configuracion/reloj` (solo `host`/`port` por ahora) en `src/web/api/configuracion-handlers.js`; exponer la ruta del `.env` desde `src/web/wiring.js` al contexto (depende de T002, T010)
- [X] T013 [US1] Implementar `POST /api/configuracion/reloj/probar-conexion` en `configuracion-handlers.js` como proxy HTTP al control-API (nuevo cliente en `src/web/wiring.js`, mismo patrón que `src/presentismo/service/consultar-reloj-cliente.js`); mapear indisponibilidad a `502 SERVICIO_FICHADAS_NO_DISPONIBLE` (depende de T011)
- [X] T014 [US1] Implementar `obtenerReloj()`/`guardarReloj()`/`probarConexionReloj()` en `frontend/src/api/configuracion-client.js` (depende de T003)
- [X] T015 [US1] Implementar `FormularioConexionReloj.jsx` (campos host/puerto, botón "Probar conexión", confirmación de guardado exitoso/error, aviso "requiere reinicio del servicio de fichadas") + `FormularioConexionReloj.test.jsx`; montarlo en la pestaña "Reloj y servicio" de `PaginaConfiguracion.jsx` (depende de T004, T014)
- [X] T016 [US1] Test de integración guardar→releer host/puerto en `tests/integration/configuracion.integration.test.js`

**Checkpoint**: US1 funcional y probable de forma completamente independiente.

---

## Phase 4: User Story 2 - Editar el catálogo de motivos de ausencia (Priority: P2)

**Goal**: alta, edición y desactivación de motivos de ausencia desde la UI.

**Independent Test**: agregar un motivo, editar etiqueta/tipo de pago de uno
existente, desactivar uno, y verificar que el selector de Justificación de
Ausencias (spec 012) refleja los cambios.

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] Test de contrato `GET`/`POST /api/configuracion/motivos-ausencia` y `PUT /api/configuracion/motivos-ausencia/:id` en `tests/contract/web-api-configuracion.test.js`: alta, edición, desactivación, `id` duplicado → 400
- [X] T018 [P] [US2] Test unitario de escritura/edición en `tests/unit/presentismo-motivos-ausencia-config.test.js`: `id` inmutable, duplicado rechazado, catálogo puede quedar sin motivos activos (research.md §3)

### Implementation for User Story 2

- [X] T019 [US2] Agregar `serializarMotivosAusenciaConfig` y funciones `agregarMotivo`/`editarMotivo`/`desactivarMotivo` (re-validan con `parseMotivosAusenciaConfig` antes de escribir) a `src/presentismo/config/motivos-ausencia-config.js`; relajar el `fail()` de "debe haber al menos un motivo activo" a una validación no bloqueante (research.md §3)
- [X] T020 [US2] Implementar `GET`/`POST /api/configuracion/motivos-ausencia` y `PUT /api/configuracion/motivos-ausencia/:id` en `configuracion-handlers.js` (depende de T019)
- [X] T021 [US2] Implementar `obtenerMotivos()`/`crearMotivo()`/`editarMotivo()` en `frontend/src/api/configuracion-client.js`
- [X] T022 [US2] Implementar `TablaMotivosAusencia.jsx` (listado completo, alta, edición de etiqueta/tipo de pago, activar/desactivar) + `TablaMotivosAusencia.test.jsx`; montarla en la pestaña "Motivos de ausencia" (depende de T004, T021)
- [X] T023 [US2] Test de integración: un motivo creado/desactivado desde `/api/configuracion/motivos-ausencia` se refleja en `GET /api/motivos-ausencia` (selector de Justificación, spec 012) en `tests/integration/configuracion.integration.test.js`

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 5: User Story 3 - Editar categorías y modalidades horarias (Priority: P3)

**Goal**: alta/edición de modalidades horarias, alta/edición de categorías
(sin poder eliminarlas), y edición del esquema semanal compartido.

**Independent Test**: definir una modalidad nueva, asignarla a una categoría
(nueva o existente), y verificar que el próximo cálculo de presentismo de esa
categoría usa el horario recién definido.

### Tests for User Story 3 ⚠️

- [X] T024 [P] [US3] Test de contrato `GET /api/configuracion/categorias`, `PUT .../esquema-semanal`, `POST`/`PUT`/`DELETE .../modalidades[/:nombre]`, `POST`/`PUT .../categorias[/:codigo]` en `tests/contract/web-api-configuracion.test.js`: alta/edición válidas, eliminación de modalidad en uso → 409 con lista de categorías, código de categoría duplicado → 400, modalidad inexistente → 400
- [X] T025 [P] [US3] Test unitario de escritura/edición en `tests/unit/presentismo-categorias-config.test.js`: alta/edición de modalidad, bloqueo de eliminación en uso, código de categoría inmutable, esquema semanal vacío/repetido rechazado

### Implementation for User Story 3

- [X] T026 [US3] Agregar `serializarCategoriasConfig` y funciones `agregarModalidad`/`editarModalidad`/`eliminarModalidad` (bloquea si alguna categoría la referencia), `agregarCategoria`/`editarCategoriaModalidad` (sin eliminación, código inmutable) y `editarEsquemaSemanal` a `src/presentismo/config/categorias-config.js`, todas re-validando con `parseCategoriasConfig` antes de escribir
- [X] T027 [US3] Implementar `GET /api/configuracion/categorias`, `PUT .../esquema-semanal`, `POST`/`PUT`/`DELETE .../modalidades[/:nombre]`, `POST`/`PUT .../categorias[/:codigo]` en `configuracion-handlers.js` (depende de T026)
- [X] T028 [US3] Implementar los métodos de categorías/modalidades/esquema semanal en `frontend/src/api/configuracion-client.js`
- [X] T029 [US3] Implementar `FormularioCategoriasModalidades.jsx` (tabla de modalidades con alta/edición/baja bloqueada visualmente si está en uso, tabla de categorías con alta/edición de modalidad asignada, editor del esquema semanal) + `FormularioCategoriasModalidades.test.jsx`; montarlo en la pestaña "Categorías y modalidades" (depende de T004, T028)
- [X] T030 [US3] Test de integración: una modalidad/categoría editada afecta el próximo `npm run presentismo` de esa categoría, en `tests/integration/configuracion.integration.test.js`

**Checkpoint**: US1, US2 y US3 funcionan de forma independiente.

---

## Phase 6: User Story 4 - Editar el resto de los parámetros operativos del servicio de fichadas (Priority: P4)

**Goal**: extender la misma pantalla de Historia 1 con el resto de los
parámetros `.env` (timeouts, intervalos, checkpoint de entrada, handshake
completo, puerto de control, granularidad del resumen del período).

**Independent Test**: cambiar el tiempo de espera de consulta y la
hora/duración del checkpoint de entrada, guardar, y verificar que persisten.

### Tests for User Story 4 ⚠️

- [X] T031 [P] [US4] Test unitario de validación de `timeoutMs`/`tickIntervalMs`/`statusIntervalMs`/`entradaHora`/`entradaDuracion`/`fullHandshake`/`controlPort`/`resumenPeriodo` en `tests/unit/env-file.test.js` (ya cubierto por la implementación completa de env-file.js en la fase Foundational)
- [X] T032 [P] [US4] Test de contrato extendido `GET`/`PUT /api/configuracion/reloj` con todos los campos (incluye rechazo atómico: un campo inválido no persiste ningún campo del body) en `tests/contract/web-api-configuracion.test.js`

### Implementation for User Story 4

- [X] T033 [US4] Extender `leerParametrosEditables`/`escribirParametrosEditables` en `src/config/env-file.js` con `FICHADAS_TIMEOUT_MS`, `FICHADAS_TICK_INTERVAL_MS`, `FICHADAS_STATUS_INTERVAL_MS`, `FICHADAS_ENTRADA_HORA`, `FICHADAS_ENTRADA_DURACION`, `FICHADAS_FULL_HANDSHAKE`, `FICHADAS_CONTROL_PORT` y `PRESENTISMO_RESUMEN_PERIODO` (ya incluido desde T005/T010, construido completo desde el inicio)
- [X] T034 [US4] Extender `GET`/`PUT /api/configuracion/reloj` en `configuracion-handlers.js` para incluir todos los campos de T033 (ya incluido desde T012, mapeo `CAMPO_A_CLAVE_ENV` completo desde el inicio)
- [X] T035 [US4] Extender `FormularioConexionReloj.jsx` con los campos restantes (agrupados en la misma pestaña "Reloj y servicio") + actualizar `FormularioConexionReloj.test.jsx` (depende de T015, T034)
- [X] T036 [US4] Test de integración: un valor fuera de rango en cualquiera de los campos nuevos no persiste ningún campo del body, en `tests/integration/configuracion.integration.test.js`

**Checkpoint**: las 4 historias funcionan de forma independiente entre sí.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: validación end-to-end y limpieza final.

- [X] T037 [P] Ejecutar los escenarios de `quickstart.md` (las 4 historias) y corregir cualquier discrepancia encontrada — verificado en navegador contra una copia sandbox del `.env`/`categorias.json`/`motivos-ausencia.json` reales (server.js + preview del navegador): las 3 pestañas cargan datos reales, "Probar conexión" reporta correctamente `SERVICIO_FICHADAS_NO_DISPONIBLE` cuando no hay control-API
- [X] T038 Revisión manual: confirmar que ningún endpoint de `/api/configuracion/*` expone `RRHH_ORACLE_*` ni rutas de archivos/directorios (FR-014) — grep confirmó que solo aparecen en un comentario documentando la exclusión
- [X] T039 [P] `cd frontend && npm run build` y verificar en el navegador que `PaginaConfiguracion` carga sin errores de consola y sin warnings de AntD — build OK, sin errores de consola en las 3 pestañas
- [X] T040 [P] `npm test` (backend) y `cd frontend && npm test` (frontend) — confirmar suite completa en verde — 565/565 backend, 122/122 frontend

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea US1 y US4 (ambas usan `env-file.js`); US2 y US3 no dependen de Foundational (usan sus propios módulos de config existentes), pero sí de Setup (T002–T004)
- **User Stories (Phase 3–6)**: cada una puede empezar apenas están listas sus dependencias específicas (ver abajo); no dependen entre sí
- **Polish (Phase 7)**: depende de que las historias que se vayan a entregar estén completas

### User Story Dependencies

- **US1 (P1)**: depende de Setup + Foundational (T005) — sin dependencia de otras historias
- **US2 (P2)**: depende de Setup (T002–T004) — NO depende de Foundational (T005/T006, específico de `.env`) ni de US1; puede implementarse en paralelo a US1
- **US3 (P3)**: depende de Setup (T002–T004) — NO depende de Foundational ni de US1/US2; puede implementarse en paralelo
- **US4 (P4)**: depende de US1 (extiende `env-file.js`, el endpoint `/api/configuracion/reloj` y `FormularioConexionReloj.jsx` que crea T010/T012/T015) — única historia con dependencia real de otra

### Within Each User Story

- Tests antes que implementación (deben fallar primero)
- Módulo de config (dominio) antes que el endpoint HTTP
- Endpoint HTTP antes que el cliente frontend
- Cliente frontend antes que el componente de UI
- Historia completa (incluyendo su test de integración) antes de pasar a la siguiente si se trabaja secuencialmente

### Parallel Opportunities

- T001, T002, T003 (Setup) en paralelo
- T006 (Foundational) puede escribirse en paralelo a T005 si se sigue TDD estricto (test primero, falla, luego T005 lo hace pasar)
- Una vez completo Setup: **US2 y US3 se pueden implementar en paralelo a US1**, ya que no comparten `env-file.js` ni el mismo endpoint (`/api/configuracion/motivos-ausencia` y `/api/configuracion/categorias*` son independientes de `/api/configuracion/reloj`)
- US4 solo puede empezar una vez US1 esté completa (T010/T012/T015)
- Tests marcados [P] dentro de cada historia se pueden ejecutar/escribir en paralelo

---

## Parallel Example: User Story 1

```bash
# Lanzar juntos los tests de la Historia 1:
Task: "Test de contrato GET/PUT /api/configuracion/reloj en tests/contract/web-api-configuracion.test.js"
Task: "Test de contrato POST /api/configuracion/reloj/probar-conexion en tests/contract/control-api-probar-conexion.test.js"
Task: "Test unitario de validación de host/puerto en tests/unit/env-file.test.js"
```

## Parallel Example: Historias independientes entre sí

```bash
# Una vez completo Setup (Phase 1), tres desarrolladores en paralelo:
Developer A: Phase 3 (US1) — requiere también Phase 2 (Foundational)
Developer B: Phase 4 (US2) — no requiere Phase 2
Developer C: Phase 5 (US3) — no requiere Phase 2
# Phase 6 (US4) espera a que Developer A termine US1
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1 (Setup)
2. Completar Phase 2 (Foundational — `env-file.js`)
3. Completar Phase 3 (US1)
4. **Parar y validar**: probar US1 de forma independiente (cambiar IP/puerto
   del reloj sin editar archivos a mano, con prueba de conexión)
5. Desplegar/demostrar si está listo — ya resuelve el caso concreto que
   motiva la feature

### Incremental Delivery

1. Setup + Foundational → base lista
2. + US1 → probar independientemente → demo (MVP)
3. + US2 → probar independientemente → demo
4. + US3 → probar independientemente → demo
5. + US4 (requiere US1 ya completa) → probar independientemente → demo
6. Cada historia agrega valor sin romper las anteriores

### Parallel Team Strategy

Con varios desarrolladores: completar Setup juntos; luego Developer A toma
US1 (y después US4, que depende de US1), Developer B toma US2, Developer C
toma US3 — las tres primeras historias no se pisan entre sí (archivos y
endpoints distintos).

---

## Notes

- [P] = archivos distintos, sin dependencias entre sí
- [Story] mapea cada tarea a su historia de usuario para trazabilidad
- US4 es la única historia con dependencia real de otra (US1); el resto son
  independientes entre sí
- Verificar que los tests fallan antes de implementar
- Commitear después de cada tarea o grupo lógico
- Parar en cualquier checkpoint para validar una historia de forma
  independiente
- Evitar: tareas vagas, conflictos de archivo entre historias en paralelo,
  dependencias cruzadas que rompan la independencia (más allá de la
  US4→US1 ya documentada)
