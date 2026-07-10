# Implementation Plan: Dominio de Presentismo — Cálculo de Horas Trabajadas por Período

**Branch**: `004-dominio-presentismo` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-dominio-presentismo/spec.md`

## Summary

Un dominio de presentismo que, a partir de las fichadas ya decodificadas y
deduplicadas (features 001/002) y del padrón de empleados activos (feature 003),
calcula las horas trabajadas de cada empleado por período de liquidación (mensual o
quincenal), contra las horas esperadas de un calendario mensual institucional.

El núcleo es una **capa de dominio pura** (funciones deterministas, sin E/S): calendario
del mes con clasificación de días (`Laborable`/`No Laborable`/`Feriado`), recorte del
período de liquidación según la modalidad de la categoría del empleado, cálculo de la
jornada (primera fichada de la ventana de apertura, última de la de cierre, tolerancia
a hora oficial, sin horas extra), descuento de pausas intermedias cargadas a mano, y
resumen del período. Alrededor del núcleo, **puertos y adaptadores** (mismo patrón que
`ActiveEmployeesProvider`): un proveedor de fichadas que puentea el store en memoria
existente, un proveedor de categoría del empleado que **extiende la capa de repositorio
Oracle de solo lectura** (Principio II) leyendo una columna de categoría del padrón, un
repositorio de persistencia para el estado propio de este sistema (calendarios,
reclasificaciones, correcciones manuales, pausas) con un adaptador inicial en archivo
JSON, y un logger NDJSON estructurado (Principio V). La configuración de categorías
(modalidad + parámetros de jornada por modalidad) vive en este sistema como archivo de
configuración validado al arranque, análogo a `config/active-employees.json`.

El cálculo automático es determinista (FR-023); las correcciones manuales y las pausas
son las únicas fuentes de variación admitidas, ambas auditables y protegidas frente a
recálculos. La feature es **dominio puro**: no incluye interfaz de usuario (se
especifica por separado), pero expone contratos estables (puertos + un comando CLI de
cálculo) sobre los que una UI futura se apoyará.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM `type: module`) — mismo stack que
las features 001/002/003, mismo repositorio.

**Primary Dependencies**: Ninguna nueva de runtime. Se reutiliza `oracledb` (^6.x, modo
thin) ya presente para leer la categoría del empleado del padrón, a través de la capa de
repositorio existente (`src/db/`). Todo el dominio de cálculo usa exclusivamente
librería estándar (`node:test`, `node:fs`, `node:util`); sin librerías de fecha/hora de
terceros (research.md §2).

**Storage**: Nuevo estado durable **propio de este sistema** (calendarios del mes y sus
reclasificaciones, correcciones manuales, pausas intermedias) detrás de un puerto
`PresentismoRepository`; adaptador inicial en archivo JSON versionable por instalación
(research.md §3), reemplazable por un adaptador de base sin tocar el dominio. La
categoría del empleado se **lee** del padrón Oracle de RRHH (solo lectura, mínimo
privilegio — Principio II). Las fichadas se consumen del store en memoria existente
(feature 002), no se persisten aquí.

**Testing**: `node:test` + `node:assert` (igual que 001/002/003). Test-first en las dos
capas críticas (Principio IV): (1) el **motor de cálculo** puro, con fixtures de
calibración derivados uno a uno de los Acceptance Scenarios del spec (jornada completa,
parcial por entrada/salida, incompleta, feriado, pausa, quincena, categoría no
configurada); (2) el **repositorio Oracle** de categoría, con una fábrica de conexiones
inyectable (fake), sin base real en la suite. Smoke test manual contra Oracle real
documentado en quickstart.md, condicionado a variables de entorno.

**Target Platform**: Mismo runtime Node.js 20+ del proyecto (Windows/Linux). Ejecutable
como módulo de librería del dominio y vía un comando CLI de cálculo de período.

**Project Type**: Single project (dominio backend + CLI) — sin frontend en esta feature.

**Performance Goals**: Cálculo del período de un empleado (mes con hasta 200 fichadas) en
< 2 s (SC-003); período completo de la plantilla (hasta 500 empleados, un mes) en < 30 s
(SC-004). Ambos holgados para aritmética en memoria; el costo real es la lectura de
fichadas/categoría, no el cálculo.

**Constraints**: Cálculo automático 100% determinista (FR-023, SC-005): sin dependencia
de la hora de ejecución, sin horas negativas ni por encima de la jornada esperada
(SC-008). Tiempos representados como minutos-del-día (enteros) para aritmética exacta al
minuto (research.md §2). Sin datos biométricos ni credenciales en logs (Principio V).

**Scale/Scope**: ~500 empleados, dos modalidades de liquidación, hasta ~31 días por mes;
volúmenes chicos, el eje es corrección y trazabilidad, no throughput.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.1.0**.

- **I — Arquitectura Frontend basada en Componentes**: esta feature es dominio puro sin
  UI (spec, Assumptions "Dominio puro"). No introduce componentes de UI; **respeta** la
  regla de que ninguna capa de presentación hable con Oracle directo, porque el acceso a
  categoría pasa por la capa de repositorio y un puerto. Sin violación (N/A a UI).
- **II — Repositorio de Datos Oracle Aislado**: la lectura de categoría se implementa
  **dentro** de la capa de repositorio Oracle existente (`src/db/`), sin SQL fuera de
  ella, solo lectura, mínimo privilegio, credenciales por entorno (reutiliza el patrón
  de la feature 003). El estado propio del sistema (calendarios/correcciones/pausas) NO
  va a Oracle: vive tras `PresentismoRepository`. **Cumple**.
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: la feature **no toca** el
  protocolo; consume fichadas ya decodificadas del store existente. Ningún detalle de
  framing/comandos entra a este dominio. **Cumple** por no intervención.
- **IV — Test-First en Capas Críticas**: el motor de cálculo impacta liquidación de
  haberes → se trata como capa crítica con ciclo test-first y fixtures de calibración
  derivados de los Acceptance Scenarios; el repositorio Oracle de categoría, test-first
  con fake de conexión. Flujo de cálculo con cobertura end-to-end (quickstart).
  **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: toda generación de calendario,
  reclasificación, cálculo, corrección y pausa se loguea en NDJSON estructurado,
  correlacionable por período/legajo/día (FR-025), sin datos biométricos ni credenciales.
  **Cumple**.
- **Flujo de Git**: desarrollo en la rama `004-dominio-presentismo` (creada desde `main`
  para esta feature). **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios. El diseño mantiene el acceso a
Oracle confinado a `src/db/` y de solo lectura (II), no toca el protocolo RS956 (III),
concentra las capas críticas (motor de cálculo + repositorio de categoría) bajo
test-first con fixtures trazables al spec (IV), y loguea en NDJSON sin datos sensibles
(V). La persistencia del estado propio en archivo JSON tras un puerto no introduce
dependencias nuevas ni complejidad que requiera justificación.

## Project Structure

### Documentation (this feature)

```text
specs/004-dominio-presentismo/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/           # Fase 1 (/speckit-plan)
│   ├── ports.md                    # Puertos del dominio (proveedores + repositorio)
│   ├── categorias-config.schema.md # Config de categorías/modalidades
│   └── cli-presentismo.md          # Contrato del comando CLI de cálculo
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   ├── tiempo.js               # minutos-del-día, parseo/format HH:MM, aritmética
│   │   ├── calendario-mes.js       # generación del mes, esquema semanal, clasificación
│   │   ├── periodo-liquidacion.js  # recorte mensual/quincenal (tramos 1–15, 16–fin)
│   │   ├── jornada.js              # entrada/salida, tolerancia, horas trabajadas, estado
│   │   ├── pausa.js                # solape de pausa con horario efectivo, descuento
│   │   ├── correccion.js           # aplicación/reversión de corrección manual
│   │   └── resumen-presentismo.js  # agregación del período + desglose auto/manual/pausa
│   ├── config/
│   │   └── categorias-config.js    # carga + validación fail-fast de categorías/modalidades
│   ├── ports/
│   │   └── index.js                # contratos: FichadasProvider, EmployeeCategoryProvider,
│   │                               # PresentismoRepository
│   ├── adapters/
│   │   ├── memory-store-fichadas-provider.js   # puente al store en memoria (feature 002)
│   │   ├── oracle-employee-category-provider.js# categoría desde padrón (usa src/db/)
│   │   ├── file-presentismo-repository.js      # persistencia JSON del estado propio
│   │   └── in-memory-presentismo-repository.js # repo en memoria para tests
│   ├── logging/
│   │   └── presentismo-logger.js   # NDJSON estructurado (Principio V)
│   └── service/
│       └── calcular-presentismo-service.js     # orquesta puertos + dominio
├── db/                              # (existente) capa de repositorio Oracle — se AMPLÍA
│   └── oracle-roster-repository.js  # + lectura de columna categoría (solo lectura)
└── cli/
    └── calcular-presentismo.js      # comando CLI (contracts/cli-presentismo.md)

