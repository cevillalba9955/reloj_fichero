# Tasks: Dominio de Presentismo — Cálculo de Horas Trabajadas por Período

**Input**: Design documents from `/specs/004-dominio-presentismo/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: INCLUIDOS. La Constitución (Principio IV) exige test-first en las capas
críticas de este proyecto: el **motor de cálculo** (impacta liquidación de haberes) y el
**repositorio Oracle** de categoría. Las tareas de test preceden a su implementación.

**Organization**: agrupadas por historia de usuario para implementación y prueba
independiente. Stack: Node.js 20 ESM, `node:test`/`node:assert`, `oracledb` (ya presente),
sin dependencias nuevas. Tiempos en minutos-del-día; fechas `YYYY-MM-DD`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1..US4 (historias del spec). Setup/Foundational/Polish sin label.

## Path Conventions

Single project: `src/`, `tests/`, `config/` en la raíz del repositorio (ver plan.md
§Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: estructura del subárbol de presentismo y archivos de configuración de ejemplo.

- [X] T001 Crear el subárbol `src/presentismo/` con carpetas `domain/`, `config/`, `ports/`, `adapters/`, `logging/`, `service/` (archivos placeholder o `index` vacíos) según plan.md §Project Structure
- [X] T002 [P] Crear `config/categorias.example.json` conforme a [contracts/categorias-config.schema.md](./contracts/categorias-config.schema.md) (modalidades `Mensual`/`Quincenal`, categorías de ejemplo, `esquemaSemanal` L–V)
- [X] T003 [P] Ampliar `.env.example` con `PRESENTISMO_CATEGORIAS_CONFIG`, `PRESENTISMO_REPO_DIR`, `PRESENTISMO_LOG_DIR` y `RRHH_ORACLE_COLUMNA_CATEGORIA`, documentando defaults (ver [contracts/cli-presentismo.md](./contracts/cli-presentismo.md)). **Ampliado en la entrega** con `PRESENTISMO_PADRON`, `PRESENTISMO_PADRON_FILE`, `PRESENTISMO_FICHADAS_DIR`, `FICHADAS_OUTPUT_DIR` y `RRHH_ORACLE_COLUMNA_NOMBRE` (ver Fase 8)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: utilidades de tiempo, config, puertos, logger y persistencia que TODAS las
historias necesitan.

**⚠️ CRITICAL**: ninguna historia puede completarse hasta terminar esta fase.

- [X] T004 [P] Test unitario de `tiempo` (parseo/format `HH:MM` ↔ minutos-del-día, validación de rango, `overlap([a,b],[c,d])`, límites inclusivos) en `tests/unit/presentismo-tiempo.test.js`
- [X] T005 Implementar `src/presentismo/domain/tiempo.js` hasta que T004 pase (sin librerías de terceros — research §2)
- [X] T006 [P] Test unitario del cargador de categorías (validación fail-fast, referencia categoría→modalidad, `jornadaEsperada` derivada, `esquemaSemanal` default) en `tests/unit/presentismo-categorias-config.test.js`
- [X] T007 Implementar `src/presentismo/config/categorias-config.js` (carga + validación fail-fast conforme al schema) hasta que T006 pase
- [X] T008 [P] Definir los contratos de puertos (JSDoc/estructura) `FichadasProvider`, `EmployeeCategoryProvider`, `PresentismoRepository`, `PresentismoLogger` en `src/presentismo/ports/index.js` según [contracts/ports.md](./contracts/ports.md)
- [X] T009 [P] Implementar `src/presentismo/logging/presentismo-logger.js` (NDJSON estructurado, sin datos biométricos ni credenciales — Principio V/FR-025), al estilo de `src/logging/service-cycle-logger.js`
- [X] T010 Implementar `src/presentismo/adapters/in-memory-presentismo-repository.js` (calendarios, correcciones, pausas en memoria) conforme al puerto
- [X] T011 Implementar `src/presentismo/adapters/file-presentismo-repository.js` (persistencia JSON con escritura atómica temp+rename, dir `PRESENTISMO_REPO_DIR` — research §3) conforme al puerto
- [X] T012 [P] Test de contrato del puerto `PresentismoRepository` que corre el mismo set contra los adaptadores memoria y archivo (idempotencia de calendario, rechazo de motivo vacío) en `tests/contract/presentismo-ports.contract.test.js`

**Checkpoint**: base lista — pueden comenzar las historias.

---

## Phase 3: User Story 1 - Armar el calendario laboral del mes (Priority: P1) 🎯 MVP

**Goal**: generar el Calendario del mes (`YYYYMM`) con clasificación inicial por esquema
semanal y permitir reclasificar días (`Laborable`/`No Laborable`/`Feriado`), persistido y
sin pisar ediciones al regenerar.

**Independent Test**: generar `202607` (31 días, L–V `Laborable`, S–D `No Laborable`),
reclasificar el 2026-07-09 a `Feriado`, regenerar y verificar que la reclasificación
persiste (FR-002/004/006).

### Tests for User Story 1 ⚠️ (escribir primero, deben fallar)

- [X] T013 [P] [US1] Test unitario de `calendario-mes` (generación por esquema semanal, validación de `YYYYMM`, reclasificación, idempotencia de regenerar sin pisar `reclasificadoManual`) en `tests/unit/presentismo-calendario-mes.test.js`
- [X] T014 [P] [US1] Test de integración del flujo de calendario (generar → reclasificar → regenerar) vía servicio + repositorio en `tests/integration/calcular-presentismo.integration.test.js` (bloque US1)

### Implementation for User Story 1

- [X] T015 [US1] Implementar `src/presentismo/domain/calendario-mes.js` (entidades `CalendarioMes`/`DiaMes`, generación, `Clasificacion`, reclasificación — data-model.md) hasta que T013 pase
- [X] T016 [US1] Crear `src/presentismo/service/calcular-presentismo-service.js` con `generarCalendario(periodo)` y `reclasificarDia(periodo, fecha, clasificacion, autor)` usando `PresentismoRepository` + logger (FR-005/006)
- [X] T017 [US1] Crear `src/cli/calcular-presentismo.js` con los subcomandos `generar-calendario` y `reclasificar` (precedencia argv > env > default) según [contracts/cli-presentismo.md](./contracts/cli-presentismo.md)
- [X] T018 [US1] Registrar eventos de generación y reclasificación en el logger (FR-025) y validar entradas (mes válido, clasificación válida, fecha del mes)

**Checkpoint**: US1 funcional y testeable de forma independiente (MVP: calendario editable y persistente, sin necesidad de fichadas).

---

## Phase 4: User Story 2 - Calcular las horas trabajadas de un empleado (Priority: P2)

**Goal**: calcular las horas trabajadas de un empleado por período de liquidación
(mensual o quincenal), con tolerancia, sin horas extra, feriado acreditado, y resumen con
horas esperadas/trabajadas/saldo, resolviendo modalidad desde la categoría del padrón.

**Independent Test**: sobre un calendario cargado y fichadas de prueba, reproducir al
minuto los Acceptance Scenarios US2-1..12 (completa, parcial, incompleta, sin fichadas,
feriado, no laborable, quincenal, modalidades distintas, categoría no configurada).

### Tests for User Story 2 ⚠️ (escribir primero, deben fallar)

- [X] T019 [P] [US2] Test unitario de `periodo-liquidacion` (recorte `Mes`/`Q1`(1–15)/`Q2`(16–fin), Q1+Q2=Mes — SC-012) en `tests/unit/presentismo-periodo-liquidacion.test.js`
- [X] T020 [P] [US2] Test unitario de `jornada` con **fixtures de calibración 1:1** de los Acceptance Scenarios (entrada/salida, tolerancia, parcial, incompleta+sugerencia, feriado, salida<entrada, límites inclusivos) en `tests/unit/presentismo-jornada.test.js`
- [X] T021 [P] [US2] Test unitario de `resumen-presentismo` (horas esperadas incluye feriado, saldo, conteos, fichadas fuera de calendario — FR-018/019/020) en `tests/unit/presentismo-resumen.test.js`
- [X] T022 [P] [US2] Test unitario de `oracle-employee-category-provider` con **fábrica de conexión inyectable (fake)**, sin base real (research §8) en `tests/unit/oracle-employee-category-provider.test.js`
- [X] T023 [P] [US2] Test de integración de cálculo por empleado (mensual y quincenal, modalidades distintas, categoría no configurada → anomalía) en `tests/integration/calcular-presentismo.integration.test.js` (bloque US2)

### Implementation for User Story 2

- [X] T024 [P] [US2] Implementar `src/presentismo/domain/periodo-liquidacion.js` (recorte del calendario por modalidad) hasta que T019 pase
- [X] T025 [P] [US2] Implementar `src/presentismo/domain/jornada.js` (selección entrada/salida por ventana, hora efectiva por tolerancia, `horasAuto` con `clamp`, estados, sugerencia FR-015) hasta que T020 pase
- [X] T026 [US2] Implementar `src/presentismo/domain/resumen-presentismo.js` (agregación sobre el período, desglose auto/corregidas/pausas, fichadas fuera de calendario) hasta que T021 pase
- [X] T027 [P] [US2] Implementar `src/presentismo/adapters/memory-store-fichadas-provider.js` (puente al store en memoria de la feature 002, dedup por id, fichadas sin fecha → no imputadas) conforme al puerto
- [X] T028 [US2] Ampliar `src/db/oracle-roster-repository.js` para proyectar la columna de categoría (solo lectura, columna configurable `RRHH_ORACLE_COLUMNA_CATEGORIA`), sin SQL fuera de `src/db/` (Principio II)
- [X] T029 [US2] Implementar `src/presentismo/adapters/oracle-employee-category-provider.js` (normaliza legajo→códigoCategoría) hasta que T022 pase
- [X] T030 [US2] Extender el servicio con `calcularEmpleado(legajo, periodo)` (resuelve categoría→modalidad/params; 1 resumen mensual o 2 quincenales; categoría ausente/no configurada → resumen con anomalía sin cálculo, FR-035) y `calcularPlantilla(periodo, legajos[])`
- [X] T031 [US2] Agregar el subcomando `calcular` al CLI (`--legajo` opcional, `--formato json|tabla`, quincenal emite 2 resúmenes) según el contrato
- [X] T032 [US2] Registrar eventos de cálculo y anomalías (categoría no configurada, fichada no imputada) en el logger (FR-025)

**Checkpoint**: US2 funcional; el cálculo automático reproduce los números del spec al minuto de forma determinista.

---

## Phase 5: User Story 3 - Corregir manualmente una jornada y cargar pausas (Priority: P2)

**Goal**: permitir a un usuario responsable corregir el resultado de una jornada (con
auditoría y reversión) y cargar pausas intermedias que descuentan del total diario;
proteger correcciones/pausas frente a recálculos.

**Independent Test**: sobre una jornada calculada, aplicar corrección con motivo (impacta
total, queda auditada, reversible), cargar pausa `12:00`–`13:00` (descuenta 1 h), verificar
tope en 0 y rechazo sin motivo (US3-1..8).

### Tests for User Story 3 ⚠️ (escribir primero, deben fallar)

- [X] T033 [P] [US3] Test unitario de `correccion` (prevalece sobre auto, motivo obligatorio, reversión, puede exceder jornada esperada — FR-026/027/028/030) en `tests/unit/presentismo-correccion.test.js`
- [X] T034 [P] [US3] Test unitario de `pausa` (descuento = solape con horario efectivo, solo `Laborable` con horas, tope en 0, varias pausas, no aplica en Feriado/No Laborable — FR-038/039) en `tests/unit/presentismo-pausa.test.js`
- [X] T035 [P] [US3] Test de integración de corrección y pausa (alta con motivo, reversión, `requiereRevision` tras recálculo — FR-029/041) en `tests/integration/calcular-presentismo.integration.test.js` (bloque US3)

### Implementation for User Story 3

- [X] T036 [P] [US3] Implementar `src/presentismo/domain/correccion.js` (aplicar/revertir corrección, conservar `valorCalculado` visible) hasta que T033 pase
- [X] T037 [P] [US3] Implementar `src/presentismo/domain/pausa.js` (descuento por solape, tope en 0) hasta que T034 pase
- [X] T038 [US3] Integrar corrección y pausas en `jornada`/`resumen`: `totalDiario = correccion.valor` si vigente, si no `max(0, horasAuto − descuentoPausas)`; marcar `requiereRevision` cuando un recálculo altera la base (FR-028/029/038/041)
- [X] T039 [US3] Extender el servicio con `cargarCorreccion/revertirCorreccion` y `cargarPausa/revertirPausa` (persisten vía repo, exigen motivo, logean) 
- [X] T040 [US3] Agregar los subcomandos `correccion` y `pausa` al CLI (motivo obligatorio en alta, `--revertir`, validación `--desde < --hasta`) según el contrato
- [X] T041 [US3] Registrar alta/reversión de correcciones y pausas en el logger, separadas entre sí (FR-022/025/040)

**Checkpoint**: US3 funcional; las jornadas incompletas se resuelven a mano y las pausas descuentan correctamente, todo auditado.

---

## Phase 6: User Story 4 - Auditar el detalle del cálculo de una jornada (Priority: P3)

**Goal**: exponer, por empleado y día, el detalle del cálculo: fichada de entrada/salida
elegidas, hora real y efectiva, horas resultantes, fichadas no utilizadas, motivo de
incompletitud y corrección/pausa vigentes.

**Independent Test**: sobre jornadas ya calculadas, verificar que el detalle expone la
entrada/salida elegidas, la fichada intermedia no usada, la normalización por tolerancia y
el valor calculado junto al corregido (US4-1..4).

### Tests for User Story 4 ⚠️ (escribir primero, deben fallar)

- [X] T042 [P] [US4] Test unitario del detalle de jornada (entrada/salida elegidas, fichadas no utilizadas, hora real vs efectiva, motivo de incompletitud, corrección visible — FR-021) en `tests/unit/presentismo-jornada.test.js` (bloque detalle)

### Implementation for User Story 4

- [X] T043 [US4] Asegurar que `jornada`/`resumen` exponen el objeto de detalle completo (entrada, salida, efectivas, fichadas no usadas, sugerencia, corrección/pausas vigentes) conforme a data-model.md/FR-021
- [X] T044 [US4] Exponer el detalle en el CLI (detalle por jornada en `--formato json`; opción de detalle en `tabla`) según el contrato
- [X] T045 [US4] Registrar consulta de detalle en el logger si corresponde y verificar que ningún dato biométrico/credencial aparece en la salida (Principio V)

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: cierre transversal, validación y rendimiento.

- [X] T046 [P] Ejecutar la guía de validación [quickstart.md](./quickstart.md) de punta a punta y corregir desvíos
- [X] T047 [P] Verificar performance: cálculo de un empleado (mes ≤200 fichadas) < 2 s (SC-003) y plantilla (≤500 empleados) < 30 s (SC-004) con un test de rendimiento en `tests/integration/presentismo-performance.integration.test.js`
- [X] T048 [P] Agregar el script `npm run presentismo` (y, si aplica, `smoke:presentismo`) a `package.json` para el CLI
- [X] T049 [P] Documentar la feature (uso del CLI, config de categorías, variables de entorno) en `README.md` o `docs/`
- [X] T050 Revisar cobertura de determinismo (SC-005) e invariantes de data-model.md (horas no negativas, no exceder esperada, Q1+Q2=Mes) en la suite y cerrar huecos
- [X] T051 Auditar logs: ningún dato biométrico ni credencial en NDJSON ni en stdout/stderr (Principio V), correlación por periodo/legajo/día

---

## Phase 8: Operación entregada (padrón local, nombres, fichadas) — reconciliación post-implementación

**Purpose**: capturar el scope agregado en la entrega (PR #4) sobre el dominio de las
Fases 1–7, para que tasks/plan/spec reflejen el sistema efectivamente mergeado. Todas las
tareas están **hechas**; se documentan retroactivamente. Referencias: FR-042…FR-046 y
[contracts/cli-presentismo.md](./contracts/cli-presentismo.md).

- [X] T052 Cargar el `.env` en el arranque del CLI (`process.loadEnvFile`) para operar con `node` directo además de `npm run presentismo`
- [X] T053 [P] [US2] Extender el repositorio y provider de categoría con la lista del padrón (`listar()`) y la **columna de nombre** opcional `RRHH_ORACLE_COLUMNA_NOMBRE` (solo lectura, Principio II), con tests (`tests/unit/oracle-employee-category-provider.test.js`, `oracle-roster-config.test.js` — FR-045)
- [X] T054 Implementar `src/presentismo/adapters/file-padron-category-provider.js` (**snapshot local** del padrón) y los subcomandos `sincronizar-padron` y `listar-padron`; fuente configurable `--padron archivo|oracle` (`PRESENTISMO_PADRON`/`PRESENTISMO_PADRON_FILE`), con tests (`tests/unit/presentismo-file-padron-provider.test.js` — FR-042/043, Principio VI)
- [X] T055 Habilitar `calcular` de **plantilla completa** (sin `--legajo`) tomando la lista de activos del padrón (FR-034)
- [X] T056 Implementar `src/presentismo/adapters/file-fichadas-archive.js` (archivo acumulativo por período, dedup por `rawHex`) y `src/presentismo/adapters/archive-fichadas-provider.js` (fuente de fichadas del cálculo, sin propagar `rawHex` al dominio), con tests (`tests/unit/presentismo-fichadas-archive.test.js` — FR-044/046)
- [X] T057 Agregar el subcomando `importar-fichadas` (lee `output/fichadas-*.json`, registra el período, evento `fichadas_importadas` sin `rawHex`) y cablear el `archive-fichadas-provider` en el servicio (FR-044/025)
- [X] T058 [P] Ampliar `.env.example`/`.gitignore` (variables de Fase 8; `/data/` y `config/categorias.json` fuera del repo) y actualizar `docs/presentismo.md` y el contrato del CLI

**Checkpoint**: el CLI opera sin conexión permanente a la DB; las fichadas obtenidas quedan registradas por período; suite completa en verde (255 tests).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; BLOQUEA todas las historias.
- **US1 (Phase 3)**: depende de Foundational. Independiente del resto (MVP).
- **US2 (Phase 4)**: depende de Foundational y del calendario de US1 (calcula sobre días clasificados).
- **US3 (Phase 5)**: depende de US2 (corrige/descuenta sobre la jornada calculada).
- **US4 (Phase 6)**: depende de US2 (expone el detalle del cálculo).
- **Polish (Phase 7)**: depende de las historias que se quieran cerrar.
- **Operación entregada (Phase 8)**: depende de US2 (cálculo) — agrega padrón local, nombres e importación/archivo de fichadas sobre el motor ya funcionando.

### User Story Dependencies

- **US1 (P1)**: solo Foundational — sin dependencias de otras historias.
- **US2 (P2)**: Foundational + calendario de US1.
- **US3 (P2)** y **US4 (P3)**: construyen sobre el motor de cálculo de US2 (dependencia real e inevitable: no hay corrección/pausa/detalle sin un cálculo base).

### Within Each User Story

- Tests primero (deben fallar), luego implementación (Principio IV).
- Dominio (models) antes que servicio; servicio antes que CLI.

### Parallel Opportunities

- Setup: T002 y T003 en paralelo.
- Foundational: los pares de test `[P]` (T004, T006, T008, T009, T012) son paralelizables entre módulos distintos; cada impl depende de su test.
- US2: T019–T022 (tests) en paralelo; T024/T025/T027 (dominio/adaptadores en archivos distintos) en paralelo tras sus tests.
- US3: T033/T034 (tests) y T036/T037 (dominio) en paralelo.
- US3 y US4 pueden trabajarse en paralelo una vez cerrada US2 (tocan piezas distintas: corrección/pausa vs detalle/salida).

---

## Parallel Example: User Story 2

```bash
# Tests de US2 juntos (deben fallar antes de implementar):
Task: "Test periodo-liquidacion en tests/unit/presentismo-periodo-liquidacion.test.js"
Task: "Test jornada (fixtures de calibración) en tests/unit/presentismo-jornada.test.js"
Task: "Test resumen en tests/unit/presentismo-resumen.test.js"
Task: "Test oracle-employee-category-provider (fake conn) en tests/unit/oracle-employee-category-provider.test.js"

