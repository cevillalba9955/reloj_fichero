# Implementation Plan: Informe de Asistencia Mensual desde el Calendario

**Branch**: `021-informe-asistencia-mensual` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-informe-asistencia-mensual/spec.md`

## Summary

Desde la página **Calendario**, cuando el mes mostrado tiene su período
cerrado, ofrecer una acción para **ver** y **descargar** el informe de
asistencia del **mes calendario completo**, con la misma presentación y
contenido que los informes de cierre de la feature 018 (resumen de horas
computadas + detalle de asistencia empleado por empleado + pendientes + sello).

Enfoque técnico: el "informe mensual" **es** un informe de cierre con
`tramo = 'Mes'`. El dominio (`construirInformeCierre`, `rangoDeTramo`) y el
servicio (`emitirInformeCierre` / `obtenerInformeCierre`) ya soportan
`tramo = 'Mes'` sin cambios. El trabajo consiste en: (1) permitir el tramo
`Mes` en los handlers de `/informe-cierre` también en instalaciones
`QUINCENAL`; (2) emitir y guardar además el tramo `Mes` al cerrar el período
en modo `QUINCENAL`; (3) exponer la acción en la página Calendario reutilizando
los componentes de presentación de la feature 018. No hay escritura a Oracle
(Principio VI): la salida es un documento legible construido sobre el estado
local del período.

## Technical Context

**Language/Version**: JavaScript (Node.js ≥ 20.12, ESM) en el backend;
React 18 + Ant Design 6 (Vite) en el frontend.

**Primary Dependencies**: backend sin framework web (router propio en
`src/web/api/router.js`); frontend `antd`, `react`, `dayjs`. Sin dependencias
nuevas.

**Storage**: archivos JSON por período (`data/P<YYYYMM>/informe-cierre.json`),
detrás del puerto de repositorio (`file-presentismo-repository.js`). El mapa
de ese archivo ya es `{ [tramo]: entrada }`; se agrega la clave `'Mes'` junto a
`'Q1'`/`'Q2'` en modo QUINCENAL. Sin cambios de esquema ni Oracle.

**Testing**: `node --test` para contrato/integración de backend
(`tests/contract/web-api-informe-cierre.test.js`, `tests/integration/`);
`vitest` + Testing Library para componentes de frontend
(`frontend/src/components/*.test.jsx`).

**Target Platform**: servicio web interno (Linux/Windows), navegador de
escritorio para la UI.

**Project Type**: web application (frontend React + backend Node en `src/web`).

**Performance Goals**: ver y descargar el informe mensual en < 1 min desde la
página Calendario (SC-001); el informe se sirve desde la copia guardada (no
recalcula), igual que la feature 018.

**Constraints**: no recalcular presentismo fuera del dominio existente (las
cifras deben coincidir con "Resumen del Período" y con la suma Q1+Q2, SC-002);
lectura del documento abierta, emisión/re-emisión sólo rol `editor`+
(feature 016); logging estructurado sin datos biométricos ni credenciales
(Principio V).

**Scale/Scope**: decenas de empleados por período; 1 archivo de informe por
mes. Cambios acotados a 2 archivos de backend y ~3 de frontend, más tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Arquitectura Frontend basada en Componentes (React)** — PASS. La UI
  nueva son componentes funcionales; el acceso a datos pasa por
  `informe-cierre-client.js` → `/api` (ningún componente habla con Oracle ni el
  reloj). Se reutilizan `InformeCierreContenido` / `InformeCierrePrintable`
  (presentación pura) y `AccionInformeCierre` (contenedor de acción).
- **II. Repositorio de Datos Oracle Aislado** — PASS / N/A. No se agrega SQL.
  El único acceso a datos es el repositorio de archivos por período ya
  existente.
- **III. Protocolo del Reloj Biométrico** — N/A. No se toca el adaptador
  RS956.
- **IV. Test-First en Capas Críticas** — PASS. No se modifica parser/driver ni
  repositorio Oracle. Aun así, se agregan primero los contract tests del tramo
  `Mes` en modo QUINCENAL (handlers) y el test de cuadre `Mes == Q1 + Q2`
  antes de tocar los handlers.
- **V. Observabilidad y Protección de Datos Sensibles** — PASS. La emisión del
  tramo `Mes` reutiliza `logger.evento('informe_cierre_emitido', …)` (período,
  tramo, autor, emisión, empleados, totalHoras); sin datos biométricos ni
  credenciales. Las respuestas de la API no exponen fichadas crudas.
- **VI. Persistencia por Niveles** — PASS. El informe mensual se escribe sólo
  en el archivo JSON del período (estado operativo). NO se escribe en el
  esquema Oracle de liquidación: esta feature sólo presenta el estado ya
  persistido como documento (misma frontera que la feature 018).

**Resultado**: sin violaciones. `Complexity Tracking` vacío.

## Project Structure

### Documentation (this feature)

```text
specs/021-informe-asistencia-mensual/
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
├── informe-cierre-handlers.js   # MOD: aceptar tramo "Mes" también en modo QUINCENAL (POST y GET)
├── calendario-handlers.js       # MOD: al cerrar en QUINCENAL, emitir además el tramo "Mes"
└── periodo-id.js                # sin cambios (el parseo de :periodo YYYYMM ya sirve)

src/presentismo/
├── domain/informe-cierre.js                  # sin cambios (rangoDeTramo/construirInformeCierre ya soportan "Mes")
├── domain/periodo-liquidacion.js             # sin cambios
└── service/calcular-presentismo-service.js   # sin cambios (emitir/obtener/reabrir ya cubren "Mes")

frontend/src/
├── api/informe-cierre-client.js       # MOD: poder pedir el tramo "Mes" explícito (obtenerMensual/emitirMensual)
├── components/AccionInformeCierre.jsx  # MOD: prop para fijar el tramo "Mes" (reutilizable desde el Calendario)
├── components/PaginaCalendario.jsx     # MOD: montar la acción del informe mensual cuando el período está cerrado
├── components/InformeCierreContenido.jsx   # sin cambios (presentación reutilizada)
└── components/InformeCierrePrintable.jsx   # sin cambios (modal "Ver informe" reutilizado)

tests/
├── contract/web-api-informe-cierre.test.js   # MOD: casos tramo "Mes" en modo QUINCENAL + cuadre Mes==Q1+Q2 + cierre escribe 3 tramos
└── integration/…                             # opcional: flujo cerrar→ver informe mensual

frontend/src/components/
├── PaginaCalendario.test.jsx        # MOD: acción visible sólo con período cerrado; ver/descargar
└── AccionInformeCierre.test.jsx     # MOD: modo tramo "Mes"
```

**Structure Decision**: web application. El backend vive en `src/web` (API) +
`src/presentismo` (dominio/servicio/adaptadores); el frontend en `frontend/src`.
La feature reutiliza la infraestructura de la feature 018 y no introduce
carpetas nuevas.

## Complexity Tracking

> Sin violaciones de la Constitución. Tabla no aplicable.
