# Implementation Plan: Padrón Real de Empleados Activos desde Oracle/RRHH

**Branch**: `003-padron-oracle-rrhh` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-padron-oracle-rrhh/spec.md`

## Summary

Reemplazo configurable del origen del padrón de empleados activos del
servicio de consulta programada (`002-servicio-fichadas-programado`): en
vez del archivo local placeholder, una vista de solo lectura provista por
RRHH/DBA en la base Oracle de la empresa. El diseño respeta el contrato
`ActiveEmployeesProvider` existente (reemplazo drop-in, FR-001) y se
compone de tres piezas nuevas: (1) una capa de repositorio Oracle dedicada
(`src/db/`, único lugar con SQL — Constitución Principio II) usando
`node-oracledb` en modo thin (única dependencia de runtime nueva del
proyecto, justificada en research.md §1); (2) un adapter
`OracleActiveEmployeesProvider` que normaliza el resultado (deduplicación
y descarte de legajos inválidos, FR-012); y (3) un decorator
`DailyCachedActiveEmployeesProvider` que implementa la política acordada
en Clarifications: una consulta a la fuente por día de servicio (FR-014,
con reintentos hasta lograrla), respaldo con el último padrón válido
aunque sea de días previos (FR-008), y padrón vacío tratado como fuente
no disponible (FR-011). La configuración (credenciales, connect string,
nombre de la vista) llega por variables de entorno con validación
fail-fast al arranque (FR-004/FR-005); el CLI suma un flag explícito
`--padron archivo|oracle` (FR-013, default `archivo` para no cambiar el
comportamiento existente). Cada obtención del padrón se registra en un log
NDJSON dedicado sin credenciales (FR-010, Principio V).

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM) — mismo stack que
las features 001 y 002, mismo repositorio.

**Primary Dependencies**: `node-oracledb` (^6.x, modo thin — driver
oficial de Oracle, JavaScript puro, sin necesidad de Oracle Instant
Client). Es la **primera dependencia de runtime externa del proyecto**;
justificación y alternativas en research.md §1 (no existe forma razonable
de hablar el protocolo de red de Oracle desde la librería estándar). Todo
lo demás sigue siendo librería estándar (`node:test`, `node:fs`,
`node:util`).

**Storage**: Sin almacenamiento nuevo. Lectura de una vista Oracle de
RRHH (solo lectura, mínimo privilegio — Principio II); el snapshot del
padrón y su respaldo viven en memoria de proceso (spec, Assumptions), y
el único filesystem es el log NDJSON de obtenciones del padrón (mismo
patrón que los loggers existentes).

**Testing**: `node:test` + `node:assert` (igual que 001/002). La capa de
repositorio se testea con una fábrica de conexiones inyectable (fake del
cliente Oracle) — sin base real en la suite (research.md §8); un smoke
test manual contra Oracle real queda documentado en quickstart.md,
condicionado a variables de entorno presentes.

**Target Platform**: Mismo proceso daemon Node.js de la feature 002
(Windows/Linux, Node 20+), ahora con acceso de red adicional a la base
Oracle de RRHH.

**Project Type**: Single project (servicio backend) — sin frontend.

**Performance Goals**: Obtención del padrón (≤ ~500 legajos) en <5s en
condiciones normales (SC-004); una sola consulta a Oracle por día de
servicio (FR-014), por lo que la carga sobre la base es despreciable.

**Constraints**: Timeout configurable por consulta (FR-009, default 10s)
para no bloquear el ciclo de sondeo de 5 minutos; credenciales solo por
variables de entorno, nunca versionadas ni en argv (FR-004); fail-fast al
arranque si falta configuración (FR-005); el contrato
`ActiveEmployeesProvider` de la feature 002 no cambia (FR-001/FR-006); el
adapter de archivo local sigue disponible por configuración (FR-013).

**Scale/Scope**: Un padrón de decenas a ~500 legajos, una vista Oracle,
una consulta por día de servicio; sin cambios en scheduler, store,
checkpoints ni protocolo RS956.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica a esta feature | Evaluación |
|---|---|---|
| I. Arquitectura Frontend basada en Componentes (React) | No — sin UI | N/A — PASS |
| II. Repositorio de Datos Oracle Aislado | **Sí — esta es la feature que lo activa por primera vez** | PASS con diseño: todo SQL vive únicamente en `src/db/oracle-roster-repository.js`; credenciales y connect string exclusivamente por variables de entorno (nunca hardcodeadas, versionadas ni en argv); acceso de solo lectura con usuario de mínimo privilegio (SELECT sobre la vista del padrón, nada más); el nombre de vista/columna configurables se validan como identificadores SQL estrictos para impedir inyección (research.md §2) |
| III. Protocolo RS956 Documentado y Aislado (NON-NEGOTIABLE) | Sí, indirectamente — el servicio consumidor usa el cliente existente | PASS — esta feature no toca `src/protocol/` ni interpreta bytes; solo cambia el origen del padrón detrás de una interfaz ya aislada |
| IV. Test-First en Capas Críticas (Protocolo y Datos) | **Sí — se introduce la primera capa de repositorio Oracle real** | PASS — `/speckit-tasks` DEBE ordenar tests antes de implementación para: el repositorio Oracle (con conexión fake inyectada), la configuración por entorno (fail-fast, sin eco de secretos), la normalización del padrón (FR-012) y el decorator de cache diario (FR-008/FR-011/FR-014). Ciclo Red-Green-Refactor obligatorio en la capa de datos |
| V. Observabilidad y Protección de Datos Sensibles | Sí | PASS — cada obtención del padrón se loguea estructurada (NDJSON: resultado, cantidad, duración, origen fresco/respaldo, antigüedad del respaldo) sin credenciales ni connect string completo; minimización de datos: de RRHH solo se lee el legajo, ningún otro dato personal (spec, Key Entities) |

**Resultado**: Sin violaciones. La dependencia nueva (`node-oracledb`) no
viola ningún principio — la política del proyecto de "no sumar
dependencias sin justificación" se satisface en research.md §1. No se
requiere `Complexity Tracking`.

**Re-check post-Fase 1 (tras generar research.md, data-model.md,
contracts/, quickstart.md)**: Sin cambios de resultado. El diseño
resultante concentra el SQL en un único archivo de la capa `src/db/`
(Principio II), no toca `src/protocol/` (Principio III), define contratos
y casos de test antes de implementar (Principio IV), y el log de
obtenciones no expone secretos ni datos personales más allá del legajo
(Principio V). Sigue sin aplicar React (Principio I). PASS confirmado.

## Project Structure

### Documentation (this feature)

```text
specs/003-padron-oracle-rrhh/
├── plan.md                          # Este archivo (/speckit-plan)
├── research.md                      # Fase 0 (/speckit-plan)
├── data-model.md                    # Fase 1 (/speckit-plan)
├── quickstart.md                    # Fase 1 (/speckit-plan)
├── contracts/                       # Fase 1 (/speckit-plan)
│   ├── oracle-roster-repository-contract.md
│   ├── env-config-contract.md
│   └── daily-roster-cache-contract.md
└── tasks.md                         # Fase 2 (/speckit-tasks — no se crea acá)
```

### Source Code (repository root)

```text
src/
├── protocol/                        # (existente, features 001/002 — sin cambios)
├── logging/                         # (existente)
│   ├── session-logger.js
│   ├── service-cycle-logger.js
│   └── roster-fetch-logger.js             # NUEVO — log NDJSON de obtenciones del padrón (FR-010)
├── store/                           # (existente, feature 002 — sin cambios)
├── scheduling/                      # (existente, feature 002 — sin cambios)
├── service/                         # (existente, feature 002 — sin cambios)
├── db/                              # NUEVO (feature 003) — capa repositorio Oracle (Principio II)
│   ├── oracle-roster-config.js            # Lectura/validación fail-fast de variables de entorno (FR-004/FR-005)
│   └── oracle-roster-repository.js        # ÚNICO archivo con SQL; node-oracledb thin (contracts/oracle-roster-repository-contract.md)
├── roster/                          # (existente, feature 002 + nuevos adapters)
│   ├── active-employees-provider.js             # (existente — contrato sin cambios, FR-001/FR-006)
│   ├── local-file-active-employees-provider.js  # (existente — sigue disponible, FR-013)
│   ├── oracle-active-employees-provider.js      # NUEVO — repositorio → Empleado[], normalización (FR-012)
│   └── daily-cached-active-employees-provider.js # NUEVO — decorator: 1 consulta/día, respaldo, vacío=no disponible (FR-008/FR-011/FR-014)
└── cli/
    ├── consultar-fichadas.js              # (existente, feature 001 — sin cambios)
    └── consulta-programada.js             # MODIFICADO — flag --padron archivo|oracle (FR-013), wiring fail-fast

