# Implementation Plan: Servicio de Consulta Programada de Fichadas

**Branch**: `002-servicio-fichadas` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-servicio-fichadas-programado/spec.md`

## Summary

Servicio Node.js de larga duración que reutiliza el cliente TCP del
protocolo RS956 ya implementado (`001-consulta-fichadas-rs596`) para
sondear el reloj biométrico cada 5 minutos alrededor de dos checkpoints
diarios configurables (entrada ~07:00, salida ~16:00, margen ±30 min),
hasta que cada checkpoint se cierre por completitud (todos los empleados
activos fichados) o por vencimiento de su margen. Las fichadas recolectadas
se acumulan en memoria de proceso (sin persistencia), organizadas por
Empleado (legajo), Período (año-mes, derivado de la fecha ya decodificada
del evento) y checkpoint. El padrón de empleados activos se obtiene de una
interfaz `ActiveEmployeesProvider` — implementada por ahora con un adapter
placeholder de archivo local, a la espera de la integración real con
RRHH/Oracle (fuera de alcance de esta feature). Dado que el reloj no borra
fichadas y las vuelve a reportar como pendientes en cada ciclo, el store
deduplica por `rawHex` (FR-017) antes de acumular cualquier fichada. El
estado acumulado se expone mediante una función de consulta en proceso
(`getState()`), sin API HTTP en esta primera versión.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM) — mismo stack que
`001-consulta-fichadas-rs596`, en el mismo repositorio.

**Primary Dependencies**: Ninguna dependencia externa de runtime nueva. Se
reutiliza `src/protocol/client.js` de feature 001 tal cual, y solo
librería estándar de Node.js: `node:timers` (temporizador de 5 min),
`node:fs` (adapter placeholder de padrón de empleados activos, y log
NDJSON reutilizando el patrón de `session-logger.js`). Justificación: el
dominio de scheduling (2 checkpoints/día con margen) no necesita una
librería de cron (research.md §2); mantiene la política de feature 001 de
no sumar dependencias sin justificar el porqué.

**Storage**: Memoria de proceso únicamente (Map/objetos JS) para
Empleados, Fichadas y Períodos — sin DB ni archivos de salida (spec,
FR-009/Assumptions). Único acceso a filesystem: leer el archivo de
configuración placeholder del padrón de empleados activos y escribir el
log NDJSON de ciclos, igual que feature 001.

**Testing**: `node:test` + `node:assert` (igual que feature 001). Toda
lógica dependiente del reloj de pared recibe un `now()` inyectable
(research.md §2/§8) para tests deterministas sin esperar tiempo real.

**Target Platform**: Proceso Node.js de larga duración (daemon), mismo
entorno que el CLI existente de feature 001 (Windows/Linux con Node 20+ y
acceso de red al reloj).

**Project Type**: Single project (servicio backend) — no involucra
frontend en esta feature.

**Performance Goals**: Cada ciclo de sondeo (consulta + parseo +
actualización de estado en memoria) debe completar bien dentro de la
ventana de 5 minutos entre ticks; reutiliza el mismo cliente ya validado
en feature 001 para lotes de hasta 100 fichadas en <10s (SC de esa
feature).

**Constraints**: Una sola sesión TCP a la vez contra el reloj (heredado de
feature 001, FR-011 de esta spec); sin persistencia entre reinicios del
proceso (spec, Assumptions); el padrón de empleados activos depende de un
adapter placeholder hasta que exista integración real con RRHH/Oracle
(research.md §4); un único reloj RS956 por instancia del servicio (spec,
Assumptions).

**Scale/Scope**: Un único reloj RS956, un único proceso de servicio, un
padrón de empleados activos del orden de decenas a un par de cientos de
legajos (tamaño típico de plantilla de una organización, no miles); dos
checkpoints por día.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Aplica a esta feature | Evaluación |
|---|---|---|
| I. Arquitectura Frontend basada en Componentes (React) | No — esta feature no incluye UI, es un servicio backend | N/A — PASS |
| II. Repositorio de Datos Oracle Aislado | No en esta iteración — el padrón de empleados activos se sirve desde un adapter placeholder de archivo local, sin tocar Oracle (research.md §4); ninguna fichada se escribe a Oracle (herencia de FR-006 de feature 001) | N/A — PASS (revalidar cuando una feature futura reemplace el adapter placeholder por un repositorio Oracle real) |
| III. Protocolo RS956 Documentado y Aislado (NON-NEGOTIABLE) | Sí — el servicio consume el protocolo indirectamente | PASS — el diseño reutiliza `src/protocol/client.js` de feature 001 como caja negra (research.md §1); ningún código nuevo de esta feature construye o interpreta bytes crudos del protocolo |
| IV. Test-First en Capas Críticas (Protocolo y Datos) | Parcialmente — no se toca la capa de protocolo (ya cubierta por feature 001), pero se introduce una nueva capa "repository-like" (`ActiveEmployeesProvider`) que eventualmente frentará a Oracle, y una regla de datos no trivial (deduplicación de fichadas por `rawHex`, FR-017) | PASS — `/speckit-tasks` debe ordenar tests antes de implementación para `ActiveEmployeesProvider`, para la lógica de checkpoints/scheduler, y para la deduplicación de `FichadasMemoryStore` (research.md §9), siguiendo el mismo espíritu del principio aunque Oracle todavía no esté conectado |
| V. Observabilidad y Protección de Datos Sensibles | Sí | PASS — FR-015 exige log estructurado por ciclo; el diseño no persiste datos biométricos crudos (el store en memoria solo guarda lo que ya expone el cliente existente: método, fecha, hora, legajo, rawHex) ni credenciales |

**Resultado**: Sin violaciones. No se requiere `Complexity Tracking`.

**Re-check post-Fase 1 (tras generar research.md, data-model.md,
contracts/, quickstart.md)**: Sin cambios de resultado. El diseño
resultante mantiene `src/protocol/` intocado (Principio III), aísla la
dependencia externa de empleados activos detrás de una interfaz
reemplazable sin tocar Oracle todavía (Principio II), define contratos y
casos de test antes de implementar (Principio IV), y el estado en memoria
no expone datos biométricos ni credenciales (Principio V). Sigue sin
aplicar React (Principio I). PASS confirmado.

## Project Structure

### Documentation (this feature)

```text
specs/002-servicio-fichadas-programado/
├── plan.md                          # Este archivo (/speckit-plan)
├── research.md                      # Fase 0 (/speckit-plan)
├── data-model.md                    # Fase 1 (/speckit-plan)
├── quickstart.md                    # Fase 1 (/speckit-plan)
├── contracts/                       # Fase 1 (/speckit-plan)
│   ├── service-contract.md
│   ├── roster-provider-contract.md
│   └── state-schema.json
└── tasks.md                         # Fase 2 (/speckit-tasks — no se crea acá)
```

### Source Code (repository root)

```text
src/
├── protocol/                        # (existente, feature 001 — sin cambios)
├── logging/                         # (existente, feature 001)
│   └── session-logger.js
├── output/                          # (existente, feature 001 — no usado por esta feature)
├── cli/                             # (existente, feature 001)
├── roster/                          # NUEVO (feature 002) — padrón de empleados activos
│   ├── active-employees-provider.js       # Interfaz (contracts/roster-provider-contract.md)
│   └── local-file-active-employees-provider.js  # Adapter placeholder (archivo JSON local)
├── scheduling/                      # NUEVO (feature 002) — checkpoints y cadencia de sondeo
│   ├── checkpoint.js                      # Ventana de aceptación, transición de estados (data-model.md §3)
│   └── scheduler.js                       # Timer de 5 min, single-flight, orquestación de ciclos
├── store/                           # NUEVO (feature 002) — estado en memoria
│   └── fichadas-memory-store.js           # Empleado/Fichada/Período en memoria (data-model.md §1-4)
└── service/                         # NUEVO (feature 002) — punto de entrada del servicio
    └── consulta-programada-service.js     # startService()/getState()/stop() (contracts/service-contract.md)

tests/
├── contract/                        # (existente, feature 001 + nuevo si aplica)
├── unit/
│   ├── checkpoint.test.js                 # NUEVO — ventanas de aceptación y transición de estados
│   ├── fichadas-memory-store.test.js      # NUEVO — asociación a Empleado/Período/checkpoint
│   └── local-file-active-employees-provider.test.js  # NUEVO
└── integration/
    └── consulta-programada-service.integration.test.js  # NUEVO — scheduler completo contra mock TCP
```

**Structure Decision**: Proyecto único (Option 1 del template), mismo
repositorio que `001-consulta-fichadas-rs596`. Se agregan cuatro módulos
nuevos (`src/roster/`, `src/scheduling/`, `src/store/`, `src/service/`)
sin tocar `src/protocol/` (Principio III: sigue siendo el único lugar que
conoce bytes crudos del protocolo). `src/service/` es el punto de entrada
que orquesta los demás módulos nuevos más el cliente existente de
`src/protocol/client.js`.

## Complexity Tracking

> No aplica — el Constitution Check no encontró violaciones que requieran
> justificación.
