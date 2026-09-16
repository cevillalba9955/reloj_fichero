# Implementation Plan: Ocultar Fichadas de Vacaciones en Informes Generados

**Branch**: `023-ocultar-fichadas-vacaciones` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/023-ocultar-fichadas-vacaciones/spec.md`

## Summary

Caso excepcional: un legajo con una **Asignación de Vacaciones vigente**
(feature 015) tiene, además, una **fichada real** registrada un día cubierto
por esa asignación. Hoy ese día ya se calcula correctamente (no acredita
horas, no cuenta como ausencia, sigue en la columna `vacaciones`) y las
pantallas interactivas "Fichadas de Hoy" (010) y "Resumen del Período" (011)
muestran, con razón, la fichada y una señal de revisión para un responsable
(feature 015 FR-017). El problema es que esa misma hora fichada y esa señal
**también se filtran hacia los documentos de informe generados** (cierre de
período 018, mensual 021, anticipado de Q1 022), donde no aportan valor y
generan dudas evitables en liquidación.

Enfoque técnico: un único cambio de **presentación** en el dominio del
informe. `src/presentismo/domain/informe-cierre.js` (`renglonDe()`, dentro de
`construirInformeCierre`) es el único punto donde el pipeline se bifurca entre
"pantalla interactiva" y "documento de informe" — los tres informes
(018/021/022) comparten una sola función de servicio
(`emitirInformeCierre`) y una sola función de dominio
(`construirInformeCierre`). Cuando el renglón de un día trae
`justificacion.motivoId === MotivoVacaciones.id` (el criterio ya usado por
`resumen-periodo.js` para identificar un día de vacaciones, feature 015), se
fuerzan `entrada`, `salida`, `pausas` y `requiereJustificacionRevision` a su
valor vacío — el mismo que ya tiene hoy un día de vacaciones sin ninguna
fichada. Nada más cambia: ni el cálculo de horas/contadores (ya correcto,
feature 015), ni `resumen-periodo.js` (pantallas 010/011, sin tocar), ni el
frontend (los componentes de informe ya renderizan estos campos de forma
genérica). No hay endpoints, esquemas de persistencia ni escritura a Oracle
involucrados.

## Technical Context

**Language/Version**: JavaScript (Node.js ≥ 20.12, ESM) en el backend; sin
cambios de frontend (React 18 + Ant Design 6, sin trabajo en esta feature).

**Primary Dependencies**: ninguna nueva. Un solo módulo de dominio existente
(`src/presentismo/domain/informe-cierre.js`) importa la constante
`MotivoVacaciones` ya existente (`src/presentismo/domain/vacaciones.js`).

**Storage**: sin cambios de esquema. El archivo por período
(`data/P<YYYYMM>/informe-cierre.json`) conserva exactamente la misma forma;
sólo cambian, en emisiones nuevas, los valores de cuatro campos del renglón
del día para el caso excepcional (data-model.md).

**Testing**: `node --test` — se extiende
`tests/unit/presentismo-informe-cierre.test.js` con los casos nuevos (día de
vacaciones con fichadas completas, con sólo entrada, sin fichadas como
referencia de paridad, y un día no-vacaciones con revisión pendiente como
control negativo); se agrega un escenario end-to-end en
`tests/integration/informe-cierre.integration.test.js`; se corre
`tests/unit/presentismo-resumen-periodo.test.js` sin cambios como regresión
de que las pantallas interactivas no se tocan.

**Target Platform**: servicio web interno (Linux/Windows) ya existente; sin
cambios de plataforma.

**Project Type**: web application (frontend React + backend Node en
`src/web`), reutilizando en su totalidad la infraestructura de las features
018/021/022. Esta feature no agrega páginas, rutas ni componentes.

**Performance Goals**: sin impacto medible — el cambio agrega una
comparación de string (`motivoId`) dentro de un `map()` ya lineal sobre los
días del período que ya existe hoy.

**Constraints**: no alterar el cómputo de horas, contadores del resumen ni la
clasificación del día (FR-003); no alterar el comportamiento de "Fichadas de
Hoy" ni "Resumen del Período" (FR-004); no descartar ni borrar fichadas, sólo
ocultarlas en el documento (FR-005); aplicar el ocultamiento sólo mientras la
asignación de vacaciones esté vigente para ese día al momento de emitir el
informe (FR-007).

**Scale/Scope**: cambio acotado a 1 archivo de dominio de backend + sus
tests; sin cambios de frontend ni de contratos de API (mismo shape, ver
`contracts/web-api.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Arquitectura Frontend basada en Componentes (React)** — PASS / N/A. No
  se toca ningún componente. `InformeCierreContenido.jsx` /
  `InformeCierrePrintable.jsx` ya renderizan `entrada`/`salida`/`pausas`/
  `requiereJustificacionRevision` de forma genérica (sin lógica de Vacaciones
  propia); con los valores ya vacíos desde el dominio, la presentación es
  correcta sin ningún cambio de UI (research.md §5).
