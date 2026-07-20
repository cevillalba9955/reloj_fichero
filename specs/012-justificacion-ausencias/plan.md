# Implementation Plan: Justificación de Ausencias

**Branch**: `012-justificacion-ausencias` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-justificacion-ausencias/spec.md`

## Summary

Nueva acción "Justificación" sobre el dominio de presentismo (feature 004): permite
registrar, para un legajo y un día `Laborable` (pasado sin fichadas, o futuro aún no
transcurrido), un motivo de ausencia elegido de un catálogo cerrado y extensible
(`config/motivos-ausencia.json`), con su clasificación fija `Paga`/`No paga`. Sigue el
mismo patrón de auditoría y reversibilidad que la Corrección Manual existente (autor,
fecha/hora, motivo, vigente/revertida) y se puede cargar en un único día o en un rango
de fechas (un registro por día `Laborable` elegible dentro del rango). Un día con
Justificación `Paga` acredita la jornada esperada como cumplida en el cálculo de horas
del período (mismo tratamiento que `Feriado`); uno `No paga` no acredita nada y sigue
contando como ausencia, ahora con motivo documentado. En el resumen del período
(feature 011) esto se ve como dos columnas nuevas junto a las 7 ya existentes:
`Feriado` (cuenta días `Feriado`) y `Licencia` (cuenta días con Justificación `Paga`);
las Justificaciones `No paga` no tienen columna propia y siguen sumando dentro de
`Ausencias`, como cualquier `Sin fichadas` sin justificar (spec, Clarifications
2026-07-20). Se expone vía API web (mismo patrón que correcciones/pausas de 010) y una
acción nueva en la UI existente de fichadas/resumen.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM), mismo stack que 001–011. Frontend
React (Vite) en `frontend/`.

**Primary Dependencies**: Ninguna nueva. Reutiliza `node:fs` para persistencia en
archivo, `node:test`/`node:assert` para tests, y el store HTTP interno
(`src/web/api/router.js`) y cliente `fetch` del frontend ya existentes.

**Storage**: Extiende el archivo JSON por período que ya persiste el estado operativo de
004 (`{ calendario, correcciones, pausas }` en `file-presentismo-repository.js`) con una
cuarta colección `justificaciones`, detrás del mismo puerto `PresentismoRepository`
(Principio VI: estado operativo en archivo, sin base de datos). El catálogo de motivos
vive en un archivo de configuración nuevo, `config/motivos-ausencia.json` (+
`config/motivos-ausencia.example.json`), validado fail-fast al arranque igual que
`categorias-config.js`.

**Testing**: `node:test` + `node:assert`, test-first en el dominio puro (motor de
decisión de elegibilidad del día, efecto sobre `resumen-presentismo.js`) con fixtures
de calibración uno a uno con los Acceptance Scenarios del spec; contrato de los
endpoints nuevos (`tests/contract`); integración extremo a extremo carga → resumen del
período (`tests/integration`); componentes de UI con sus `*.test.jsx` (mismo patrón que
`FormularioCorreccion.test.jsx`).

**Target Platform**: Mismo runtime Node.js 20+ (Windows/Linux) y navegador vía la SPA
React existente.

**Project Type**: Web application (backend Node.js + frontend React), misma estructura
que las features 010/011.

**Performance Goals**: Registrar una Justificación (día único o rango de hasta ~31 días)
responde en < 500 ms (SC-001, holgado: aritmética en memoria + escritura de archivo
pequeño).

**Constraints**: Una única Justificación vigente por legajo/día (FR-008); el catálogo de
motivos se valida fail-fast (motivo desconocido nunca se persiste); ninguna reescritura
silenciosa de una Justificación vigente ni de fichadas que lleguen después (FR-010).

**Scale/Scope**: Mismo orden que 004/011 (~500 empleados, ~31 días/mes); una carga por
rango cubre como mucho un período (≤ 31 días).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: la acción "Justificación" se
  agrega como componentes React funcionales nuevos (formulario + integración en las
  tablas existentes de 010/011), sin que la UI hable con Oracle ni con el repositorio de
  archivo directamente: pasa por el cliente API existente (`frontend/src/api/`).
  **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: esta feature no agrega ni modifica
  acceso a Oracle; no toca `src/db/`. **Cumple** (no aplica).
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: no toca el protocolo del reloj ni
  el adaptador; solo consume el estado de días/fichadas ya calculado por 004. **Cumple**
  por no intervención.
- **IV — Test-First en Capas Críticas**: el efecto de la Justificación sobre el cálculo
  de horas/saldo del período (FR-013/FR-014) impacta liquidación → se trata como capa
  crítica: test-first con fixtures de calibración derivados de los Acceptance Scenarios,
  igual que el motor de 004. **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: cada registro/reversión de
  Justificación se loguea en NDJSON estructurado (mismo logger de 004/005),
  correlacionable por período/legajo/día, sin datos biométricos ni credenciales.
  **Cumple**.
- **VI — Persistencia por Niveles**: la Justificación es estado operativo → archivo JSON
  local por período detrás del puerto existente, sin escritura nueva a Oracle. Su efecto
  en el registro de liquidación (Oracle, al cierre) es el mismo canal que ya usa 004
  para horas trabajadas/esperadas; esta feature no abre un nuevo camino de escritura a
  Oracle. **Cumple**.
- **Flujo de Git**: desarrollo en la rama `012-justificacion-ausencias`. **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — ver research.md y
data-model.md; ningún hallazgo de diseño introdujo una dependencia nueva o un acceso a
Oracle.

## Project Structure

### Documentation (this feature)

```text
specs/012-justificacion-ausencias/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md         # Fase 1 — entidades y su forma persistida
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   ├── motivos-ausencia-config.schema.md  # Config del catálogo de motivos
│   └── web-api.md                          # Endpoints /api/.../justificaciones
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   ├── justificacion.js         # NUEVO — crearJustificacion/revertir, elegibilidad
│   │   │                             # del día (Laborable + Sin fichadas o futuro),
│   │   │                             # expansión de rango a días Laborable individuales
│   │   ├── resumen-presentismo.js   # + trata Justificación Paga como crédito de
│   │   │                             # jornada esperada, igual que Feriado
│   │   │                             # (`clas === FERIADO` pasa a incluir el caso
│   │   │                             # "Laborable con Justificación Paga vigente");
│   │   │                             # Justificación No paga no acredita, la jornada
│   │   │                             # sigue en `Sin fichadas` (FR-013/FR-014)
│   │   └── resumen-periodo.js       # + dos contadores nuevos en `proyectarResumenPeriodo`:
│   │                                 # `feriado` (clasificacion === Feriado) y
│   │                                 # `licencia` (Justificación Paga vigente del día);
│   │                                 # `ausencias` NO cambia su criterio (sigue siendo
│   │                                 # `estado === Sin fichadas`, que ahora puede incluir
│   │                                 # días con Justificación No paga); `detalleDeJornada`
│   │                                 # agrega `justificacion: {motivoId, etiquetaMotivo,
│   │                                 # tipoPago} | null` por día (FR-011)
│   ├── config/
│   │   └── motivos-ausencia-config.js  # NUEVO — carga + validación fail-fast del
│   │                                     # catálogo (id, etiqueta, tipoPago, activo)
│   ├── adapters/
│   │   └── file-presentismo-repository.js  # + colección `justificaciones` en el
│   │                                         # mismo archivo por período
│   └── service/
│       └── calcular-presentismo-service.js  # + cargarJustificacion, revertirJustificacion
├── web/
│   ├── view-model.js                 # + `feriado`/`licencia` en construirVistaResumenPeriodo
│   │                                   # (junto a completas/incompletas/ausencias/...) y
│   │                                   # `justificacion` por día en construirDetalleEmpleado
│   └── api/
│       └── justificaciones-handlers.js  # NUEVO — POST/DELETE justificaciones,
│                                          # GET catálogo de motivos; registrado en
│                                          # src/web/server.js

