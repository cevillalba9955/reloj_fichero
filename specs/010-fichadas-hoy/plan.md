# Implementation Plan: Página "Fichadas de Hoy"

**Branch**: `010-fichadas-hoy` | **Date**: 2026-07-16 (iteración 2: 2026-07-18) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-fichadas-hoy/spec.md`

## Summary

Una página web de administración que muestra, para el día en curso, el estado de
asistencia de todos los empleados esperados (legajo, nombre, entrada, salida, horas
trabajadas, situación `ESPERANDO`/`PRESENTE`/`TARDE`/`AUSENTE`/completa/retiro
anticipado), permite a un administrador corregir manualmente los horarios con
justificación obligatoria, agregar una pausa intermedia o un retiro anticipado
(también con justificación), y disparar bajo demanda una consulta de fichadas nuevas
al reloj biométrico.

Enfoque técnico: la feature **reutiliza casi todo el dominio y servicio de
presentismo ya entregados en la feature 004** (`calcularEmpleado`, `cargarCorreccion`,
`cargarPausa`, calendario del mes) en lugar de crear un cálculo paralelo. Se agregan
tres piezas nuevas, todas en la capa de dominio pura o en la de orquestación/API, sin
tocar el protocolo RS956 (Principio III) ni el acceso Oracle (Principio II):

1. **Situación "hoy"** (`domain/situacion-dia.js`): función pura que, a partir del
   resultado de jornada de 004 (auto + ajustes) y la hora actual, deriva el estado
   `ESPERANDO`/`PRESENTE`/`TARDE`/`AUSENTE`/jornada completa/retiro
   anticipado/anomalía — vocabulario nuevo para esta feature, no existía en 004
   (que solo calcula retrospectivamente al cierre del período).
2. **Retiro anticipado**: se modela como una **Pausa** (entidad ya existente en 004,
   `[desde,hasta]` + motivo + autor) con un campo `tipo` nuevo (`intermedia` |
   `retiro_anticipado`) cuyo intervalo va desde la hora de retiro hasta el cierre
   oficial; reutiliza el descuento de pausas ya implementado sin nueva entidad de
   persistencia, y la situación lo distingue por su `tipo`.
3. **Corrección a nivel de entrada/salida**: 004 solo permitía corregir el total de
   horas del día (`valorCorregido`); esta feature extiende `crearCorreccion`/
   `aplicarAjustes` para aceptar una corrección de la hora de entrada y/o salida (en
   minutos-del-día), de la que se derivan entrada/salida efectivas y el total,
   porque la lista de hoy debe mostrar la hora corregida, no solo el total (spec
   FR-003/FR-005).

La consulta manual al reloj (US4) **no llama al scheduler en el mismo proceso**: el
servidor web (`rs956-web.service`) y el servicio de fichadas (`rs956-fichadas.service`,
donde vive el `scheduler` de la feature 002) corren como procesos de sistema operativo
separados en el despliegue real (`deploy/*.service`, research.md §4). Se agrega un
servidor de control HTTP mínimo, atado a `127.0.0.1`, dentro del proceso de fichadas
(`POST /tick`), y la API web lo llama por HTTP local — el proceso de fichadas sigue
siendo el único dueño de la conexión al reloj (Principio III), sin tocar protocolo
desde la capa web.

## Technical Context

**Language/Version**: Node.js ≥20 (JavaScript, ESM `type: module`) para el backend
(`src/`), mismo stack que 001–009. Frontend React 18.3 + Vite 5.4 (JavaScript, sin
TypeScript), mismo stack que las features 007/008.

**Primary Dependencies**: Ninguna dependencia nueva de runtime. Backend: `node:http`
(sin framework, router propio de `src/web/api/router.js`), dominio de presentismo
(feature 004, `src/presentismo/`), roster (feature 003, `src/roster/`), scheduler y
protocolo (feature 002, `src/scheduling/`, `src/protocol/`). Frontend: React + Vite,
mismo patrón de cliente HTTP a `/api` que `frontend/src/api/calendario-client.js`.

**Storage**: Sin cambios de nivel de persistencia respecto de 004 (Principio VI):
estado operativo (correcciones, pausas — incluido el nuevo `tipo` de pausa) en el
archivo JSON por período existente (`file-presentismo-repository.js`), sin migración
de esquema (campo `tipo` opcional, retrocompatible con pausas ya guardadas). Las
fichadas nuevas obtenidas por el botón "consultar reloj" se importan al archivo
acumulativo por período ya usado por 004 (`data/presentismo/fichadas/<periodo>.json`),
igual que hoy hace el subcomando CLI `importar-fichadas`, ahora también invocable
desde la API web. Sin Oracle de escritura (ninguna corrección/pausa/retiro va a
Oracle).

**Testing**: Backend `node:test` (unit para el dominio nuevo — situación y extensión
de corrección/pausa —, contract para los puertos sin cambios de forma, integration
para los endpoints nuevos), reutilizando fixtures de calibración derivados de los
Acceptance Scenarios del spec (igual criterio que 004). Frontend Vitest + Testing
Library, mismo patrón que los componentes de 007/008.

**Target Platform**: Misma aplicación web local ya desplegada (feature 005): servidor
Node sirviendo `/api` + build estático de Vite; navegador moderno.

**Project Type**: Web (frontend + backend en el mismo repo, estructura ya existente).

**Performance Goals**: Cálculo de la lista de "hoy" para hasta ~500 empleados
(reutilizando `calcularEmpleado` por legajo, ya acotado a <2s por empleado en 004) en
menos de 5 s percibidos (SC de esta feature); una corrección/pausa/retiro individual
se refleja en la fila en <1 s tras la respuesta del servidor. Sin objetivos nuevos de
throughput sobre el reloj (el scheduler ya limita a una sesión TCP a la vez).

**Constraints**: Ninguna corrección/pausa/retiro se persiste sin motivo no vacío
(FR-004, ya garantizado por `crearCorreccion`/pausa en 004, extendido acá). La
consulta manual al reloj respeta el single-flight del scheduler (FR-011, ya
garantizado por `consultaEnCurso` en 002) — no se agrega un segundo mecanismo de
lock. Ninguna respuesta expone datos biométricos crudos (Principio V, FR-015).

**Scale/Scope**: Un establecimiento, hasta ~500 empleados, un solo día por vista.
Cambios acotados a: `src/presentismo/domain/` (situación + extensión de
corrección/pausa), `src/presentismo/service/` (orquestación de "hoy"), `src/web/`
(nuevos handlers + wiring de roster en el contexto web, hoy ausente),
`src/cli/consulta-programada.js` + `src/service/consulta-programada-service.js`
(servidor de control HTTP local `POST /tick`, research.md §4), y `frontend/src/`
(página + componentes nuevos).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: la página nueva se construye
  como componentes de presentación (fila de empleado, formulario de corrección,
  formulario de pausa/retiro, botón de consulta al reloj) que consumen un cliente de
  datos (`fichadas-hoy-client.js`, mismo patrón que `calendario-client.js`); ningún
  componente calcula situación ni habla con Oracle/reloj directo — todo pasa por
  `/api`. **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: esta feature no agrega lecturas ni
  escrituras nuevas a Oracle; el nombre/legajo esperado del día sale del snapshot
  local del padrón (`local-file-active-employees-provider`, ya existente), de solo
  lectura. **Cumple** (N/A, sin cambios de superficie Oracle).
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: la consulta manual al reloj se
  dispara vía HTTP local hacia el proceso que ya posee el `scheduler`/driver
  (`rs956-fichadas.service`, research.md §4); la API web nunca abre ni comparte una
  conexión al reloj, y sigue existiendo un único proceso dueño de la sesión TCP en
  todo momento. Esta feature no toca framing, comandos ni el driver. **Cumple**.
- **IV — Test-First en Capas Críticas**: la situación de hoy y la extensión de
  corrección/pausa (entrada/salida, retiro anticipado) impactan directamente el dato
  de presentismo que alimentará liquidación → se tratan como capa crítica: tests
  unitarios primero, con fixtures de calibración derivados uno a uno de los
  Acceptance Scenarios del spec (igual criterio que 004). El flujo de corrección
  manual end-to-end (API + UI) se cubre con test de integración. **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: cada corrección, pausa y
  retiro anticipado nuevo se loguea reutilizando el logger NDJSON de 004
  (`correccion_alta`, `pausa_alta`, ambos ya estructurados por período/legajo/día);
  la consulta manual al reloj reutiliza el logging de ciclo de 002. Ninguna respuesta
  de `/api/fichadas-hoy` expone datos biométricos crudos ni credenciales (FR-015).
  **Cumple**.
- **VI — Persistencia por Niveles**: todo lo nuevo (pausas con `tipo`, correcciones de
  entrada/salida) se persiste en el mismo archivo JSON por período detrás del puerto
  `PresentismoRepository`, sin base de datos y sin escritura en Oracle (no es cierre
  de período). **Cumple**.
- **Flujo de Git**: desarrollo en la rama `010-fichadas-hoy` (creada desde `main`).
  **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking`
vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios. El diseño mantiene la
situación y la extensión de corrección/pausa como dominio puro, sin nuevas
dependencias de runtime, sin tocar Oracle ni el protocolo, y reutilizando la
persistencia y el logging ya existentes de 004.

## Project Structure

### Documentation (this feature)

```text
specs/010-fichadas-hoy/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md         # Fase 1 — entidades nuevas/extendidas y forma de la vista
├── quickstart.md         # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   ├── web-api.md         # Fase 1 — endpoints /api/fichadas-hoy/*
│   └── control-api.md     # Fase 1 — POST /tick local (research.md §4)
├── checklists/
│   └── requirements.md   # Checklist de calidad de la spec (ya creado por /speckit-specify)
└── tasks.md              # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   ├── situacion-dia.js        # NUEVO — calcula ESPERANDO/PRESENTE/TARDE/AUSENTE/
│   │   │                           # completa/retiro anticipado/anomalía a partir de
│   │   │                           # jornada + hora actual
│   │   ├── correccion.js           # + soporte a corrección de entrada/salida (minutos)
│   │   ├── pausa.js                # + campo `tipo` ('intermedia'|'retiro_anticipado')
│   │   └── jornada.js              # aplicarAjustes: recalcula entrada/salida efectiva
│   │                               # cuando la corrección trae entrada/salida (no solo total)
│   ├── ports/
│   │   └── index.js                # sin cambios de forma (pausa/corrección siguen
│   │                               # siendo objetos abiertos; `tipo` es campo adicional)
│   └── service/
│       ├── calcular-presentismo-service.js  # + calcularHoy(periodo, fecha, legajos),
│       │                                    # cargarRetiroAnticipado (envuelve cargarPausa)
│       └── consultar-reloj-cliente.js       # NUEVO — cliente HTTP local hacia
│                                             # POST /tick del servicio de fichadas
├── service/
│   └── consulta-programada-service.js  # startService(): expone `tick` en el handle
│                                        # devuelto (hoy solo {getState, stop})
├── cli/
│   └── consulta-programada.js      # + servidor de control HTTP local (127.0.0.1,
│                                    # FICHADAS_CONTROL_PORT) con POST /tick
├── web/
│   ├── wiring.js                   # + roster provider, categoryProvider, fichadasProvider
│   │                               # y cliente de control del servicio de fichadas
│   │                               # (FICHADAS_CONTROL_URL) en el contexto web (hoy ausentes)
│   ├── view-model.js               # + construirVistaFichadasHoy(...)
│   └── api/
│       └── fichadas-hoy-handlers.js # NUEVO — GET /api/fichadas-hoy,
│                                    # POST correcciones/pausas/retiros-anticipados/consultar-reloj

frontend/
└── src/
    ├── api/
    │   └── fichadas-hoy-client.js  # NUEVO — mismo patrón que calendario-client.js
    └── components/
        ├── PaginaFichadasHoy.jsx        # NUEVO — página/contenedor
        ├── TablaFichadasHoy.jsx         # NUEVO — lista con legajo/nombre/.../situación
        ├── FormularioCorreccion.jsx     # NUEVO — corrección con motivo obligatorio
        ├── FormularioPausaRetiro.jsx    # NUEVO — pausa intermedia / retiro anticipado
        └── BotonConsultarReloj.jsx      # NUEVO — dispara consulta manual, muestra error

tests/
├── unit/
│   ├── presentismo-situacion-dia.test.js   # NUEVO — fixtures de calibración (Acceptance)
│   ├── presentismo-correccion.test.js      # + casos de corrección entrada/salida
│   ├── presentismo-pausa.test.js           # + casos de tipo retiro_anticipado
│   └── presentismo-jornada.test.js         # + aplicarAjustes con corrección de entrada/salida
├── contract/
│   └── web-api-fichadas-hoy.test.js        # NUEVO — contrato de los endpoints nuevos
└── integration/
    └── fichadas-hoy.integration.test.js    # NUEVO — flujo completo: ver → corregir →
                                             # pausa/retiro → consultar reloj

frontend/src/components/*.test.jsx          # + tests de los componentes nuevos
```

**Structure Decision**: Estructura web existente (frontend + backend en un repo,
igual que 007/008). La feature **extiende** el dominio y servicio de presentismo de
004 sin romper su forma pública, agrega handlers y wiring nuevos en `src/web/`, y
suma componentes nuevos al frontend siguiendo el patrón de cliente HTTP + componentes
de presentación ya usado en 007/008. No se crean nuevos módulos de nivel superior ni
nuevas capas de persistencia.

## Iteración 2 — Navegación de días previos, columnas de pausa y modales (2026-07-18)

Delta incremental sobre la implementación ya entregada (T053), derivado de las
clarificaciones del 2026-07-18 en spec.md (US5, FR-016/FR-017/FR-018, y las
extensiones de FR-001/FR-003/FR-006/FR-007/FR-008).

### Resumen del delta

1. **Navegación a días previos (US5, FR-016/FR-017)** — research.md §6. El backend ya
   acepta `fecha` en el GET y en los tres POST de edición; el trabajo real es:
   (a) un predicado único de navegabilidad `fechaNavegable(fecha, { hoy, periodos })`
   — `fecha <= hoy` y período con calendario generado (`repo.listarPeriodos()`), la
   materialización operativa de "período de liquidación abierto" mientras el cierre de
   período (Principio VI, nivel Oracle) no exista; (b) validarlo en el GET
   (`400 FECHA_FUERA_DE_RANGO`) y en los POST de corrección/pausa/retiro; (c) exponer
   `navegacion { anterior, siguiente, esHoy }` en la `VistaFichadasHoy` para que la UI
   no re-derive la regla; (d) UI de navegación «día anterior / día siguiente» en el
   encabezado de la página, ocultando «Consultar reloj» cuando `esHoy` es `false`.
2. **Columnas de pausa (FR-001 extendido)** — research.md §7. Sin cambio de API:
   `pausas[]` ya viaja en la fila. La tabla agrega columnas «Inicio pausa» /
   «Fin pausa» con la primera pausa vigente `tipo: 'intermedia'` por `desde` (+`+N` si
   hay más), derivada en el componente; retiros anticipados excluidos de estas
   columnas.
3. **Formularios modales (FR-018)** — research.md §8. Nuevo componente de presentación
   `Dialogo.jsx` (patrón div+backdrop de `DialogoConfirmarReclasificar` de 007:
   `role="dialog"`, `aria-modal`, Escape y click en backdrop = cancelar);
   `PaginaFichadasHoy` envuelve `FormularioCorreccion` y `FormularioPausaRetiro` en
   él, sin cambiar la lógica interna de los formularios.

### Archivos afectados (delta)

```text
src/web/
├── view-model.js                    # + navegacion { anterior, siguiente, esHoy }
│                                     # en construirVistaFichadasHoy; helper
│                                     # fechaNavegable(fecha, { hoy, periodos })
└── api/
    └── fichadas-hoy-handlers.js     # + validación FECHA_FUERA_DE_RANGO en GET y en
                                      # POST correcciones/pausas/retiros-anticipados
                                      # (ctx.repo.listarPeriodos ya disponible)

frontend/src/
├── api/
│   └── fichadas-hoy-client.js       # obtenerFichadasHoy(fecha?) — query ?fecha=
└── components/
    ├── Dialogo.jsx                  # NUEVO — modal reutilizable (research.md §8)
    ├── NavegacionDia.jsx            # NUEVO — flechas anterior/siguiente + fecha
    ├── PaginaFichadasHoy.jsx        # estado fecha seleccionada; carga por fecha;
    │                                 # botón consultar-reloj solo si esHoy;
    │                                 # formularios dentro de Dialogo
    └── TablaFichadasHoy.jsx         # + columnas Inicio/Fin pausa (+N)

tests (delta):
├── tests/unit/…                     # fechaNavegable (bordes: hoy, mañana, período
│                                     # sin calendario, primer día navegable)
├── tests/contract/web-api-fichadas-hoy.test.js   # + ?fecha= oficial, 400
│                                     # FECHA_FUERA_DE_RANGO en GET y POSTs, navegacion
├── tests/integration/fichadas-hoy.integration.test.js  # + editar un día previo
└── frontend/src/components/*.test.jsx  # Dialogo, NavegacionDia, columnas de pausa,
                                      # formularios en modal (quickstart Esc. 5–6)
```

Sin cambios en `src/presentismo/` (dominio y servicio ya calculan cualquier fecha del
período), sin cambios de persistencia, sin cambios en el servicio de fichadas ni en el
control HTTP local.

### Constitution Check (iteración 2)

- **I — Componentes**: `Dialogo` y `NavegacionDia` son presentación pura; la regla de
  navegabilidad vive en el servidor y llega como datos (`navegacion`). **Cumple**.
- **II — Oracle aislado / III — Protocolo RS956**: sin cambios de superficie (la
  iteración no toca Oracle, el reloj ni el proceso de fichadas). **Cumple** (N/A).
- **IV — Test-First en capas críticas**: la validación de fecha protege el dato de
  presentismo que alimenta liquidación (impide editar períodos no abiertos) → tests
  de `fechaNavegable` y del contrato `FECHA_FUERA_DE_RANGO` primero; la UI (modales,
  columnas) sigue el criterio flexible con tests de componentes. **Cumple**.
- **V — Observabilidad y datos sensibles**: sin datos nuevos expuestos (la navegación
  reutiliza la misma vista); la auditoría de ediciones sobre días previos ya registra
  fecha del día corregido + autor/motivo (mecanismo de 004 sin cambios). **Cumple**.
- **VI — Persistencia por niveles**: sin cambios; el predicado de navegabilidad queda
  preparado para incorporar el estado "cerrado" cuando el cierre de período se
  implemente, en un único punto. **Cumple**.

**Resultado del gate (iteración 2)**: PASA. Sin violaciones; `Complexity Tracking`
sigue vacío.

## Complexity Tracking

> Sin violaciones de la constitución. Tabla no aplicable.