tests/
├── unit/
│   ├── oracle-roster-config.test.js             # NUEVO — fail-fast, mensajes sin secretos
│   ├── oracle-roster-repository.test.js         # NUEVO — SQL único, identificadores validados, timeout, cierre de conexión (conexión fake)
│   ├── oracle-active-employees-provider.test.js # NUEVO — mapeo y normalización (FR-012)
│   ├── daily-cached-active-employees-provider.test.js # NUEVO — FR-008/FR-011/FR-014
│   └── roster-fetch-logger.test.js              # NUEVO — NDJSON sin credenciales (Principio V)
└── integration/
    └── consulta-programada-oracle-roster.integration.test.js  # NUEVO — servicio completo contra mock TCP + repositorio fake
```

**Structure Decision**: Proyecto único, mismo repositorio que 001/002. Se
agrega un módulo nuevo `src/db/` que inaugura la capa de repositorio
Oracle exigida por el Principio II (único lugar del repo donde puede
existir SQL), dos adapters nuevos en `src/roster/` que se enchufan detrás
del contrato existente sin modificarlo, y un logger nuevo en
`src/logging/` reutilizando el patrón NDJSON. `src/scheduling/`,
`src/store/`, `src/service/` y `src/protocol/` no se tocan — la política
de una consulta diaria (FR-014) vive enteramente en el decorator, de modo
que el scheduler puede seguir llamando `getActiveEmployees()` en cada
tick sin enterarse del cambio (la nota "sin cache" del contrato de la
feature 002 queda formalmente superseded por FR-014; ver
contracts/daily-roster-cache-contract.md).

## Complexity Tracking

> No aplica — el Constitution Check no encontró violaciones que requieran
> justificación.