frontend/
└── src/
    ├── api/
    │   └── justificaciones-client.js    # NUEVO — mismo patrón que fichadas-hoy-client
    └── components/
        ├── FormularioJustificacion.jsx  # NUEVO — selector de motivo (catálogo) +
        │                                 # rango de fechas opcional; mismo patrón que
        │                                 # FormularioCorreccion.jsx
        ├── TablaFichadasHoy.jsx         # + botón "Justificación" junto a "Corregir"
        │                                 # cuando el día está `Sin fichadas`/futuro
        ├── TablaResumenPeriodo.jsx      # + columnas `Feriado` y `Licencia` junto a las
        │                                 # 7 columnas existentes (spec FR-012)
        └── DialogoDetalleEmpleado.jsx   # + motivo y clasificación Pago/No pago por día

config/
├── motivos-ausencia.json              # Catálogo activo (9 motivos por defecto)
└── motivos-ausencia.example.json      # Ejemplo/plantilla versionada

tests/
├── unit/
│   ├── presentismo-justificacion.test.js       # NUEVO — fixtures de calibración por
│   │                                             # Acceptance Scenario (test-first)
│   ├── presentismo-motivos-ausencia-config.test.js  # NUEVO — validación fail-fast
│   ├── presentismo-resumen.test.js             # + caso Justificación Paga acredita
│   │                                             # jornada esperada (FR-013/FR-014)
│   └── presentismo-resumen-periodo.test.js     # + columnas `feriado`/`licencia`,
│                                                 # `ausencias` sigue contando No paga
├── contract/
│   └── web-api-justificaciones.test.js  # NUEVO — contrato de los endpoints
└── integration/
    └── justificacion.integration.test.js  # NUEVO — carga (día/rango) → resumen del
                                              # período, reversión, fichadas tardías

frontend/src/components/*.test.jsx     # + tests de los componentes nuevos/tocados
```

**Structure Decision**: Web application existente (backend Node.js + frontend React).
Se agrega un módulo de dominio (`justificacion.js`) y un archivo de configuración
nuevos, se extiende el archivo de estado por período, el cálculo de horas de 004
(`resumen-presentismo.js`) y la proyección por fila de 011 (`resumen-periodo.js`,
`view-model.js`, `TablaResumenPeriodo.jsx`), y se suma un endpoint + componentes de UI,
todo replicando el patrón puerto/adaptador y el patrón API/UI ya usados por corrección y
pausa (010). No se crean capas ni módulos de nivel superior; las dos columnas nuevas del
resumen (`Feriado`, `Licencia`) son contadores adicionales sobre la misma fila que ya
produce 011, no una vista nueva.

## Complexity Tracking

> Sin violaciones de la Constitución. Sección no aplicable.