# Dominio/adaptadores de US2 en paralelo (archivos distintos), tras sus tests:
Task: "Implementar src/presentismo/domain/periodo-liquidacion.js"
Task: "Implementar src/presentismo/domain/jornada.js"
Task: "Implementar src/presentismo/adapters/memory-store-fichadas-provider.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 Setup → Fase 2 Foundational → Fase 3 US1.
2. **DETENER y VALIDAR**: calendario del mes generable, editable y persistente.
3. Es un incremento demostrable sin necesidad de fichadas ni Oracle.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. + US1 → calendario (MVP).
3. + US2 → cálculo de horas por período/modalidad (núcleo de valor).
4. + US3 → correcciones y pausas (operabilidad de liquidación).
5. + US4 → auditoría del detalle.
6. Polish → validación quickstart, performance, logging.

### Parallel Team Strategy

Tras Foundational: US1 y (una vez con calendario) US2 pueden avanzar; luego US3 y US4 en
paralelo sobre el motor de US2.

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes.
- `[Story]` mapea la tarea a su historia para trazabilidad.
- Verificar que los tests fallan antes de implementar (Principio IV).
- Commit por tarea o grupo lógico, en la rama `004-dominio-presentismo` (nunca directo a `main` — Constitución §Flujo de Git).
- Evitar: tareas vagas, conflictos en el mismo archivo, dependencias cruzadas que rompan la independencia de las historias.

## Task Summary

- **Total**: 58 tareas (T001–T058).
- **Por historia**: Setup 3 · Foundational 9 · US1 6 · US2 14 · US3 9 · US4 4 · Polish 6 · Operación entregada (Fase 8) 7.
- **Tests incluidos**: unitarios (dominio + config + Oracle fake + padrón local + archivo de fichadas), contrato (puertos) e integración (por historia) — exigidos por Principio IV.
- **MVP**: US1 (Fases 1–3), calendario del mes editable y persistente.
- **Fase 8**: reconciliación post-implementación del scope entregado (padrón local, nombres, importación/archivo de fichadas — FR-042…FR-046).