- **II. Repositorio de Datos Oracle Aislado** — N/A. No se agrega ni modifica
  SQL; no hay acceso a Oracle en esta feature.
- **III. Protocolo del Reloj Biométrico** — N/A. No se toca el adaptador
  RS956 ni sus fixtures; las fichadas reales no se alteran, sólo se ocultan en
  un documento derivado.
- **IV. Test-First en Capas Críticas (Protocolo y Datos)** — PASS / N/A en
  sentido estricto (no es el parser/driver RS956 ni el repositorio Oracle,
  únicos alcances obligatorios del principio). Aun así, se sigue el mismo
  hábito Red-Green del repo: los casos nuevos de
  `tests/unit/presentismo-informe-cierre.test.js` se escriben primero
  (fallando contra `renglonDe()` actual) antes de tocar el dominio.
- **V. Observabilidad y Protección de Datos Sensibles** — PASS. No se agregan
  ni quitan eventos de log (`emitirInformeCierre` sigue logueando lo mismo);
  el cambio reduce, si acaso, la superficie de datos que queda impresa en un
  documento archivado, sin exponer nada nuevo.
- **VI. Persistencia por Niveles** — PASS. Sin cambios de escritura: sigue
  siendo únicamente el archivo JSON del período (estado operativo); no hay
  escritura a Oracle en esta feature ni en las que reutiliza (018/021/022 ya
  no escriben a Oracle, sólo al cierre y sólo datos de liquidación, ninguno de
  los cuales son los campos que esta feature toca).

**Resultado**: sin violaciones. `Complexity Tracking` vacío.

## Project Structure

### Documentation (this feature)

```text
specs/023-ocultar-fichadas-vacaciones/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md         # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/
│   └── web-api.md       # Fase 1 (/speckit-plan) — delta sobre el contrato de 018, sin endpoints nuevos
├── checklists/
│   └── requirements.md  # /speckit-specify
└── tasks.md              # Fase 2 (/speckit-tasks - NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/presentismo/domain/
└── informe-cierre.js   # MOD: renglonDe() — cuando
                          #      d.justificacion?.motivoId === MotivoVacaciones.id,
                          #      forzar entrada/salida/pausas/requiereJustificacionRevision
                          #      a su valor vacío. Nuevo import de MotivoVacaciones
                          #      desde ./vacaciones.js (mismo criterio que
                          #      resumen-periodo.js). Sin cambios en filaResumenDe,
                          #      seccionDetalleDe (salvo por delegar en renglonDe) ni
                          #      construirPendientes.

tests/unit/
└── presentismo-informe-cierre.test.js   # MOD: casos nuevos — vacaciones con fichadas
                                          #      completas (oculto), con sólo entrada
                                          #      (oculto), sin fichadas (referencia de
                                          #      paridad), no-vacaciones con revisión
                                          #      pendiente (control: sigue visible)

tests/integration/
└── informe-cierre.integration.test.js   # MOD (opcional si no hay ya un escenario de
                                          #      vacaciones): emisión real end-to-end
                                          #      con una Asignación de Vacaciones vigente
                                          #      + fichada excepcional ese día

tests/unit/
└── presentismo-resumen-periodo.test.js  # SIN cambios — se corre como regresión de que
                                          #      la pantalla interactiva no se altera
```

No hay cambios en `src/web/api/informe-cierre-handlers.js`,
`src/presentismo/service/calcular-presentismo-service.js`,
`src/presentismo/domain/resumen-periodo.js`, ni en ningún componente de
`frontend/src` (contracts/web-api.md documenta por qué no hace falta).

**Structure Decision**: web application ya existente (backend `src/web` +
`src/presentismo`, frontend `frontend/src`). Esta feature es un cambio
quirúrgico de una sola función de dominio pura, reutilizando en su totalidad
la infraestructura de las features 010/011/015/018/021/022 sin agregar
carpetas, endpoints ni componentes nuevos.

## Complexity Tracking

> Sin violaciones de la Constitución. Tabla no aplicable.
