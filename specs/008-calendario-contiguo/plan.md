# Implementation Plan: Generación de Calendario desde la IU con Contigüidad Garantizada

**Branch**: `008-calendario-contiguo` | **Date**: 2026-07-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-calendario-contiguo/spec.md`

## Summary

Habilitar la generación de un mes de calendario desde la pantalla principal (feature 007),
garantizando que la secuencia de meses generados sea **contigua**: solo se puede generar el mes
inmediatamente anterior o posterior a la secuencia existente, sin superar el mes calendario
actual, y con un período semilla (mes actual) cuando no hay ninguno.

Enfoque técnico: **la regla de contigüidad es una invariante de negocio y vive en el backend**
(servicio + API), no en la UI. El backend calcula y expone la "frontera generable" en el
listado de calendarios, y el endpoint de generación **rechaza** cualquier período no generable.
El frontend deja de recalcular la regla (como hacía el trabajo previo en `NavegacionMes`) y
pasa a **renderizar los flags que entrega el backend**: muestra el botón "Generar" solo para
períodos generables, deshabilita la navegación hacia meses no generables y explica cuál período
falta. Esto fija la fuente de verdad única (Principio I) y cierra el hueco de que un `POST`
directo cree un salto.

## Technical Context

**Language/Version**: JavaScript (ES Modules). Backend Node.js ≥ 20 (`node:http`, `node:test`).
Frontend React 18 + Vite 5.

**Primary Dependencies**: Frontend: React 18, Vite. Backend: `node:http` (sin framework),
dominio de presentismo (feature 004) vía `src/presentismo/service`. Sin nuevas dependencias.

**Storage**: Archivos JSON locales por período detrás del puerto de repositorio
(`createFilePresentismoRepository`), Principio VI. Sin Oracle, sin reloj.

**Testing**: Backend `node:test` (contract + integration + unit) con repos en `tmpdir`.
Frontend Vitest + Testing Library (patrón existente de la feature 007).

**Target Platform**: Aplicación web local — servidor Node local sirviendo API `/api` + build
estático de Vite; navegador moderno.

**Project Type**: Web (frontend + backend en el mismo repo).

**Performance Goals**: Interacciones de UI percibidas como instantáneas; la generación es una
única escritura de archivo (temp + rename) + relectura de la vista. Sin objetivos de throughput.

**Constraints**: No exponer datos personales, legajos ni fichadas (FR-011). Invariante de
contigüidad no violable desde ninguna superficie de la IU (FR-008). "Mes actual" tomado del
reloj del servidor (no del cliente), consistente con el manejo de `hoy` en la feature 007.

**Scale/Scope**: Un establecimiento; decenas de períodos como máximo. Cambios acotados a:
`src/web/` (API + view-model), un helper puro en el dominio, y 3 componentes del frontend ya
existentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Arquitectura Frontend basada en Componentes / separación UI–negocio**: ✅ **Reforzado**.
  La regla de contigüidad se traslada al backend (servicio/API) como fuente de verdad; la UI
  solo renderiza flags. Se elimina la duplicación de la regla en `NavegacionMes` introducida en
  el trabajo previo. Ningún componente accede a datos fuera de la API `/api`.
- **II. Repositorio Oracle Aislado**: ✅ N/A — esta feature no toca Oracle. Toda persistencia es
  vía el puerto de repositorio de presentismo.
- **III. Protocolo RS956 Aislado**: ✅ N/A — no toca el reloj ni el adaptador.
- **IV. Test-First en Capas Críticas**: ✅ La guarda de contigüidad es lógica de negocio
  correctness-critical. Se escriben **tests de contrato e integración del backend primero**
  (rechazo de no-contiguo/futuro, idempotencia, frontera generable) antes de la implementación;
  el frontend se cubre con tests de componente (Vitest). No se toca protocolo ni Oracle, así que
  no aplica el Red-Green sobre esas capas.
- **V. Observabilidad y Protección de Datos**: ✅ La generación reutiliza el evento estructurado
  `calendario_generado` que ya emite el servicio (feature 004). Ninguna respuesta expone datos
  personales (FR-011).
- **VI. Persistencia por Niveles**: ✅ La generación escribe estado operativo (calendario del
  mes) en JSON local vía `service.generarCalendario` → `repo.guardarCalendario`. No hay
  escritura en Oracle (no es cierre de período).

**Resultado**: Sin violaciones. La feature corrige una desviación latente del Principio I del
trabajo previo (regla de negocio en la UI). Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/008-calendario-contiguo/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — entidades derivadas y forma de las vistas
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   └── web-api.md        # Fase 1 — GET /calendarios (extendido) + POST /:periodo/generar
├── checklists/
│   └── requirements.md   # Checklist de calidad de la spec (ya creado por /speckit-specify)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   └── domain/
│       └── calendario-mes.js      # + helpers puros periodoAnterior/periodoSiguiente (o desplazarPeriodo)
├── web/
│   ├── view-model.js              # + cálculo de la frontera generable (mesActual, generables)
│   └── api/
│       └── calendario-handlers.js # GET /calendarios extendido; POST /:periodo/generar endurecido (guardas + idempotencia)

frontend/
└── src/
    ├── App.jsx                    # consume generables/mesActual y los propaga; usa flags del backend
    ├── api/
    │   └── calendario-client.js   # generarCalendario() ya existe; sin cambios de superficie
    └── components/
        ├── NavegacionMes.jsx      # deshabilita prev/next según flags del backend (quita regla local duplicada)
        └── EstadoVacio.jsx        # muestra botón "Generar" solo si el período es generable; mensaje de no-contiguo

tests/
├── contract/
│   └── web-api-calendario.test.js       # + casos: generables en GET; POST guardas + idempotencia
├── integration/
│   └── generar-calendario-contiguo.test.js  # NUEVO — flujo completo de contigüidad backend
└── unit/
    └── presentismo-calendario-mes.test.js   # + tests de los helpers de período

frontend/src/components/*.test.jsx           # + casos de NavegacionMes/EstadoVacio con flags
```

**Structure Decision**: Estructura web existente (frontend + backend en un repo). La feature
**extiende** la 007 sin mover archivos: agrega un helper puro en el dominio, amplía el
view-model y los handlers en `src/web/`, y ajusta 3 componentes del frontend ya presentes. No se
crean nuevos módulos ni capas.

## Complexity Tracking

> Sin violaciones de la constitución. Tabla no aplicable.
