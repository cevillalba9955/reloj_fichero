# Implementation Plan: Control de Vacaciones Anual

**Branch**: `015-control-vacaciones` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-control-vacaciones/spec.md`

## Summary

Vacaciones se trata como un tipo de licencia distinto del resto de las
Justificaciones de Ausencia (feature 012): se asigna por fecha de inicio +
cantidad de días **corridos** (calendario, sin distinguir hábil/no
hábil/feriado, sin cortarse por cambio de período), descuenta de un saldo
anual por legajo que puede quedar negativo, y para el dominio de asistencia
es siempre `No paga`. Cada día asignado se refleja en el calendario y el
resumen de período del legajo reutilizando la misma colección
`justificaciones` que ya usa 012 (una Justificación-espejo con motivo fijo
`vacaciones-anual`, generada automáticamente, no seleccionable desde el
catálogo editable) — así el crédito de jornada y las columnas del resumen de
período (011) no requieren ningún cambio de cálculo, solo de generación del
registro. El saldo, sus movimientos (incrementos anuales y descuentos por
asignación) y las asignaciones en sí viven en un archivo nuevo, fuera de la
carpeta por período, porque son datos de legajo que cruzan períodos
(`data/presentismo/vacaciones.json`). El incremento anual (fecha y escala de
antigüedad→días configurables, `config/vacaciones.json`, escala inicial LCT
Argentina) se aplica de forma perezosa (al leer/escribir el saldo de un
legajo) en vez de con un proceso en segundo plano nuevo. La antigüedad
requiere extender la sincronización del padrón de Oracle (feature 003) para
traer la fecha de ingreso de cada legajo. Se agrega una página nueva
("Vacaciones") a la SPA existente, siguiendo el mismo patrón de
Formulario+Tabla+Página que 012/014.

## Technical Context

**Language/Version**: Node.js ≥20 LTS (JavaScript, ESM), mismo stack que
001–014. Frontend React 18 (Vite) en `frontend/`, componentes antd.

**Primary Dependencies**: Ninguna nueva. Reutiliza `node:fs` (persistencia en
archivo, escritura atómica temp+rename), `node:test`/`node:assert`, el router
HTTP interno (`src/web/api/router.js`) y el cliente `fetch` del frontend ya
existentes (`frontend/src/api/`). Se agrega una generación de `id` para
Asignación de Vacaciones — usa `node:crypto` `randomUUID()`, ya disponible en
Node ≥20 sin dependencia nueva.

**Storage**: Dos piezas nuevas, mismo estilo que 003/012/013:
- `config/vacaciones.json` (+ `.example.json`) — fecha de incremento anual y
  escala de antigüedad→días, validado fail-fast (`vacaciones-config.js`,
  mismo patrón que `motivos-ausencia-config.js`).
- `data/presentismo/vacaciones.json` — saldo, movimientos y asignaciones por
  legajo, **fuera** de la carpeta `P<periodo>/` porque no son datos de un
  único período (research.md §3); adaptador nuevo
  `file-vacaciones-repository.js`, mismo patrón de escritura atómica que
  `file-presentismo-repository.js`.

Además, extiende el padrón existente (`data/presentismo/padron.json` y cada
`P<periodo>/padron.json`) con `fechaIngreso` por legajo, alimentado por una
extensión de la sincronización Oracle de 003 (solo lectura, Principio II;
ninguna escritura nueva a Oracle, Principio VI).

**Testing**: `node:test` + `node:assert`, test-first en el dominio puro
(`vacaciones.js`: expansión de días corridos, cálculo de antigüedad, días por
tramo de escala, cómputo del saldo) con fixtures de calibración uno a uno con
los Acceptance Scenarios del spec; contrato de los endpoints nuevos
(`tests/contract`); integración extremo a extremo asignar → resumen de
período (multi-período) → revertir (`tests/integration`); componentes de UI
con `*.test.jsx` (mismo patrón que `FormularioJustificacion.test.jsx`).

**Target Platform**: Mismo runtime Node.js 20+ (Windows/Linux) y navegador
vía la SPA React existente.

**Project Type**: Web application (backend Node.js + frontend React), misma
estructura que 010–014.

**Performance Goals**: Asignar vacaciones (fecha + cantidad de días, hasta un
rango de varios meses) responde en < 1 s (SC-001, holgado: aritmética en
memoria + lectura/escritura de dos archivos JSON pequeños, sin llamada a
Oracle en el camino de escritura).

**Constraints**: Todo o nada al asignar (ningún período tocado sin
calendario o cerrado antes de registrar nada, FR-005/FR-007); una
Justificación-espejo nunca se revierte por el endpoint genérico de 012
(`JUSTIFICACION_ES_VACACIONES`, research.md §1); el incremento automático
nunca resta días ni resetea un saldo negativo (FR-013); la escala de
antigüedad se valida fail-fast, nunca se aplica un incremento con
configuración inválida.

**Scale/Scope**: Mismo orden que 004/011/012 (~500 empleados activos); una
asignación puede cubrir varios meses de días corridos (a diferencia de 012,
no está acotada a ≤31 días de un solo período).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: la página "Vacaciones"
  se agrega como componentes React funcionales nuevos (`PaginaVacaciones`,
  `FormularioAsignarVacaciones`, `TablaVacaciones`, `HistorialVacaciones`),
  sin que la UI hable con Oracle ni con los archivos directamente: pasa por
  un cliente API nuevo (`frontend/src/api/vacaciones-client.js`), mismo
  patrón que `justificaciones-client.js`. **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: la única extensión de Oracle
  (traer `fechaIngreso`) se hace dentro de la capa de repositorio ya
  aislada de 003 (`src/db/`, `oracle-active-employees-provider.js`); sigue
  siendo de solo lectura, mínimo privilegio, sin SQL fuera de esa capa.
  **Cumple**.
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: no toca el protocolo
  del reloj ni el adaptador; consume el estado de días/fichadas ya calculado
  por 004. **Cumple** por no intervención.
- **IV — Test-First en Capas Críticas**: el saldo de vacaciones y su efecto
  sobre horas/ausencias del período impactan liquidación → capa crítica:
  test-first con fixtures de calibración derivados de los Acceptance
  Scenarios (mismo criterio que 004/012). **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: cada asignación,
  reversión e incremento automático se loguea en NDJSON estructurado (mismo
  logger de 004/012), correlacionable por legajo/asignación; ningún dato
  biométrico ni credencial en esos logs. **Cumple**.
- **VI — Persistencia por Niveles**: saldo/asignaciones y la extensión del
  padrón son estado operativo/de solo-lectura sobre archivo, sin escritura
  nueva a Oracle (la fecha de ingreso se lee, no se escribe); el efecto de
  un día `Vacaciones` (`No paga`, no acredita jornada) llega al registro de
  liquidación al cierre de período por el mismo camino que ya usa 004/012,
  sin abrir un canal de escritura a Oracle nuevo. **Cumple**.
- **Flujo de Git**: desarrollo en la rama `015-control-vacaciones`. **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity
Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — ver research.md y
data-model.md; la reutilización de la colección `justificaciones` de 012
(en vez de un mecanismo de calendario paralelo) mantiene la superficie de
cambio mínima y no introduce ninguna dependencia ni acceso a Oracle nuevo
más allá de la extensión de solo lectura ya prevista.

## Project Structure

### Documentation (this feature)

```text
specs/015-control-vacaciones/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — entidades y su forma persistida
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   ├── vacaciones-config.schema.md      # Config de escala/fecha de incremento
│   ├── web-api.md                        # Endpoints /api/vacaciones/...
│   └── oracle-roster-fecha-ingreso.md    # Extensión del padrón (feature 003)
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── db/                                   # (feature 003) + columna fechaIngreso
│                                          # en la consulta de solo lectura del padrón
├── roster/
│   ├── oracle-active-employees-provider.js  # + normaliza fechaIngreso (null si
│   │                                          # falta; no descarta el legajo)
│   ├── local-file-active-employees-provider.js
│   └── daily-cached-active-employees-provider.js  # + fechaIngreso en el snapshot
│                                                    # cacheado (padron.json)
├── presentismo/
│   ├── domain/
│   │   ├── vacaciones.js            # NUEVO — funciones puras: expandir días
│   │   │                             # corridos de una asignación, calcular
│   │   │                             # antigüedad (años), días por tramo de
│   │   │                             # escala, aplicar movimiento al saldo,
│   │   │                             # construir Asignación/MovimientoSaldo
│   │   └── justificacion.js         # sin cambios: crearJustificacion() se
│   │                                 # reutiliza tal cual con un `motivo`
│   │                                 # sintético { id: 'vacaciones-anual', ... }
│   ├── config/
│   │   └── vacaciones-config.js     # NUEVO — carga + validación fail-fast de
│   │                                  # config/vacaciones.json
│   ├── adapters/
│   │   ├── file-vacaciones-repository.js    # NUEVO — lee/escribe
│   │   │                                     # data/presentismo/vacaciones.json
│   │   │                                     # (atómico, mismo patrón que
│   │   │                                     # file-presentismo-repository.js)
│   │   └── file-presentismo-repository.js   # sin cambios de forma: se sigue
│   │                                          # usando tal cual para las
│   │                                          # Justificaciones-espejo por período
│   ├── ports/
│   │   └── index.js                 # + puerto VacacionesRepository
│   └── service/
│       └── calcular-presentismo-service.js  # + asignarVacaciones,
│                                              # revertirAsignacionVacaciones,
│                                              # listarVacaciones/consultarVacaciones
│                                              # (aplican el incremento perezoso antes
│                                              # de responder, research.md §4)
├── web/
│   ├── view-model.js                 # + construirVistaVacaciones /
│   │                                   # construirHistorialVacaciones
│   └── api/
│       ├── vacaciones-handlers.js    # NUEVO — GET/POST/DELETE /api/vacaciones/...,
│       │                              # registrado en src/web/server.js
│       └── justificaciones-handlers.js  # + rechaza DELETE sobre un registro
│                                          # motivoId === 'vacaciones-anual'
│                                          # (409 JUSTIFICACION_ES_VACACIONES)

