# Implementation Plan: IU — Pantalla Principal: Calendario Mensual con Período Activo

**Branch**: `007-ui-calendario-mensual` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-ui-calendario-mensual/spec.md`

## Summary

Primera interfaz de usuario del sistema. Una pantalla de aterrizaje que muestra el
calendario del **último mes generado** (el `YYYYMM` más alto entre los persistidos) como
una grilla mensual, resaltando días hábiles y feriados, señalando el día de hoy (si cae en
el mes) e identificando el período de liquidación activo. Desde la misma pantalla se puede
**reclasificar** un día (`Laborable`/`No Laborable`/`Feriado`) con confirmación explícita;
el cambio se delega al dominio de presentismo existente (feature 004), que lo persiste en
archivo JSON por período.

Enfoque técnico: **frontend React** (Principio I) que nunca accede a datos de bajo nivel;
consume una **API HTTP fina** (backend en Node sin framework) que envuelve el servicio de
presentismo ya existente. La feature no toca Oracle ni el reloj (el calendario es
file-based, Principio VI). Se agrega al repositorio de presentismo una consulta de solo
lectura para **listar los períodos generados** y así resolver "el último generado".

## Technical Context

**Language/Version**: JavaScript ESM. Backend: Node.js ≥ 20.12 (ya exigido en
`package.json`). Frontend: React 18 (componentes funcionales con hooks, Principio I).

**Primary Dependencies**:
- Backend: módulo `node:http` incorporado (sin Express/Fastify — coherente con el ethos
  minimalista del repo, cuya única dependencia runtime es `oracledb`). Reutiliza
  `src/presentismo/*`.
- Frontend: `react`, `react-dom`; `vite` (dev server + build de JSX); `vitest` +
  `@testing-library/react` + `@testing-library/jest-dom` para tests de componentes. Todas
  son devDependencies del workspace del frontend.

**Storage**: archivos JSON existentes `data/presentismo/${periodo}.json`
(`{ calendario, correcciones, pausas }`). La vista es de solo lectura sobre `calendario`;
la reclasificación escribe vía el dominio (escritura atómica ya implementada en
`file-presentismo-repository.js`). **Sin base de datos** en esta feature (Principio VI).

**Testing**: `node --test` (backend: handler de API + nuevo método de repositorio, tests
de contrato/integración). `vitest` + Testing Library (frontend: render de la grilla,
estados vacío/sin-período, flujo de confirmación de reclasificación).

**Target Platform**: navegador de escritorio moderno (Chromium/Firefox/Edge actuales),
servido por un proceso Node local en la red del establecimiento. Operación local, sin
dependencia de Internet.

**Project Type**: web (frontend SPA + backend API fino), sumado al backend/CLI existente.

**Performance Goals**: pantalla inicial visible en < 3 s (SC-001); respuestas de la API por
debajo de ~200 ms (lecturas de archivos JSON locales de un mes).

**Constraints**:
- La vista NO expone datos personales (nombres/legajos) ni fichadas (FR-014, Principio V).
- Distinciones visuales no dependen solo del color (FR-004; verificable en escala de
  grises, SC-004).
- Reclasificación siempre con confirmación explícita antes de persistir (FR-016).
- El frontend nunca accede a Oracle, al reloj ni al filesystem del dominio directamente:
  solo a la API (Principio I).

**Scale/Scope**: herramienta operativa de un establecimiento; pocos usuarios concurrentes;
grilla de 28–31 días; una sola pantalla en esta feature (más navegación entre meses, P3).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluación contra `.specify/memory/constitution.md` (v1.2.0):

| Principio | Aplica | Cumplimiento en este plan |
|-----------|--------|---------------------------|
| **I. Frontend React basado en componentes** | Sí (núcleo) | UI en React con componentes funcionales + hooks. Presentación separada de datos: los componentes no llaman a Oracle ni al reloj; consumen la API. El estado compartido (mes activo, calendario cargado, estado de confirmación) se maneja con hooks/estado local o un context liviano, sin prop drilling extenso. **PASS**. |
| **II. Repositorio Oracle aislado** | No (esta feature no accede a Oracle) | No se agrega SQL. El calendario es file-based (Principio VI). El único acceso nuevo a datos —listar períodos generados— vive en la capa de repositorio (`src/presentismo/adapters`), no en la UI ni el handler HTTP. **PASS (N/A material)**. |
| **III. Protocolo RS956 aislado** | No | La feature no habla con el dispositivo. Ningún detalle de protocolo se acerca a la UI. **PASS (N/A)**. |
| **IV. Test-First en capas críticas** | Parcial | La feature no toca el parser del protocolo ni el repositorio Oracle (las dos capas críticas). El nuevo método de repositorio (`listarPeriodos`) y el handler de API se cubren con tests (contrato/integración) antes/junto a su implementación. La UI usa testing más flexible (componentes), como habilita el Principio IV. **PASS**. |
| **V. Observabilidad y datos sensibles** | Sí | La reclasificación ya emite un evento estructurado (`dia_reclasificado`) en el servicio; la API lo reutiliza. La vista no expone datos biométricos, credenciales ni datos personales de empleados (FR-014). Ningún dato sensible viaja al frontend. **PASS**. |
| **VI. Persistencia por niveles** | Sí | Solo se lee/actualiza el estado operativo en archivos JSON por período (calendario). No hay escritura en Oracle (no es cierre de período). El cambio de almacenamiento seguiría pasando por el puerto del repositorio. **PASS**. |

**Flujo de Git**: se trabaja en la rama de feature `007-ui-calendario-mensual` creada desde
`main`; no se commitea directo a `main`. **PASS**.

**Resultado del gate (pre-Phase 0)**: ✅ Sin violaciones. `Complexity Tracking` vacío.

La introducción de tooling de frontend (Vite/Vitest) NO es una violación: es la
consecuencia directa del Principio I, que exige React con hooks. Se documenta su
justificación en [research.md](./research.md) (Decisión 1).

## Project Structure

### Documentation (this feature)

```text
specs/007-ui-calendario-mensual/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/           # Fase 1 (/speckit-plan)
│   ├── web-api.md                 # Contrato HTTP del backend fino
│   └── ui-pantalla-calendario.md  # Contrato de la pantalla (estados y comportamiento)
├── checklists/
│   └── requirements.md  # Checklist de calidad de la spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/                      # Dominio existente (feature 004) — se reutiliza
│   ├── domain/calendario-mes.js          # Clasificacion, reclasificarDia (sin cambios)
│   ├── domain/periodo-liquidacion.js     # recortar/Tramo (para derivar período activo)
│   ├── service/calcular-presentismo-service.js  # generarCalendario, reclasificarDia (sin cambios)
│   ├── ports/index.js                    # documentar método listarPeriodos (MODIFICADO: doc)
│   └── adapters/
│       ├── file-presentismo-repository.js    # + listarPeriodos() (MODIFICADO)
│       └── presentismo-repo-ops.js           # (helpers, si aplica)
└── web/                              # NUEVO — backend API fino (capa de servicios/API)
    ├── server.js                         # arranque node:http; sirve estáticos + /api
    ├── api/
    │   ├── router.js                     # ruteo mínimo de /api/*
    │   └── calendario-handlers.js        # GET calendarios, GET :periodo, POST reclasificar
    ├── view-model.js                     # arma la Vista (día + hoy + período activo) desde el dominio
    └── wiring.js                         # factory que cablea repo+servicio (reusa config existente)

frontend/                             # NUEVO — app React (Vite)
├── index.html
├── package.json                          # workspace propio (react, vite, vitest)
├── vite.config.js
└── src/
    ├── main.jsx                          # bootstrap React
    ├── App.jsx                           # pantalla principal (orquesta carga + estado)
    ├── api/calendario-client.js          # fetch a /api (único acceso a datos de la UI)
    ├── components/
    │   ├── GrillaMes.jsx                 # grilla mensual (semanas × días)
    │   ├── CeldaDia.jsx                  # celda: clasificación, hoy, pertenece al período
    │   ├── Leyenda.jsx                   # leyenda de claves visuales (FR-006)
    │   ├── EncabezadoPeriodo.jsx         # etiqueta + rango del período activo
    │   ├── NavegacionMes.jsx             # anterior/siguiente/volver (P3)
    │   ├── EstadoVacio.jsx               # mes sin calendario generado
    │   └── DialogoConfirmarReclasificar.jsx  # confirmación explícita (FR-016)
    └── styles/                           # estilos (distinción no-solo-color, FR-004)

tests/
├── contract/
│   └── web-api-calendario.test.js        # NUEVO — forma de respuestas de la API
├── integration/
│   └── reclasificar-desde-api.test.js    # NUEVO — POST reclasificar persiste + refleja
└── unit/
    └── file-presentismo-repository-listar.test.js  # NUEVO — listarPeriodos()

frontend/src/**/*.test.jsx                # NUEVO — tests de componentes (Vitest + RTL)
```

**Structure Decision**: aplicación **web (frontend + backend)**. Se agrega un backend HTTP
fino en `src/web/` (envuelve el dominio de presentismo existente y expone la API estable que
pide el Principio I) y un frontend React en `frontend/` como workspace independiente con su
propio tooling (Vite/Vitest), para no imponer un bundler al backend/CLI existente. El
dominio de la feature 004 se reutiliza sin cambios de comportamiento; el único agregado en
esa capa es una consulta de solo lectura para listar los períodos generados.

## Complexity Tracking

> No aplica: la Constitution Check no arroja violaciones. La adición de tooling de frontend
> (Vite/Vitest) es requisito del Principio I (React) y se justifica en research.md, no
> constituye una desviación que requiera registro aquí.