tests/
├── unit/
│   ├── presentismo-tiempo.test.js
│   ├── presentismo-calendario-mes.test.js
│   ├── presentismo-periodo-liquidacion.test.js
│   ├── presentismo-jornada.test.js          # fixtures de calibración (Acceptance)
│   ├── presentismo-pausa.test.js
│   ├── presentismo-correccion.test.js
│   ├── presentismo-resumen.test.js
│   ├── presentismo-categorias-config.test.js
│   └── oracle-employee-category-provider.test.js  # fake de conexión Oracle
├── contract/
│   └── presentismo-ports.contract.test.js   # todo adaptador cumple su puerto
└── integration/
    └── calcular-presentismo.integration.test.js   # extremo a extremo por período

config/
└── categorias.example.json          # ejemplo de categorías/modalidades (placeholder)
```

**Structure Decision**: Single project. Se agrega el subárbol `src/presentismo/`
organizado como **dominio puro + puertos/adaptadores**, replicando el patrón ya usado en
`src/roster/` (interfaz `ActiveEmployeesProvider` con múltiples adaptadores). El acceso a
Oracle se mantiene concentrado en `src/db/` (Principio II): la lectura de categoría se
suma ahí, no en el dominio. Los tests siguen la convención existente (`tests/unit`,
`tests/contract`, `tests/integration`, runner `node:test`).

## Complexity Tracking

> Sin violaciones de la Constitución. Sección vacía intencionalmente.