frontend/
└── src/
    ├── api/
    │   └── vacaciones-client.js         # NUEVO — mismo patrón que
    │                                     # justificaciones-client.js
    └── components/
        ├── PaginaVacaciones.jsx         # NUEVO — página de control anual
        ├── TablaVacaciones.jsx          # NUEVO — legajo, antigüedad, saldo,
        │                                 # próximo incremento (US2)
        ├── FormularioAsignarVacaciones.jsx  # NUEVO — fecha inicio + cantidad de
        │                                      # días (US1), mismo patrón que
        │                                      # FormularioJustificacion.jsx
        ├── HistorialVacaciones.jsx      # NUEVO — movimientos de un legajo (US2)
        └── AppShell.jsx                  # + entrada "Vacaciones" en SECCIONES/TITULOS

config/
├── vacaciones.json                    # Config activa (incrementoAnual + escala LCT)
└── vacaciones.example.json            # Ejemplo/plantilla versionada

tests/
├── unit/
│   ├── presentismo-vacaciones.test.js           # NUEVO — fixtures de calibración
│   │                                              # por Acceptance Scenario
│   ├── presentismo-vacaciones-config.test.js    # NUEVO — validación fail-fast
│   └── roster-fecha-ingreso.test.js             # NUEVO — normalización de
│                                                  # fechaIngreso nula/inválida
├── contract/
│   └── web-api-vacaciones.test.js       # NUEVO — contrato de los endpoints
└── integration/
    └── vacaciones.integration.test.js   # NUEVO — asignar (multi-período) →
                                            # resumen de período → revertir →
                                            # incremento anual perezoso

frontend/src/components/*.test.jsx     # + tests de los componentes nuevos/tocados
```

**Structure Decision**: Web application existente (backend Node.js +
frontend React). Se agregan dos módulos de dominio/config y un adaptador de
persistencia nuevos (`vacaciones.js`, `vacaciones-config.js`,
`file-vacaciones-repository.js`), se extiende la sincronización de padrón de
003 con un campo de solo lectura, y se reutiliza sin cambios de forma la
colección `justificaciones` por período de 012 para el día a día — misma
convención de capas (dominio puro / adaptadores / servicio / API / UI) que
010–014.

## Complexity Tracking

*Sin violaciones de la constitución; tabla vacía.*
