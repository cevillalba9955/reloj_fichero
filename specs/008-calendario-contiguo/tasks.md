---
description: "Task list for feature 008 — Generación de Calendario Contigua"
---

# Tasks: Generación de Calendario desde la IU con Contigüidad Garantizada

**Input**: Design documents from `/specs/008-calendario-contiguo/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/web-api.md](contracts/web-api.md)

**Tests**: Incluidas. La constitución (Principio IV) exige test-first en la lógica de negocio
correctness-critical; la guarda de contigüidad y la frontera generable se cubren primero en el
backend, y los componentes con Vitest.

**Organization**: Tareas agrupadas por historia de usuario. La aritmética de períodos y la
frontera generable son foundational (las consumen las tres historias).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencia de tarea incompleta).
- **[Story]**: US1 / US2 / US3 (solo en fases de historia).
- Rutas de archivo exactas incluidas.

## Path Conventions

Web app existente: backend en `src/`, frontend en `frontend/src/`, tests en `tests/` y
`frontend/src/**/*.test.jsx`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Punto de partida verificable sobre la rama `008-calendario-contiguo`.

- [ ] T001 Confirmar baseline verde: ejecutar `npm test` (backend) y `cd frontend && npm test` y registrar que pasan antes de tocar código, sobre la rama `008-calendario-contiguo`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Aritmética de períodos + cálculo y exposición de la frontera generable. Bloquea a
las tres historias (todas dependen de `generables`/`mesActual`).

**⚠️ CRITICAL**: Ninguna historia puede completarse hasta terminar esta fase.

- [ ] T002 [P] Unit tests (test-first) de `periodoAnterior`/`periodoSiguiente` (cruce de año dic→ene y ene→dic, validación de `YYYYMM` inválido) en `tests/unit/presentismo-calendario-mes.test.js`.
- [ ] T003 Implementar helpers puros `periodoAnterior(periodo)` y `periodoSiguiente(periodo)` (o `desplazarPeriodo`) en `src/presentismo/domain/calendario-mes.js`, validando con `parsePeriodo`. Hace pasar T002.
- [ ] T004 Implementar `calcularFronteraGenerable({ periodos, mesActual })` y un helper `mesActualPeriodo(now)` (deriva `YYYYMM` de `hoyLocal`) en `src/web/view-model.js` (depende de T003).
- [ ] T005 Extender `GET /api/calendarios` para devolver `mesActual` y `generables` (además de `periodos`/`ultimo`) usando T004, en `src/web/api/calendario-handlers.js` (depende de T004).
- [ ] T006 Contract test del `GET` extendido: `mesActual` y `generables` correctos en 3 casos — sin períodos (`generables=[mesActual]`), caso normal (`{min-1, max+1}`), y caso `max = mesActual` (solo backfill `min-1`) — en `tests/contract/web-api-calendario.test.js` (verifica T005).
- [ ] T007 Frontend: en `frontend/src/App.jsx`, leer y almacenar `mesActual` y `generables` desde `listarCalendarios()` y propagarlos como props a `NavegacionMes` y `EstadoVacio` (depende de T005).

**Checkpoint**: El backend expone la frontera generable y la UI la recibe. Las historias pueden avanzar.

---

## Phase 3: User Story 1 - Generar el mes contiguo faltante (Priority: P1) 🎯 MVP

**Goal**: Desde un mes vacío generable (semilla o adyacente y no futuro), un botón genera el
calendario, lo persiste y muestra la grilla; invocar sobre un mes ya generado es idempotente.

**Independent Test**: Con al menos un mes generado, navegar al mes contiguo generable, presionar
"Generar calendario" y ver la grilla del mes recién generado; repetir la generación no duplica.

- [ ] T008 [US1] Contract test: `POST /api/calendarios/:periodo/generar` sobre un período de `generables` → 200 con `VistaCalendarioMes`; sobre un período **ya generado** → 200 sin regenerar ni duplicar; en `tests/contract/web-api-calendario.test.js` (depende de T006, mismo archivo).
- [ ] T009 [P] [US1] Integration test (test-first) del flujo feliz: repo vacío → generar semilla (`mesActual`) → generar `max+1` (si ≤ `mesActual`), verificando que la secuencia se extiende y la frontera se recalcula, en `tests/integration/generar-calendario-contiguo.test.js` (archivo nuevo).
- [ ] T010 [US1] Endurecer `POST /:periodo/generar` en `src/web/api/calendario-handlers.js`: idempotencia (si el período ya está generado, devolver la vista actual **sin** llamar a `generarCalendario`) y, en éxito, devolver la `VistaCalendarioMes` recién generada. Hace pasar T008/T009 (parte feliz).
- [ ] T011 [US1] Frontend `frontend/src/components/EstadoVacio.jsx`: mostrar el botón "Generar calendario" **solo** cuando el período mostrado ∈ `generables` (recibido por props), en lugar de mostrarlo siempre.
- [ ] T012 [US1] Frontend `frontend/src/App.jsx`: tras una generación exitosa, refrescar también `generables` y `mesActual` (no solo `periodos`) para reflejar la nueva frontera (mismo archivo que T007; secuencial).
- [ ] T013 [P] [US1] Component test `frontend/src/components/EstadoVacio.test.jsx`: el botón aparece solo cuando el período es generable y su `onClick` dispara la acción.

**Checkpoint**: US1 funcional e independiente — se generan meses contiguos generables desde la IU.

---

## Phase 4: User Story 2 - Impedir saltos: no dejar huecos (Priority: P1)

**Goal**: El backend rechaza generar períodos no contiguos o futuros; la UI no ofrece "Generar"
en meses vacíos no generables y explica qué período debe generarse primero.

**Independent Test**: Intentar generar (por API) un mes a ≥2 de distancia del extremo → 409
`PERIODO_NO_CONTIGUO`; un mes posterior al actual → 409 `PERIODO_FUTURO`; en la UI, un mes vacío
no generable no muestra botón y sí un mensaje con el período requerido.

- [ ] T014 [US2] Contract test: `POST /:periodo/generar` sobre período no contiguo → 409 `PERIODO_NO_CONTIGUO` (mensaje identifica el período a generar primero); sobre período posterior a `mesActual` → 409 `PERIODO_FUTURO`; en `tests/contract/web-api-calendario.test.js` (mismo archivo que T008; secuencial).
- [ ] T015 [US2] Integration test: repo con secuencia → intentar saltear (`max+2`) → rechazo y secuencia intacta; backfill `min-1` → 200 y secuencia extendida hacia atrás; en `tests/integration/generar-calendario-contiguo.test.js` (mismo archivo que T009; secuencial).
- [ ] T016 [US2] Agregar las guardas a `POST /:periodo/generar` en `src/web/api/calendario-handlers.js`: 409 `PERIODO_FUTURO` si `> mesActual`; 409 `PERIODO_NO_CONTIGUO` (con mensaje "generá primero X") si no es adyacente; orden formato → ya-generado → futuro → no-contiguo → generar (mismo archivo que T010; secuencial). Hace pasar T014/T015.
- [ ] T017 [US2] Frontend `frontend/src/components/EstadoVacio.jsx`: cuando el período mostrado está vacío y ∉ `generables`, mostrar un mensaje que identifique el período generable más cercano en la dirección del mostrado (mismo archivo que T011; secuencial).
- [ ] T018 [US2] Component test `frontend/src/components/EstadoVacio.test.jsx`: período vacío no generable no muestra botón y muestra el mensaje de no-contiguo (mismo archivo que T013; secuencial).

**Checkpoint**: US1 + US2 — imposible crear huecos desde la IU; los rechazos por API son explícitos.

---

## Phase 5: User Story 3 - Navegación acotada a lo generable (Priority: P2)

**Goal**: Los controles de navegación no dejan aterrizar en un mes vacío no generable; se
deshabilitan según los flags del backend, eliminando la regla local no verificable del trabajo
previo.

**Independent Test**: Desde el último mes generado, "mes siguiente" lleva al frontera generable
(si existe) y desde ahí queda deshabilitado; si `max+1` es futuro, "mes siguiente" está
deshabilitado desde el último generado; simétrico para "mes anterior".

- [ ] T019 [US3] Frontend `frontend/src/components/NavegacionMes.jsx`: deshabilitar "siguiente" ⟺ `periodoSiguiente(P) ∉ periodos ∪ generables` y "anterior" ⟺ `periodoAnterior(P) ∉ periodos ∪ generables`, usando props del backend; **eliminar** `periodoHoy()`/`siguienteLocked` y toda comparación con la fecha del cliente.
- [ ] T020 [US3] Frontend `frontend/src/App.jsx`: asegurar que `periodos` y `generables` se pasan como props a `NavegacionMes` (ajustar si T007 no lo cubrió) (mismo archivo que T007/T012; secuencial).
- [ ] T021 [P] [US3] Component test `frontend/src/components/NavegacionMes.test.jsx`: "siguiente" deshabilitado más allá del frontera; "siguiente" deshabilitado cuando `max+1` es futuro; "anterior" deshabilitado en el borde `min-1`.

**Checkpoint**: Las tres historias funcionan de forma independiente y la contigüidad es visible en la navegación.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistencia, limpieza y validación final.

- [ ] T022 [P] Actualizar la nota de no-goals: el contrato de la 007 decía "No genera meses"; dejar constancia en `specs/007-ui-calendario-mensual/contracts/web-api.md` (o en la doc de la web) de que la feature 008 lo deroga, apuntando a `specs/008-calendario-contiguo/contracts/web-api.md`.
- [ ] T023 Eliminar código muerto/de depuración remanente del trabajo previo en `frontend/src/components/NavegacionMes.jsx` y `frontend/src/App.jsx` (no debe quedar lógica de fecha del cliente ni logs de debug).
- [ ] T024 Ejecutar la suite completa: `npm test` (backend) y `cd frontend && npm test`; asegurar verde y sin regresiones en los tests de la feature 007.
- [ ] T025 [P] Ejecutar la validación de [quickstart.md](quickstart.md) end-to-end (API y navegador) y confirmar SC-001..SC-004.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. **BLOQUEA** todas las historias (frontera generable).
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: depende de Foundational. Comparte archivos con US1 (handlers + EstadoVacio) → secuencial respecto de US1 en esos archivos.
- **US3 (Phase 5)**: depende de Foundational. Independiente de US1/US2 salvo props en `App.jsx` (secuencial en ese archivo).
- **Polish (Phase 6)**: depende de las historias deseadas completas.

### Within Each User Story

- Tests antes de implementación (test-first en backend).
- Dominio/helpers → view-model → handler → frontend.
- Los archivos compartidos (`calendario-handlers.js`, `App.jsx`, `EstadoVacio.jsx`,
  `EstadoVacio.test.jsx`, `web-api-calendario.test.js`) se editan de forma **secuencial** entre
  tareas/historias; no marcar `[P]` entre tareas del mismo archivo.

### Parallel Opportunities

- T002 (unit test helpers) en paralelo con la redacción de otros tests foundational.
- T009 (integration nuevo archivo) `[P]` respecto de tareas de otros archivos.
- Tests de componente en archivos propios: T013, T021 marcados `[P]` cuando no colisionan.
- Una vez terminada la Foundational, US3 puede desarrollarse en paralelo a US1/US2 (toca
  `NavegacionMes.jsx`, archivo no usado por US1/US2), salvo el ajuste de props en `App.jsx`.

---

## Parallel Example: Foundational

```bash
# Test-first en archivos distintos:
Task T002: "Unit tests de periodoAnterior/periodoSiguiente en tests/unit/presentismo-calendario-mes.test.js"
# (luego, secuencial por dependencia de datos)
Task T003 → T004 → T005 → T006 → T007
```

## Parallel Example: cross-story tras Foundational

```bash
# Con Foundational lista, en paralelo por tocar archivos distintos:
Dev A (US1): T010 (handlers) + T011 (EstadoVacio)
Dev C (US3): T019 (NavegacionMes)   # archivo independiente
# Coordinar App.jsx (T012/T020) de forma secuencial entre devs.
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational, CRÍTICA) → 3. Phase 3 (US1).
4. **STOP & VALIDATE**: generar un mes contiguo generable desde la IU y ver la grilla.
5. Demo del MVP.

### Incremental Delivery

1. Foundational lista → frontera generable disponible.
2. US1 → generación feliz (MVP) → demo.
3. US2 → imposibilidad de huecos (guardas + mensaje) → demo.
4. US3 → navegación acotada → demo.

---

## Notes

- `[P]` = archivos distintos, sin dependencia; nunca entre dos tareas del mismo archivo.
- La regla de contigüidad es autoritativa en el backend (Principio I); la UI solo renderiza flags.
- Verificar que los tests fallan antes de implementar (T002, T006, T008/T009, T014/T015).
- Commit por tarea o grupo lógico; frenar en cada checkpoint para validar la historia.
