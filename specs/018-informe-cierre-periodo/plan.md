# Implementation Plan: Informe al Cierre del Período

**Branch**: `018-informe-cierre-periodo` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-informe-cierre-periodo/spec.md`

## Summary

Al cerrar un período de liquidación (mensual o quincenal, según
`PRESENTISMO_RESUMEN_PERIODO`) el sistema **emite y guarda** dos documentos por
tramo: un **Informe de Resumen de Horas Computadas** (una fila por empleado del
padrón del período con total de horas y contadores) y un **Informe de Detalle de
Asistencia** (por empleado, día por día). Ambos se pueden **re-emitir a demanda**
sobre un período ya cerrado; se conserva sólo la última copia por tramo, y
reabrir el período la marca **obsoleta**.

Enfoque técnico: **no se recalcula nada**. `calcularResumenPeriodo(periodoMes,
legajos, hoy, { tramo })` (features 004/011) ya devuelve, por empleado,
`{ horasTrabajadas, completas, incompletas, ausencias, llegadasTarde,
retirosAnticipados, correcciones, feriado, licencia, vacaciones, detalle[] }` más
`anomalia`. La feature agrega:

1. Una **proyección de dominio pura nueva** (`informe-cierre.js`) que toma esas
   filas + metadatos de emisión y arma las dos estructuras de informe, el total
   general de horas, la cantidad de empleados y la **lista de pendientes**
   (jornadas incompletas por empleado/día, anomalías de categoría, días con
   corrección o justificación). Así la emisión no puede divergir de la pantalla
   "Resumen del Período" (SC-008).
2. **Persistencia operativa** (Principio VI): `data/P<periodo>/informe-cierre.json`,
   detrás del puerto `PresentismoRepository` (`guardarInformeCierre` /
   `cargarInformeCierre`). Un archivo por período, con una entrada por tramo
   (`Mes` / `Q1` / `Q2`); re-emitir reemplaza la entrada del tramo.
3. **Enganche en el ciclo de cierre**: `cerrarPeriodoMes` emite tras guardar el
   calendario; `reabrirPeriodoMes` marca `obsoleto: true` la copia guardada.
4. **Dos endpoints**: `POST /api/calendarios/:periodo/informe-cierre` (emitir /
   re-emitir, rol editor+), `GET /api/calendarios/:periodo/informe-cierre`
   (leer la copia guardada, con flag `obsoleto`).
5. **Entrega imprimible**: el frontend renderiza una vista `@media print` de
   ambos informes; el responsable imprime o guarda como PDF desde el navegador.
   Sin dependencias nuevas, sin Oracle, sin tocar el reloj.

Fuera de alcance: la escritura a un esquema Oracle de datos de liquidación
(Principio VI, nivel corporativo). Esta feature sólo emite documentos legibles a
partir del estado local del período.

## Technical Context

**Language/Version**: Node.js ≥20 (JavaScript, ESM) backend; React 18.3 + Vite
frontend — mismo stack que 007/008/010/011.

**Primary Dependencies**: Ninguna nueva. Backend: dominio/servicio de presentismo
(004/011), `periodo-liquidacion.js` (tramos), router propio de `src/web/api/`,
ACL (`exigirRol`, feature 016). Frontend: React + Vite, patrón cliente HTTP a
`/api` (`resumen-periodo-client.js`), `Dialogo.jsx`.

**Storage**: Un archivo JSON nuevo por período,
`data/P<periodo>/informe-cierre.json`, escrito **sólo** al cerrar el período o al
re-emitir a demanda. Detrás del puerto `PresentismoRepository`. Cero escrituras a
Oracle (Principio VI; el registro corporativo de liquidación es trabajo
separado).

**Testing**: Backend `node:test` — unit test-first para la proyección
`informe-cierre.js` (capa crítica: alimenta la liquidación); contract para los
dos endpoints nuevos; integration del flujo cerrar→emitir→leer, re-emisión y
reapertura→obsoleto. Frontend Vitest + Testing Library para los componentes
nuevos (acción de emisión, vista imprimible).

**Target Platform**: Misma aplicación web local (server `node:http` + build Vite).

**Project Type**: Web (frontend + backend en el mismo repo).

**Performance Goals**: Emisión de ambos informes para hasta ~500 empleados en
< 1 minuto (SC-001). `calcularResumenPeriodo` ya recorre los legajos en serie
para la pantalla de resumen y cabe en ese presupuesto; la proyección
`informe-cierre.js` es O(empleados × días) sobre datos ya en memoria.

**Constraints**: Emitir sólo con `calendario.cerrado === true` (FR-002; si no,
409 `PERIODO_ABIERTO`); cifras idénticas a "Resumen del Período" del mismo
período (SC-008 / FR-006); universo = padrón del período (`P<periodo>/padron.json`),
no el padrón vigente (FR-005); rol editor o configurador para emitir (FR-012);
sin datos biométricos ni `rawHex` en respuestas ni en el archivo (Principio V,
FR-014); una sola copia guardada por tramo (FR-003).

**Scale/Scope**: Un establecimiento, ~500 empleados, períodos `YYYYMM` con
calendario generado, modo mensual o quincenal por instalación. Cambios acotados a:
`src/presentismo/domain/` (proyección nueva), `src/presentismo/service/`
(emisión + enganche en cierre/reapertura), `src/presentismo/adapters/` +
`ports/` (persistencia del informe), `src/web/` (2 handlers + view-model +
wiring; extracción de un helper de parseo de período compartido), `frontend/src/`
(cliente + acción de emisión + vista imprimible), `docs/presentismo.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: la acción "Emitir / ver
  informe de cierre" y la vista imprimible son componentes de presentación sobre
  un cliente de datos nuevo (`informe-cierre-client.js`); ningún componente
  calcula acumulados ni habla con Oracle/reloj. **Cumple**.
