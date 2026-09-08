---
description: "Task list for 018-informe-cierre-periodo"
---

# Tasks: Informe al Cierre del Período

**Input**: Design documents from `/specs/018-informe-cierre-periodo/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/web-api.md](contracts/web-api.md)

**Tests**: INCLUDED. La constitución (Principio IV, Test-First en capas críticas)
y el plan exigen tests unitarios/contract/integration para la proyección del
informe y sus endpoints, que alimentan la liquidación de sueldos.

**Organization**: por historia de usuario (US1 = MVP). Cada historia es un
incremento verificable de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1 / US2 / US3 (sólo en fases de historia)

## Path Conventions

Web app en un solo repo: backend en `src/`, frontend en `frontend/src/`, tests en
`tests/` (raíz) y `frontend/src/components/*.test.jsx`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: piezas de plomería compartidas por todas las historias. Sin
dependencias nuevas de paquetes.

- [X] T001 [P] Agregar `ARCHIVO_INFORME_CIERRE = 'informe-cierre.json'` (export) en `src/presentismo/domain/periodo-storage.js`, junto a las constantes de archivo existentes
- [X] T002 [P] Extraer `parsePeriodoId`, `expandirPeriodos`, `periodoPorDefecto` y las regex `RE_MES` / `RE_QUINCENA` de `src/web/api/resumen-periodo-handlers.js` a un módulo nuevo `src/web/api/periodo-id.js`; re-apuntar `resumen-periodo-handlers.js` para importarlos (sin cambio de contrato de `/api/resumen-periodo`; los tests de `tests/contract/web-api-resumen-periodo.test.js` deben seguir en verde)
- [X] T003 [P] Agregar `leerSnapshotPadron({ filePath })` en `src/presentismo/adapters/file-padron-category-provider.js` — lee `P<periodo>/padron.json` y devuelve `[{ legajo, nombre, ... }]`; devuelve `[]` si el archivo no existe (contraparte de `guardarSnapshotPadron`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: puerto de persistencia + proyección pura del informe. Ninguna
historia puede implementarse antes de terminar esta fase.

**⚠️ CRITICAL**: bloquea US1, US2 y US3.

- [X] T004 Agregar `'guardarInformeCierre'` y `'cargarInformeCierre'` a `METODOS.PresentismoRepository` en `src/presentismo/ports/index.js` (documentar firma en el bloque JSDoc del puerto)
- [X] T005 [P] Test-first: `tests/unit/file-presentismo-repository-informe.test.js` — `guardarInformeCierre` crea `data/P<periodo>/informe-cierre.json` con la entrada del tramo; segunda llamada al mismo tramo la reemplaza; `cargarInformeCierre` devuelve el mapa por tramo o `null` si no existe; no toca otros tramos (debe FALLAR antes de T006)
- [X] T006 Implementar `guardarInformeCierre(periodo, tramo, entrada)` y `cargarInformeCierre(periodo)` en `src/presentismo/adapters/file-presentismo-repository.js` usando `rutaCarpetaPeriodo` + `ARCHIVO_INFORME_CIERRE`, con `mkdirSync(..., { recursive: true })` perezoso (depende de T001, T004, T005)
- [X] T007 [P] Agregar `guardarInformeCierre` / `cargarInformeCierre` (equivalentes en memoria) a `src/presentismo/adapters/in-memory-presentismo-repository.js` para paridad en tests
- [X] T008 [P] Test-first: `tests/unit/presentismo-informe-cierre.test.js` — fixtures de filas tipo `calcularResumenPeriodo`; verifica: forma del `Sello`; `encabezado.totalHoras === Σ filas[].horasTrabajadas`; `encabezado.empleados === filas.length`; corte `hoy` = último día del tramo (Q1 → `-15`); fila con `anomalia` va con contadores en 0 y sección de detalle sin `dias`; `hayPendientes === false` cuando no hay incompletas/anomalías/ajustes (debe FALLAR antes de T009)
- [X] T009 Implementar `src/presentismo/domain/informe-cierre.js` — función pura que recibe `{ filas, periodoId, periodoMes, tramo, modo, autor, emitidoEn, rangoFechas }` y devuelve `{ sello, resumen, detalle, pendientes }` según [data-model.md](data-model.md) §2–§5; NO recalcula presentismo (deriva todo de `filas`); determina el corte `hoy` como último día del tramo (depende de T008)
- [X] T010 [P] En `src/presentismo/service/calcular-presentismo-service.js`, agregar `modalidad` (`params.tipo`) a cada fila que devuelve `calcularResumenPeriodo` (para el encabezado del informe; no cambia el contrato de `/api/resumen-periodo`, que ignora campos extra)
- [X] T011 En `src/presentismo/service/calcular-presentismo-service.js`, agregar `emitirInformeCierre({ periodoMes, tramo, legajos, nombres, autor, modo })` (llama `calcularResumenPeriodo` → `informe-cierre.js` → `repo.guardarInformeCierre`) y `obtenerInformeCierre(periodoMes)` (→ `repo.cargarInformeCierre`); en `reabrirPeriodoMes`, tras `guardarCalendario`, marcar `obsoleto: true` + `invalidadoPor` en cada entrada de `cargarInformeCierre` y re-guardarlas (depende de T006, T007, T009, T010)

**Checkpoint**: puerto + persistencia + proyección listos; las historias pueden empezar.

---

## Phase 3: User Story 1 - Emitir el informe de resumen de horas computadas (Priority: P1) 🎯 MVP

**Goal**: cerrar un período cerrado emite y guarda ambos informes; el responsable
puede re-emitir a demanda, leer la copia guardada y verla en una vista
imprimible con el **resumen por empleado** y el sello de emisión.

**Independent Test**: con `202607` cerrado y fichadas cargadas, `POST
/api/calendarios/202607/informe-cierre` (rol editor) devuelve 200 con
`resumen.filas` + `sello`; `GET` devuelve la misma copia; `POST` sobre un período
abierto devuelve 409; la página muestra la acción sólo si el período está
cerrado y abre la vista imprimible.

### Tests for User Story 1 ⚠️ (escribir primero, deben FALLAR)

- [X] T012 [P] [US1] Contract test `tests/contract/web-api-informe-cierre.test.js` — casos: `POST` período abierto → `409 PERIODO_ABIERTO`; `POST` con `x-apex-rol: lector` → `403 ACCESO_DENEGADO`; `POST` período cerrado (modo MENSUAL) → `200` con `sello`, `resumen.filas`, `detalle.secciones`, `pendientes`; `GET` tras el `POST` → `200` mismo `periodoId`, `obsoleto: false`; `GET` de período cerrado sin emitir → `404 INFORME_NO_EMITIDO`; `POST` con `periodo` mal formado → `400 PERIODO_INVALIDO`; `Σ resumen.filas[].horasTrabajadas === resumen.encabezado.totalHoras`
- [X] T013 [P] [US1] Integration test `tests/integration/informe-cierre.integration.test.js` — `cerrar` (rol editor) genera `data/P<periodo>/informe-cierre.json` con la clave `Mes`, `sello.modo === 'automatico'`; `GET .../informe-cierre` devuelve esa copia; segundo `POST .../informe-cierre` reemplaza la entrada (cambia `emitidoEn`, `modo: 'manual'`); `reabrir` deja `obsoleto: true`; volver a `cerrar` deja `obsoleto: false`; las filas coinciden con `GET /api/resumen-periodo?periodo=<periodo>` (SC-008)
- [X] T014 [P] [US1] Component test `frontend/src/components/AccionInformeCierre.test.jsx` — el botón "Emitir" está deshabilitado si el período no está cerrado; al hacer clic llama `cliente.emitir(periodo)`; si la copia viene `obsoleto: true` muestra el aviso "Informe desactualizado — volvé a emitir"

### Implementation for User Story 1

- [X] T015 [US1] `construirVistaInformeCierre({ periodoId, entrada })` en `src/web/view-model.js` — arma `VistaInformeCierre` ([data-model.md](data-model.md) §6): pasa `sello` y `obsoleto`, formatea el **resumen** (horas como número; totales del encabezado); deja `detalle`/`pendientes` tal cual por ahora (los formatean US2/US3)
- [X] T016 [US1] `src/web/api/informe-cierre-handlers.js` — `POST /api/calendarios/:periodo/informe-cierre` con `exigirRol(ctx, 'editor', …)`: valida `periodo` y `tramo` con `periodo-id.js`; carga el calendario, 404 `CALENDARIO_NO_GENERADO` si falta, `409 PERIODO_ABIERTO` si `cerrado !== true`; resuelve legajos+nombres del snapshot del período (helper `legajosYNombresDelPeriodo(ctx, periodoMes)` exportado desde este módulo, usa `leerSnapshotPadron`); llama `ctx.service.emitirInformeCierre({ … modo: 'manual' })` por tramo; responde `construirVistaInformeCierre`. `GET` con `exigirRol(ctx, 'lector', …)`: `ctx.service.obtenerInformeCierre` → `404 INFORME_NO_EMITIDO` si no hay entrada del tramo
- [X] T017 [US1] Registrar las rutas nuevas en `src/web/wiring.js` (junto al registro de `resumen-periodo-handlers` / `calendario-handlers`)
- [X] T018 [US1] Emisión automática al cerrar en `src/web/api/calendario-handlers.js` (ruta `cerrar`): tras `ctx.service.cerrarPeriodo(...)`, resolver los tramos según `ctx.modoResumenPeriodo` (`MENSUAL` → `Mes`; `QUINCENAL` → `Q1`,`Q2`) y legajos+nombres del snapshot del período (`legajosYNombresDelPeriodo` de `informe-cierre-handlers.js`), llamar `ctx.service.emitirInformeCierre({ … modo: 'automatico' })` por tramo; un fallo se registra en el log y NO altera la respuesta ni revierte el cierre
- [X] T019 [US1] En `emitirInformeCierre` (service), registrar `logger.evento('informe_cierre_emitido', { periodo, tramo, autor, modo, empleados, totalHoras })` — sin biométricos ni `rawHex` (Principio V, FR-014)
- [X] T020 [P] [US1] `frontend/src/api/informe-cierre-client.js` — `emitir(periodo)` (`POST`) y `obtener(periodo)` (`GET`), mismo patrón que `resumen-periodo-client.js` (`fetchConRol`, manejo de `error.codigo`)
- [X] T021 [P] [US1] `frontend/src/components/InformeCierrePrintable.jsx` — vista imprimible: encabezado (período, tramo, `rangoFechas`), sello de emisión, tabla **resumen** por empleado (legajo, nombre, modalidad, horas, contadores, marca de anomalía), total general; CSS `@media print` (oculta navegación de la app); botón "Imprimir" → `window.print()`
- [X] T022 [P] [US1] `frontend/src/components/AccionInformeCierre.jsx` — botón "Emitir / ver informe de cierre" (deshabilitado si el período no está cerrado), aviso de copia `obsoleto`, abre `InformeCierrePrintable` en un `Dialogo`/panel
- [X] T023 [US1] Integrar `AccionInformeCierre` + `InformeCierrePrintable` en `frontend/src/components/PaginaResumenPeriodo.jsx` (la acción aparece sólo cuando el período seleccionado está cerrado; usa `informe-cierre-client.js`); actualizar `frontend/src/components/PaginaResumenPeriodo.test.jsx` con el caso "período cerrado muestra la acción / período abierto no"

**Checkpoint**: US1 funcional y verificable — se puede emitir, persistir, leer e imprimir el informe de resumen. **MVP entregable.**

---

## Phase 4: User Story 2 - Emitir el informe de detalle de asistencia, empleado por empleado (Priority: P2)

**Goal**: la misma emisión produce, por empleado, la asistencia día por día del
período con marcas de corrección/justificación y un subtotal que cuadra con el
resumen; la vista imprimible lo muestra.

**Independent Test**: sobre `202607` cerrado, `GET .../informe-cierre` trae
`detalle.secciones` con una sección por empleado del período, cada una con todos
los días del tramo y `subtotalHoras === ` horas de la fila de resumen del mismo
legajo; los días con corrección o justificación quedan marcados; la vista
imprimible lista el detalle por empleado.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Extender `tests/unit/presentismo-informe-cierre.test.js` — `detalle.secciones`: una por fila; cada `RenglonDetalle` con `fecha`, `clasificacion`, `estado`, `entrada`/`salida` = hora real o corregida (NUNCA la efectiva por tolerancia), `pausas`, `horas`, `corregida`, `justificacion`; `subtotalHoras === Σ dias[].horas` y `=== fila.horasTrabajadas`; sección de anomalía sin `dias`
- [X] T025 [US2] Contract: agregar a `tests/contract/web-api-informe-cierre.test.js` la aserción de cuadre — para cada `detalle.secciones[i]`, `subtotalHoras` igual a `resumen.filas` del mismo `legajo` (SC-002)

### Implementation for User Story 2

- [X] T026 [US2] En `src/presentismo/domain/informe-cierre.js`, completar `InformeDetalle.secciones` (extiende T009): agrupar `detalle[]` por empleado, calcular `subtotalHoras`, propagar marcas `corregida` / `justificacion` / `requiereJustificacionRevision`; sección sin `dias` para filas con `anomalia`
- [X] T027 [US2] En `src/web/view-model.js`, extender `construirVistaInformeCierre` para formatear el detalle: `entrada`/`salida`/`pausas` a `HH:MM`, `diaSemana` derivado de `fecha` (reusar `formatHoraMinuto` / `diaSemanaDe` ya existentes)
- [X] T028 [P] [US2] Extender `frontend/src/components/InformeCierrePrintable.jsx` — sección de detalle por empleado (tabla día × columnas), marca visible de corrección/justificación, `subtotalHoras` por empleado; `page-break-inside: avoid` por bloque de empleado cuando sea posible
- [X] T029 [P] [US2] `frontend/src/components/InformeCierrePrintable.test.jsx` — renderiza filas de detalle, muestra las marcas de corrección/justificación y el subtotal por empleado

**Checkpoint**: US1 + US2 verificables de forma independiente.

---

## Phase 5: User Story 3 - Advertir sobre pendientes antes de liquidar (Priority: P3)

**Goal**: ambos informes señalan explícitamente jornadas incompletas, empleados
sin categoría y días con corrección/justificación; si no hay ninguno, lo dicen.

**Independent Test**: con un período cerrado que tiene ≥1 jornada incompleta y
≥1 empleado sin categoría, `GET .../informe-cierre` trae `pendientes` con esas
listas (legajo + fechas); con un período limpio, `pendientes.hayPendientes ===
false` y la vista imprime "Sin pendientes de revisión".

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] Extender `tests/unit/presentismo-informe-cierre.test.js` — `pendientes.jornadasIncompletas` = `{ legajo, nombre, fechas: [días INCOMPLETA] }`; `pendientes.anomalias` = filas con `anomalia`; `pendientes.ajustes` = `{ legajo, nombre, fechas: [días con corrección o justificación] }`; `hayPendientes` true si alguna lista no vacía, false si todas vacías
- [X] T031 [US3] Contract: agregar a `tests/contract/web-api-informe-cierre.test.js` — un período con incompleta + anomalía devuelve `pendientes` con ambas listas pobladas; un período limpio devuelve `pendientes.hayPendientes === false`

### Implementation for User Story 3

- [X] T032 [US3] En `src/presentismo/domain/informe-cierre.js`, finalizar la derivación de `Pendientes` ([data-model.md](data-model.md) §5) a partir de las filas y el detalle (extiende T009/T026)
- [X] T033 [P] [US3] Extender `frontend/src/components/InformeCierrePrintable.jsx` — bloque "Pendientes de revisión" (incompletas / anomalías / ajustes con legajo y fechas) o el mensaje "Sin pendientes de revisión" cuando `hayPendientes === false`
- [X] T034 [P] [US3] Extender `frontend/src/components/InformeCierrePrintable.test.jsx` — lista de pendientes poblada y estado vacío

**Checkpoint**: las tres historias funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T035 [P] Agregar a `docs/presentismo.md` la sección "Informe al cierre del período": disparo (automático al cerrar + re-emisión manual), una sola copia por tramo, `obsoleto` tras reabrir, formato imprimible, endpoints `POST`/`GET /api/calendarios/:periodo/informe-cierre`, y que NO escribe en Oracle (Principio VI, fuera de alcance)
- [X] T036 [P] Nota en `.env.example` (sección presentismo): al cerrar un período ahora se escribe `P<periodo>/informe-cierre.json`; no hay variable nueva (usa `PRESENTISMO_RESUMEN_PERIODO` para el modo)
- [X] T037 Agregar a `tests/integration/informe-cierre.integration.test.js` el caso modo `QUINCENAL`: `cerrar 202607` crea entradas `Q1` y `Q2`; `GET .../informe-cierre?tramo=Q1` sólo abarca días 1–15 en `detalle` para todos los empleados
- [X] T038 Ejecutar los escenarios 1–9 de [quickstart.md](quickstart.md) contra `npm run web`; corregir cualquier desvío
- [X] T039 [P] Regresión completa: `npm test` y `npm --prefix frontend run test` en verde (incluye los tests existentes de `resumen-periodo` y `periodo-cerrado` sin cambios de comportamiento)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar ya
- **Foundational (Phase 2)**: depende de T001 (T006) y de T002/T003 para los handlers de fases siguientes; BLOQUEA todas las historias
- **US1 (Phase 3)**: depende de Foundational (T011, T009, T006)
- **US2 (Phase 4)**: depende de Foundational + de que exista el archivo de contract test (T012) y la vista imprimible (T021); no depende de completar US1 al 100%, pero comparte `informe-cierre.js`, `construirVistaInformeCierre` e `InformeCierrePrintable.jsx`
- **US3 (Phase 5)**: igual que US2; comparte los mismos tres archivos
- **Polish (Phase 6)**: depende de las historias que se quieran entregar

### User Story Dependencies

- **US1 (P1)**: sólo Foundational. Entrega el mecanismo completo emitir→persistir→leer→imprimir (resumen).
- **US2 (P2)**: Foundational. Añade la sección de detalle a la proyección, al view-model y a la vista imprimible. Testeable sola (aserción de cuadre + render de detalle).
- **US3 (P3)**: Foundational. Añade el bloque de pendientes. Testeable solo (listas + estado vacío).

### Within Each User Story

- Tests primero y en rojo, luego implementación
- `informe-cierre.js` (dominio) antes que `view-model.js` antes que los endpoints antes que el frontend
- `construirVistaInformeCierre` antes que `InformeCierrePrintable.jsx`

### Parallel Opportunities

- **Setup**: T001, T002, T003 en paralelo
- **Foundational**: T005, T007, T008, T010 en paralelo; T004 antes de T006; T009 tras T008; T011 al final
- **US1 tests**: T012, T013, T014 en paralelo
- **US1 impl**: T020, T021, T022 en paralelo (archivos frontend distintos); T015→T016→T017→T018 en serie (backend encadenado); T019 junto a T011/T016
- **US2**: T024 ∥ (T026→T027) ∥ T028/T029
- **US3**: T030 ∥ T032 ∥ T033/T034
- **Polish**: T035, T036, T039 en paralelo

---

## Parallel Example: User Story 1

```bash
# Tests de US1 juntos (deben fallar antes de implementar):
Task: "Contract test en tests/contract/web-api-informe-cierre.test.js"
Task: "Integration test en tests/integration/informe-cierre.integration.test.js"
Task: "Component test en frontend/src/components/AccionInformeCierre.test.jsx"

# Frontend de US1 en paralelo (archivos distintos):
Task: "frontend/src/api/informe-cierre-client.js"
Task: "frontend/src/components/InformeCierrePrintable.jsx (sección resumen)"
Task: "frontend/src/components/AccionInformeCierre.jsx"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1: Setup (T001–T003)
2. Phase 2: Foundational (T004–T011) — CRÍTICO, bloquea todo
3. Phase 3: US1 (T012–T023)
4. **PARAR y VALIDAR**: escenarios 1–6 de quickstart.md
5. Demo/entrega: ya se puede cerrar un período y emitir/imprimir el resumen

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → test independiente → demo (MVP: resumen + persistencia + impresión)
3. US2 → test independiente → demo (detalle empleado por empleado)
4. US3 → test independiente → demo (aviso de pendientes)
5. Polish → docs, caso QUINCENAL, regresión

### Notes

- `[P]` = archivos distintos, sin dependencias pendientes
- Verificar que los tests fallan antes de implementar (Principio IV)
- Commit por tarea o grupo lógico
- `informe-cierre.js`, `construirVistaInformeCierre` e `InformeCierrePrintable.jsx`
  se tocan en US1/US2/US3: dentro de una misma historia no hay conflicto, pero
  no trabajar US2 y US3 en paralelo sobre esos tres archivos sin coordinar
