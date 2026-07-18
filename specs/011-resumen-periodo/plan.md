# Implementation Plan: Página "Resumen del Período"

**Branch**: `011-resumen-periodo` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-resumen-periodo/spec.md`

## Summary

Una página web de solo consulta que muestra, para un período de liquidación
seleccionado, una fila por empleado esperado con sus acumulados: total de horas
trabajadas, jornadas completas, incompletas, ausencias, llegadas tarde, retiros
anticipados y correcciones vigentes. Al seleccionar un empleado se abre un diálogo
modal con el detalle día por día del período.

Enfoque técnico: **el dominio ya calcula casi todo**. `calcularEmpleado(legajo,
periodo)` (feature 004) devuelve por tramo un resumen con
`conteos { laborables, completas, incompletas, sinFichadas }`, `horasTrabajadas` y el
detalle `jornadas[]` (fecha, estado, entrada/salida efectivas, `correccionVigente`,
`pausas` con `tipo`, `totalDiario`). Lo que falta es una **proyección pura nueva**
(`resumen-periodo.js`) que:

1. **Excluya los días futuros** del período en curso (FR-008): los conteos de
   `construirResumen` incluyen los días no vencidos como `Sin fichadas`, así que la
   fila de esta pantalla se deriva de `resumen.jornadas` filtrado por `fecha <= hoy`,
   no de los conteos ya agregados.
2. **Derive los indicadores que 004 no cuenta**: llegadas tarde (misma regla que la
   situación `TARDE` de 010, con la entrada corregida prevaleciendo — Clarifications
   del spec) y retiros anticipados (pausas vigentes `tipo: 'retiro_anticipado'`).
3. **Garantice la coherencia resumen↔detalle (SC-002)**: la fila y el detalle del
   diálogo se derivan del MISMO arreglo `jornadas[]` filtrado, en la misma pasada.

Sobre esa proyección se agregan dos endpoints de solo lectura
(`GET /api/resumen-periodo` y el detalle por legajo) y la página React con selector
de período, tabla y diálogo de detalle reutilizando el `Dialogo` modal de la
iteración 2 de 010. Sin escrituras (FR-010), sin Oracle, sin tocar el reloj.

## Technical Context

**Language/Version**: Node.js ≥20 (JavaScript, ESM) backend; React 18.3 + Vite 5.4
frontend — mismo stack que 007/008/010.

**Primary Dependencies**: Ninguna nueva. Backend: dominio/servicio de presentismo
(004), roster (003), router propio de `src/web/api/`. Frontend: React + Vite, cliente
HTTP a `/api` (patrón `fichadas-hoy-client.js`), `Dialogo.jsx` (010 iteración 2).

**Storage**: Ninguno nuevo y **cero escrituras** (FR-010/SC-005): la página solo lee
los archivos por período existentes vía el servicio de 004. El registro de cierre de
período (Principio VI, nivel Oracle) NO se implementa acá; FR-012 deja el enganche
especificado para cuando exista.

**Testing**: Backend `node:test` — unit test-first para la proyección
`resumen-periodo.js` (capa crítica: alimenta la revisión previa a liquidación),
contract para los endpoints nuevos, integration del flujo resumen→detalle. Frontend
Vitest + Testing Library para los componentes.

**Target Platform**: Misma aplicación web local (server `node:http` + build Vite).

**Project Type**: Web (frontend + backend en el mismo repo).

**Performance Goals**: Resumen de hasta 500 empleados en <10 s (SC-004);
`calcularEmpleado` es O(días del mes) por legajo y ya corre por debajo de 2 s/empleado
(004) — el endpoint calcula los legajos en serie y cabe en el presupuesto; si no,
paralelizar por lotes es una optimización local al handler.

**Constraints**: Solo lectura (ninguna ruta de escritura nueva); corrección vigente
prevalece en TODOS los contadores (FR-003); días futuros y No Laborable/Feriado no
cuentan como ausencia (FR-008); sin datos biométricos en respuestas (FR-011).

**Scale/Scope**: Un establecimiento, ~500 empleados, períodos mensuales `YYYYMM` con
calendario generado. Cambios acotados a: `src/presentismo/domain/` (proyección nueva),
`src/presentismo/service/` (orquestación por período), `src/web/` (handlers + view
model), `frontend/src/` (página + componentes nuevos).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: página nueva como componentes de
  presentación (selector de período, tabla, diálogo de detalle) sobre un cliente de
  datos (`resumen-periodo-client.js`); ningún componente calcula acumulados ni habla
  con Oracle/reloj. **Cumple**.
- **II — Repositorio Oracle Aislado**: sin lecturas ni escrituras nuevas a Oracle; el
  padrón sale del snapshot local ya cableado en el contexto web (010). **Cumple** (N/A).
- **III — Protocolo RS956 Aislado**: esta feature no toca el reloj ni el proceso de
  fichadas en absoluto. **Cumple** (N/A).
- **IV — Test-First en Capas Críticas**: la proyección de acumulados alimenta la
  revisión previa a liquidación → tests unitarios primero con fixtures derivados de los
  Acceptance Scenarios (tarde corregida no cuenta, día futuro no es ausencia,
  incompleta vencida sí cuenta, coherencia fila↔detalle). **Cumple**.
- **V — Observabilidad y Datos Sensibles**: se reutiliza el logging existente de
  `calcularEmpleado` (`periodo_calculado` por legajo); las respuestas exponen solo
  legajo/nombre y agregados — sin biométricos ni fichadas crudas (FR-011). **Cumple**.
- **VI — Persistencia por Niveles**: cero escrituras; la lectura pasa por el puerto ya
  existente. FR-012 documenta el enganche futuro con el registro de cierre sin
  implementarlo. **Cumple**.
- **Flujo de Git**: desarrollo en la rama `011-resumen-periodo` creada desde `main`.
  **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking`
vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — la proyección quedó como
dominio puro, los endpoints son de solo lectura y el frontend reutiliza el patrón de
cliente + componentes + `Dialogo` ya establecido.

## Project Structure

### Documentation (this feature)

```text
specs/011-resumen-periodo/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — proyecciones y forma de la vista
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   └── web-api.md       # Fase 1 — endpoints /api/resumen-periodo*
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya creado)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   └── resumen-periodo.js       # NUEVO — proyección pura: fila de acumulados y
│   │                                 # detalle por día a partir de resumen.jornadas,
│   │                                 # con corte en `hoy` y corrección prevaleciendo
│   │                                 # (llegadas tarde, ausencias, incompletas,
│   │                                 # retiros anticipados, correcciones)
│   └── service/
│       └── calcular-presentismo-service.js  # + calcularResumenPeriodo(periodo,
│                                             # legajos, hoy): calcularEmpleado por
│                                             # legajo + proyección; suma tramos Q1+Q2
│                                             # para quincenales (fila mensual única)
├── web/
│   ├── view-model.js                # + construirVistaResumenPeriodo(...) y
│   │                                 # construirDetalleEmpleado(...) (formato HH:MM)
│   └── api/
│       └── resumen-periodo-handlers.js  # NUEVO — GET /api/resumen-periodo
│                                         # y GET /api/resumen-periodo/{legajo};
│                                         # registrado en src/web/server.js

frontend/
└── src/
    ├── api/
    │   └── resumen-periodo-client.js    # NUEVO — mismo patrón que fichadas-hoy-client
    └── components/
        ├── PaginaResumenPeriodo.jsx     # NUEVO — página/contenedor: selector +
        │                                 # tabla + diálogo; pestaña nueva en App.jsx
        ├── SelectorPeriodo.jsx          # NUEVO — períodos con calendario generado,
        │                                 # default el más reciente (FR-002)
        ├── TablaResumenPeriodo.jsx      # NUEVO — fila por empleado con los 7
        │                                 # indicadores; fila clickeable (US2)
        └── DialogoDetalleEmpleado.jsx   # NUEVO — detalle día por día dentro del
                                          # Dialogo modal reutilizable (010 it. 2)

tests/
├── unit/
│   └── presentismo-resumen-periodo.test.js  # NUEVO — fixtures de calibración por
│                                             # Acceptance Scenario (test-first)
├── contract/
│   └── web-api-resumen-periodo.test.js      # NUEVO — contrato de los endpoints
└── integration/
    └── resumen-periodo.integration.test.js  # NUEVO — flujo resumen → detalle,
                                              # coherencia SC-002, solo lectura SC-005

frontend/src/components/*.test.jsx           # + tests de los componentes nuevos
```

**Structure Decision**: misma estructura web existente. La feature agrega una
proyección de dominio pura, un par de endpoints de solo lectura y una página nueva;
no crea capas ni módulos de nivel superior, y reutiliza `Dialogo` y el patrón de
cliente/página de 010.

## Complexity Tracking

> Sin violaciones de la constitución. Tabla no aplicable.