- **II — Repositorio Oracle Aislado**: sin lecturas ni escrituras a Oracle. El
  padrón del período sale del snapshot local `P<periodo>/padron.json`.
  **Cumple** (N/A).
- **III — Protocolo RS956 Aislado**: la feature no toca el reloj ni el proceso
  de fichadas. **Cumple** (N/A).
- **IV — Test-First en Capas Críticas**: la emisión alimenta la liquidación de
  sueldos → `informe-cierre.js` (proyección) y `guardarInformeCierre` /
  `cargarInformeCierre` (persistencia) se desarrollan test-first con fixtures
  derivados de los Acceptance Scenarios (cuadre resumen↔detalle, pendientes,
  período abierto rechazado, re-emisión reemplaza la copia, reapertura marca
  obsoleto, recorte por tramo Q1/Q2). Flujo end-to-end cerrar→emitir→leer con
  cobertura de integración. **Cumple**.
- **V — Observabilidad y Datos Sensibles**: cada emisión (automática o manual)
  registra `logger.evento('informe_cierre_emitido', { periodo, tramo, autor,
  modo, empleados, totalHoras })`. Los informes exponen legajo, nombre, horas y
  contadores —igual que la pantalla de resumen ya existente—, nunca biométricos
  ni fichadas crudas. **Cumple**.
- **VI — Persistencia por Niveles**: la copia emitida es **estado operativo** →
  archivo JSON por período detrás del puerto. **Ninguna** escritura a Oracle; el
  registro autoritativo de liquidación queda explícitamente fuera de alcance.
  **Cumple**.
