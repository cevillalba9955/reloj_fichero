# Implementation Plan: Informe de la Primera Quincena antes del Cierre del Mes

**Branch**: `022-informe-primera-quincena-anticipado` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-informe-primera-quincena-anticipado/spec.md`

## Summary

En una instalación **QUINCENAL**, permitir **emitir manualmente** el juego de
informes de la **primera quincena** (`tramo = 'Q1'`, días 1–15) sobre un mes
**todavía abierto**, desde la página "Resumen del Período". Hoy la emisión
(documento sellado) sólo se habilita con el período cerrado
(`exigirCalendarioCerrado`, 409 `PERIODO_ABIERTO`).

Enfoque técnico: reutilizar íntegramente el informe de cierre de la feature 018
(dominio `construirInformeCierre` / `rangoDeTramo`, servicio
`emitirInformeCierre` / `obtenerInformeCierre`, componentes
`AccionInformeCierre` / `InformeCierreContenido` / `InformeCierrePrintable`).
El único cambio de fondo es una **excepción acotada** al gate de "período
cerrado" en el handler `POST /api/calendarios/:periodo/informe-cierre`: se
acepta `?tramo=Q1` sobre un período **abierto** si y sólo si (a) modo
`QUINCENAL`, (b) el calendario existe, (c) la primera quincena ya terminó
(`hoy` posterior al día 15 del mes) y (d) el período no está cerrado. La
entrada guardada y su `sello` llevan una marca `anticipado: true`; al cerrar
el mes, la emisión automática de cierre (feature 018/021) reescribe el tramo
`Q1` con `anticipado` en `false` y lo devuelve al flujo normal. No hay
escritura a Oracle (Principio VI): la salida es un documento legible construido
sobre el estado local del período.

## Technical Context

**Language/Version**: JavaScript (Node.js ≥ 20.12, ESM) en el backend;
React 18 + Ant Design 6 (Vite) en el frontend.

**Primary Dependencies**: backend sin framework web (router propio en
`src/web/api/router.js`); frontend `antd`, `react`, `dayjs`. Sin dependencias
nuevas.

**Storage**: archivos JSON por período (`data/P<YYYYMM>/informe-cierre.json`),
detrás del puerto de repositorio (`file-presentismo-repository.js`). El mapa de
ese archivo ya es `{ [tramo]: entrada }`; la clave `'Q1'` se escribe también
sobre un período abierto (misma forma de entrada, más el flag `anticipado`).
Sin cambios de esquema ni Oracle.

**Testing**: `node --test` para contrato/integración de backend
(`tests/contract/web-api-informe-cierre.test.js`, `tests/integration/`);
`vitest` + Testing Library para componentes de frontend
(`frontend/src/components/*.test.jsx`).

**Target Platform**: servicio web interno (Linux/Windows), navegador de
escritorio para la UI.

**Project Type**: web application (frontend React + backend Node en `src/web`).

**Performance Goals**: emitir y ver/descargar el informe anticipado de Q1 en
< 1 min desde "Resumen del Período" (SC-001); el informe se sirve desde la
copia guardada (no recalcula al leer), igual que la feature 018.

**Constraints**: no recalcular presentismo fuera del dominio existente (las
cifras deben coincidir con "Resumen del Período" para Q1, SC-002); la emisión
anticipada es siempre **manual** (FR-018: sin generación automática al terminar
Q1) y **no bloquea** correcciones/pausas/justificaciones sobre los días 1–15
mientras el mes siga abierto (FR-011); lectura del documento abierta,
emisión/re-emisión sólo rol `editor`+ (feature 016); logging estructurado sin
datos biométricos ni credenciales, con la condición `anticipado` registrada
(Principio V, FR-015).

**Scale/Scope**: decenas de empleados por período; 1 archivo de informe por
mes (clave `Q1` compartida con el flujo de cierre). Cambios acotados a 3
archivos de backend y ~3 de frontend, más tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Arquitectura Frontend basada en Componentes (React)** — PASS. La UI
  nueva es un modo adicional de `AccionInformeCierre` (componente funcional con
  hooks); el acceso a datos sigue pasando por `informe-cierre-client.js` →
  `/api` (ningún componente habla con Oracle ni el reloj). Se reutilizan
  `InformeCierreContenido` / `InformeCierrePrintable` (presentación pura), a las
  que sólo se agrega el renglón visible "emisión anticipada".
- **II. Repositorio de Datos Oracle Aislado** — PASS / N/A. No se agrega SQL. El
  único acceso a datos es el repositorio de archivos por período ya existente.
- **III. Protocolo del Reloj Biométrico** — N/A. No se toca el adaptador RS956
  ni sus fixtures.
- **IV. Test-First en Capas Críticas** — PASS. No se modifica el parser/driver
  ni el repositorio Oracle. Aun así, se agregan **primero** los contract tests
  de la emisión anticipada (ventana de habilitación, `409 QUINCENA_EN_CURSO`,
  `409 PERIODO_ABIERTO` para tramos no-Q1, marca `anticipado`, cuadre Q1 vs.
  "Resumen del Período", y el reemplazo al cerrar) antes de tocar los handlers.
- **V. Observabilidad y Protección de Datos Sensibles** — PASS. La emisión
  anticipada reutiliza `logger.evento('informe_cierre_emitido', …)` agregando
  `anticipado: true` al payload (período, tramo, autor, emisión, empleados,
  totalHoras); sin datos biométricos ni credenciales. Las respuestas de la API
  no exponen fichadas crudas.
- **VI. Persistencia por Niveles** — PASS. El informe anticipado de Q1 se
  escribe **sólo** en el archivo JSON del período (estado operativo), sobre un
  período aún abierto. NO se escribe en el esquema Oracle de liquidación: esa
  escritura sigue ocurriendo únicamente al cierre y sólo con los datos de
  liquidación. Esta feature sólo presenta el estado ya persistido como
  documento (misma frontera que las features 018/021).

**Resultado**: sin violaciones. `Complexity Tracking` vacío.

## Project Structure

### Documentation (this feature)

```text
specs/022-informe-primera-quincena-anticipado/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/
│   └── web-api.md       # Fase 1 (/speckit-plan)
├── checklists/
│   └── requirements.md  # /speckit-specify
└── tasks.md             # Fase 2 (/speckit-tasks - NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/web/api/
├── informe-cierre-handlers.js   # MOD: aceptar POST ?tramo=Q1 sobre período ABIERTO
│                                #      dentro de la ventana anticipada (modo QUINCENAL,
│                                #      calendario generado, Q1 terminada, no cerrado);
│                                #      pasar `anticipado` a emitirInformeCierre.
├── resumen-periodo-handlers.js  # MOD: exponer `emisionAnticipadaQ1Disponible` en la
│                                #      VistaResumenPeriodo (modo+tramo+cerrado+Q1 terminada).
└── periodo-id.js                # sin cambios (`:periodo` YYYYMM ya se parsea)

src/presentismo/
├── domain/periodo-liquidacion.js   # MOD: helper puro `primeraQuincenaTerminada(periodoMes, hoy)`
├── domain/informe-cierre.js        # MOD: `sello.anticipado` en construirInformeCierre
│                                   #      (default false; sin cambios de cálculo)
└── service/calcular-presentismo-service.js  # MOD: emitirInformeCierre acepta `anticipado`
                                             #      (default false), lo persiste en la entrada
                                             #      y lo agrega al evento de log

src/web/
└── view-model.js                # MOD: construirVistaResumenPeriodo propaga
                                 #      `emisionAnticipadaQ1Disponible`; el sello de
                                 #      VistaInformeCierre ya se pasa tal cual (incluye `anticipado`)

frontend/src/
├── components/AccionInformeCierre.jsx      # MOD: modo "anticipado Q1" cuando NO cerrado y
│                                           #      `anticipadoQ1Disponible`: botón "Emitir informe
│                                           #      de la primera quincena" + Ver/Descargar/Re-emitir
│                                           #      + Alert persistente "emisión anticipada".
├── components/PaginaResumenPeriodo.jsx     # MOD: pasar `anticipadoQ1Disponible` a AccionInformeCierre
├── components/InformeCierreContenido.jsx   # MOD: renglón visible "EMISIÓN ANTICIPADA — mes no
│                                           #      cerrado" cuando `vista.sello.anticipado`
└── components/InformeCierrePrintable.jsx   # MOD: sufijo "· emisión anticipada" en la etiqueta
                                            #      del modal cuando `vista.sello.anticipado`
frontend/src/api/informe-cierre-client.js   # sin cambios (`202609-Q1` ya se traduce a ?tramo=Q1)

tests/
├── contract/web-api-informe-cierre.test.js  # MOD: casos de emisión anticipada de Q1 (ver contracts)
└── integration/…                            # opcional: flujo emitir anticipado → cerrar → reemplazo

frontend/src/components/
├── AccionInformeCierre.test.jsx     # MOD: modo anticipado Q1 (botón emitir; alert; sin cerrado)
└── PaginaResumenPeriodo.test.jsx    # MOD: la acción anticipada aparece sólo con la vista habilitada
```

**Structure Decision**: web application. El backend vive en `src/web` (API) +
`src/presentismo` (dominio/servicio/adaptadores); el frontend en `frontend/src`.
La feature reutiliza la infraestructura de las features 018/021 y no introduce
carpetas ni endpoints nuevos.

## Complexity Tracking

> Sin violaciones de la Constitución. Tabla no aplicable.
