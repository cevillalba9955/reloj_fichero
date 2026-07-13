# Tasks: Servicio de Fichadas — Persistencia y Despliegue Desatendido en Linux

**Input**: Design documents from `/specs/005-servicio-despliegue-linux/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: INCLUIDOS. La Constitución (Principio IV) exige test-first en las capas críticas:
la **persistencia de fichadas** impacta la liquidación de haberes. Las tareas de test
preceden a su implementación.

**Organization**: agrupadas por historia de usuario. Stack: Node.js 20.12+ ESM,
`node:test`/`node:assert`, sin dependencias nuevas de runtime. Cambios quirúrgicos sobre las
features 002 y 004; artefactos de systemd en `deploy/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivo distinto, sin dependencias pendientes).
- **[Story]**: US1..US4. Setup/Foundational/Polish sin label.

## Path Conventions

Proyecto único: `src/`, `tests/`, `deploy/`, `docs/` en la raíz del repo (ver plan.md
§Project Structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: prerequisitos de plataforma y configuración compartida.

- [X] T001 Subir `engines.node` de `>=20` a `>=20.12` en `package.json` (research §7: los scripts usan `--env-file-if-exists`, Node ≥ 20.12)
- [X] T002 [P] Documentar en `.env.example` la variable `PRESENTISMO_FICHADAS_DIR` para el servicio y aclarar que `FICHADAS_ROSTER_CONFIG` puede apuntar a `./data/presentismo/padron.json` (snapshot 004)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: endurecer el archivo acumulativo de fichadas (feature 004) que la persistencia
del servicio usa como destino y `calcular` como lector concurrente. Bloquea US1.

**⚠️ CRITICAL**: la persistencia (US1) escribe sobre este archivo; hacerlo atómico primero
de-riesga el resto.

- [X] T003 [P] Test unitario de escritura atómica y salto-sin-altas de `registrarFichadas` (un lector nunca ve archivo truncado; un ciclo sin altas no reescribe; dedup por `rawHex` intacta) en `tests/unit/presentismo-fichadas-archive.test.js`
- [X] T004 Implementar en `src/presentismo/adapters/file-fichadas-archive.js` la escritura atómica (temp + `renameSync`) y el salto de escritura cuando no hay altas, hasta que T003 pase y los tests existentes sigan verdes

**Checkpoint**: el archivo de fichadas es seguro para un escritor de larga duración + lector concurrente.

---

## Phase 3: User Story 1 - Fichadas recolectadas quedan disponibles para el cálculo (Priority: P1) 🎯 MVP

**Goal**: el servicio persiste cada ciclo las fichadas obtenidas en
`data/presentismo/fichadas/<periodo>.json`, deduplicadas por `rawHex`, de modo que `calcular`
las consuma sin importación manual y sin perderlas ante reinicios.

**Independent Test**: correr el servicio contra el mock TCP (o reloj real dentro de ventana),
verificar que el archivo del período se crea/actualiza con `rawHex`, que `archive-fichadas-provider`
(y `calcular`) lo lee, que un reinicio no baja el conteo y que repetir el ciclo no duplica.

### Tests for User Story 1 ⚠️ (escribir primero, deben fallar)

- [X] T005 [P] [US1] Test unitario del sink de persistencia (`createFichadasSink`): agrupa por período (`fecha`→`YYYYMM`; sin fecha → período de recolección), hace upsert por `registrarFichadas`, dedup entre ciclos, y round-trip con `archive-fichadas-provider`, en `tests/unit/consulta-programada-fichadas-sink.test.js`
- [X] T006 [P] [US1] Test de integración: un ciclo `success` del scheduler (mock TCP) escribe el archivo del período y `archive-fichadas-provider` lee lo escrito; un fallo de persistencia registra el ciclo como `error` y reintenta el próximo ciclo sin perder fichadas, en `tests/integration/consulta-programada-service.integration.test.js`

### Implementation for User Story 1

- [X] T007 [US1] Agregar el sink opcional `persistirFichadas(fichadas)` a `createScheduler` en `src/scheduling/scheduler.js`: tras un ciclo `success`, si hay sink y hubo registros, persistir TODAS las fichadas parseadas del ciclo (dedup en disco hace el reintento idempotente); un fallo se registra como ciclo `error` sin `rawHex` en `detail` (Principio V)
- [X] T008 [US1] Propagar `persistirFichadas` desde `startService` al scheduler en `src/service/consulta-programada-service.js` (opcional; sin sink el servicio no persiste, comportamiento legacy)
- [X] T009 [US1] En `src/cli/consulta-programada.js` (composition root): implementar `createFichadasSink({ archiveDir })` que agrupa por período y llama a `registrarFichadas`; agregar `fichadasArchiveDir` a `parseCliArgs` (`--fichadas-archive-dir` / `PRESENTISMO_FICHADAS_DIR`, default `./data/presentismo/fichadas`); construir el sink y pasarlo a `startService` en `runService`

**Checkpoint**: US1 funcional — el servicio es productor en vivo del archivo que consume `calcular`.

---

## Phase 4: User Story 2 - El servicio corre desatendido y se recupera solo (Priority: P2)

**Goal**: el servicio arranca al boot, se reinicia ante fallo y se apaga limpio, corriendo
como unit de systemd, con una guía de despliegue reproducible.

**Independent Test**: en un Linux con systemd, instalar el unit, reiniciar el servidor y ver
el servicio `active` sin intervención; enviar SIGTERM y ver el apagado limpio (exit 0) sin
cortar una consulta en curso.

### Implementation for User Story 2

- [X] T010 [P] [US2] Crear `deploy/rs956-fichadas.service` (Type=simple; User/Group `rs956`; `WorkingDirectory=/opt/rs956`; `ExecStart=/usr/bin/node --env-file-if-exists=.env src/cli/consulta-programada.js`; `Restart=on-failure`, `RestartSec=10`, `TimeoutStopSec=30`; endurecimiento `NoNewPrivileges`/`ProtectSystem=strict`/`ProtectHome`/`ReadWritePaths=/opt/rs956/logs /opt/rs956/data`; `WantedBy=multi-user.target`) conforme a [contracts/systemd-deployment.md](./contracts/systemd-deployment.md)
- [X] T011 [US2] Crear la guía `docs/despliegue-linux.md` (prerrequisitos Node ≥ 20.12 y red al reloj; instalación usuario/dir + `npm ci`; provisión de `.env` y `config`/snapshot; activación de units; verificación con `systemctl`/`journalctl`; rollback) conforme al contrato

**Checkpoint**: el servicio corre como daemon de systemd, con arranque al boot y apagado limpio.

---

## Phase 5: User Story 3 - Operación confiable día tras día (Priority: P2)

**Goal**: el servicio recolecta en las ventanas de cada día calendario mediante un reinicio
diario programado, sin perder fichadas ya persistidas.

**Independent Test**: verificar con `systemctl list-timers` el próximo disparo ~06:00; forzar
el reinicio (`systemctl start rs956-fichadas-restart.service`) y confirmar que el servicio
vuelve a consultar en las ventanas del día y que el archivo del período conserva las fichadas.

### Implementation for User Story 3

- [X] T012 [P] [US3] Crear `deploy/rs956-fichadas-restart.service` (Type=oneshot; `ExecStart=/bin/systemctl restart rs956-fichadas.service`) conforme al contrato
- [X] T013 [P] [US3] Crear `deploy/rs956-fichadas-restart.timer` (`OnCalendar=*-*-* 06:00:00`, `Persistent=true`, `WantedBy=timers.target`) conforme al contrato
- [X] T014 [US3] Documentar en `docs/despliegue-linux.md` el rollover diario: instalación/habilitación del timer, verificación (`list-timers`) y por qué el reinicio no pierde fichadas (ya persistidas — depende de US1)

**Checkpoint**: el servicio opera de forma continua multi-día sin intervención.

---

## Phase 6: User Story 4 - Padrón desde el snapshot local, sin Oracle en runtime (Priority: P3)

**Goal**: el servicio resuelve los empleados activos desde el snapshot local de presentismo
(formato `{ empleados: [{legajo}] }`) además del legacy, sin abrir Oracle en runtime.

**Independent Test**: apuntar `FICHADAS_ROSTER_CONFIG` al snapshot 004 y verificar que el
servicio resuelve los legajos y opera sin conexión a la base; que el legacy sigue funcionando;
y que un snapshot ausente/ilegible/sin legajos se reporta como padrón no disponible sin frenar.

### Tests for User Story 4 ⚠️ (escribir primero, deben fallar)

- [X] T015 [P] [US4] Ampliar `tests/unit/local-file-active-employees-provider.test.js`: esquema snapshot 004 (`empleados[].legajo`), dedup y descarte de inválidos, lista vacía tras normalizar → `RosterNoDisponibleError`, y que el esquema legacy sigue devolviendo lo esperado

### Implementation for User Story 4

- [X] T016 [P] [US4] Crear `src/roster/legajo.js` con `interpretarLegajo` (entero ≥ 1; string solo-dígitos; null si inválido), regla única compartida
- [X] T017 [US4] Refactorizar `src/roster/oracle-active-employees-provider.js` para importar `interpretarLegajo` de `legajo.js` (sin duplicar la regla; sus tests deben seguir verdes)
- [X] T018 [US4] Ampliar `src/roster/local-file-active-employees-provider.js`: aceptar `{ empleados: [...] }` (snapshot 004) además de `{ legajosActivos: [...] }`, normalizar con `interpretarLegajo` (dedup/descarte), y rechazar con `RosterNoDisponibleError` si no hay ningún esquema o queda vacío, hasta que T015 pase

**Checkpoint**: el servicio opera con el snapshot local como padrón, sin Oracle en runtime.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: validación end-to-end, auditoría de privacidad y cierre.

- [X] T019 [P] Ejecutar la validación de [quickstart.md](./quickstart.md) (round-trip local servicio → `calcular`) y corregir desvíos
- [X] T020 [P] Auditar que ningún log NDJSON del servicio (`logs/service-*.ndjson`, `logs/session-*.ndjson`) ni stdout contienen `rawHex` ni credenciales (Principio V / SC-008)
- [X] T021 Ejecutar la suite completa `node --test` y confirmar verde sin regresiones en las features 001–004

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; BLOQUEA US1 (persistencia escribe en el archivo endurecido).
- **US1 (Phase 3)**: depende de Foundational. Independiente de US2/US3/US4.
- **US2 (Phase 4)**: depende de Setup. Independiente de US1/US4.
- **US3 (Phase 5)**: depende de US2 (el timer reinicia el unit del servicio de US2).
- **US4 (Phase 6)**: depende de Setup. Independiente del resto.
- **Polish (Phase 7)**: depende de las historias que se quieran cerrar (US1 para el round-trip).

### User Story Dependencies

- **US1 (P1)**: Foundational. Sin dependencias de otras historias.
- **US2 (P2)**: solo Setup.
- **US3 (P2)**: US2 (reinicia el servicio de systemd de US2).
- **US4 (P3)**: solo Setup.

### Within Each User Story

- Tests primero (deben fallar), luego implementación (Principio IV).
- En US1: dominio del sink/scheduler antes que el cableado del CLI.
- En US4: helper `legajo.js` y refactor Oracle antes de ampliar el lector por archivo.

### Parallel Opportunities

- Setup: T002 en paralelo con T001.
- Tras Setup+Foundational, US1, US2 y US4 pueden avanzar en paralelo (tocan archivos distintos); US3 tras US2.
- Tests `[P]` de una historia en paralelo entre sí (T005/T006; T015).
- Artefactos `[P]` de systemd (T010; T012/T013) en paralelo.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 juntos (deben fallar antes de implementar):
Task: "Test del sink en tests/unit/consulta-programada-fichadas-sink.test.js"
Task: "Test de integración de persistencia en tests/integration/consulta-programada-service.integration.test.js"

# Implementación US1 en orden (scheduler → service → CLI):
Task: "Sink en src/scheduling/scheduler.js"
Task: "Pass-through en src/service/consulta-programada-service.js"
Task: "createFichadasSink + wiring en src/cli/consulta-programada.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 Setup → Fase 2 Foundational → Fase 3 US1.
2. **DETENER y VALIDAR**: el servicio persiste las fichadas y `calcular` las consume
   (quickstart §2). Es el valor central de la feature, validable localmente sin systemd.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. + US1 → persistencia durable (MVP, núcleo de valor).
3. + US2 → servicio desatendido con systemd.
4. + US3 → continuidad multi-día (reinicio diario).
5. + US4 → padrón desde el snapshot local (sin Oracle en runtime).
6. Polish → quickstart, auditoría de logs, suite completa.

### Parallel Team Strategy

Tras Foundational: US1, US2 y US4 en paralelo; US3 apoyado en US2.

---

## Notes

- `[P]` = archivos distintos, sin dependencias pendientes.
- `[Story]` mapea la tarea a su historia para trazabilidad.
- Verificar que los tests fallan antes de implementar (Principio IV).
- Commit por tarea o grupo lógico, en la rama `005-servicio-despliegue-linux` (nunca directo a `main`).
- Los artefactos de `deploy/` y la guía no tienen test automatizado; se validan en el servidor (quickstart §3).

## Task Summary

- **Total**: 21 tareas (T001–T021).
- **Por fase**: Setup 2 · Foundational 2 · US1 5 · US2 2 · US3 3 · US4 4 · Polish 3.
- **Tests incluidos**: unitarios (sink, archivo atómico, padrón por archivo) e integración
  (servicio → persistencia → `calcular`) — exigidos por Principio IV.
- **MVP**: US1 (Fases 1–3), persistencia durable de fichadas para el cálculo.