- **Flujo de Git**: desarrollo en `018-informe-cierre-periodo`, creada desde
  `main`. **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking`
vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — la proyección quedó
como dominio puro, la persistencia entra por el puerto existente, los endpoints
reutilizan el patrón de handler + `exigirRol`, y el frontend reutiliza el patrón
cliente + componentes. El único refactor (extraer `periodo-id.js` de
`resumen-periodo-handlers.js`) no cambia contratos existentes.

## Project Structure

### Documentation (this feature)

```text
specs/018-informe-cierre-periodo/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — forma de los informes y del archivo guardado
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   └── web-api.md       # Fase 1 — endpoints /api/calendarios/:periodo/informe-cierre
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya creado)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   └── informe-cierre.js            # NUEVO — proyección pura: arma Informe de
│   │                                     # Resumen + Informe de Detalle + lista de
│   │                                     # pendientes + sello de emisión a partir de
│   │                                     # las filas de calcularResumenPeriodo
│   │                                     # (NO recalcula); define el corte `hoy` en
│   │                                     # el último día del tramo
│   ├── service/
│   │   └── calcular-presentismo-service.js  # + emitirInformeCierre(periodoId,
│   │                                         #   { autor, modo }) y
│   │                                         #   obtenerInformeCierre(periodoId);
│   │                                         # cerrarPeriodoMes: emite tras guardar el
│   │                                         # calendario (todos los tramos del modo);
│   │                                         # reabrirPeriodoMes: marca copia obsoleta;
│   │                                         # agrega `modalidad` (params.tipo) a la fila
│   ├── adapters/
│   │   ├── file-presentismo-repository.js   # + guardarInformeCierre / cargarInformeCierre
│   │   │                                     #   (data/P<periodo>/informe-cierre.json)
│   │   ├── in-memory-presentismo-repository.js  # + mismos métodos (paridad para tests)
│   │   └── file-padron-category-provider.js # + leerSnapshotPadron({ filePath }) para
│   │                                         #   resolver legajo+nombre del período
│   ├── domain/periodo-storage.js            # + ARCHIVO_INFORME_CIERRE = 'informe-cierre.json'
│   └── ports/index.js                       # + 'guardarInformeCierre','cargarInformeCierre'
│                                             #   en METODOS.PresentismoRepository
├── web/
│   ├── api/
│   │   ├── periodo-id.js                # NUEVO — helper compartido: parsePeriodoId /
│   │   │                                 # expandirPeriodos / periodoPorDefecto,
│   │   │                                 # extraídos tal cual de resumen-periodo-handlers
│   │   ├── resumen-periodo-handlers.js  # usa periodo-id.js (refactor, sin cambio de contrato)
│   │   └── informe-cierre-handlers.js   # NUEVO — POST .../informe-cierre (emitir,
│   │                                     # exigirRol 'editor') y GET .../informe-cierre
│   │                                     # (leer copia guardada; 404 si nunca se emitió)
│   ├── view-model.js                    # + construirVistaInformeCierre(...) (HH:MM,
│   │                                     # totales, secciones por empleado, sello)
│   └── wiring.js                        # registra las rutas nuevas en el router
frontend/
└── src/
    ├── api/
    │   └── informe-cierre-client.js     # NUEVO — emitir(periodo) / obtener(periodo)
    └── components/
        ├── PaginaResumenPeriodo.jsx     # + acción "Emitir / ver informe de cierre",
        │                                 # habilitada sólo si el período está cerrado
        ├── AccionInformeCierre.jsx      # NUEVO — botón emitir + aviso "copia
        │                                 # desactualizada, volvé a emitir"
        └── InformeCierrePrintable.jsx   # NUEVO — vista imprimible de ambos informes
                                          # (@media print); botón "Imprimir"

tests/
├── unit/
│   └── presentismo-informe-cierre.test.js       # NUEVO — test-first, fixtures por
│                                                 # Acceptance Scenario (cuadre, pendientes,
│                                                 # recorte por tramo, sello)
├── contract/
│   └── web-api-informe-cierre.test.js           # NUEVO — contrato de los 2 endpoints
│                                                 # (200 / 409 PERIODO_ABIERTO / 403 / 404)
└── integration/
    └── informe-cierre.integration.test.js       # NUEVO — cerrar→emite→lee; re-emisión
                                                  # reemplaza; reabrir marca obsoleto;
                                                  # coherencia con /api/resumen-periodo

frontend/src/components/AccionInformeCierre.test.jsx     # NUEVO
frontend/src/components/InformeCierrePrintable.test.jsx  # NUEVO
frontend/src/components/PaginaResumenPeriodo.test.jsx    # + casos de la acción nueva

docs/presentismo.md                               # + sección "Informe al cierre del período"
```

**Structure Decision**: se mantiene la estructura web existente. La feature
agrega una proyección de dominio pura, un método de persistencia por el puerto ya
definido, dos endpoints (uno de escritura con `exigirRol`, uno de lectura) y una
vista imprimible en el frontend. Reutiliza `calcularResumenPeriodo` completo para
que las cifras del informe no puedan divergir de la pantalla "Resumen del
Período". No se crean capas ni módulos de nivel superior.

## Complexity Tracking

> Sin violaciones de la constitución. Tabla no aplicable.
