# Implementation Plan: Página de Configuración

**Branch**: `014-pagina-config` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-pagina-config/spec.md`

## Summary

Nueva página "Configuración" en la SPA existente que permite editar, sin tocar
archivos a mano: (1) los parámetros de conexión/sondeo del reloj biométrico y el
resto de los parámetros operativos hoy definidos en `.env` (`FICHADAS_*`,
`PRESENTISMO_RESUMEN_PERIODO`); (2) el catálogo de motivos de ausencia
(`config/motivos-ausencia.json`) — alta, edición y desactivación (nunca borrado
destructivo); y (3) las modalidades horarias, las categorías (alta y edición de
la modalidad asignada, nunca borrado) y el esquema semanal de días laborales
(`config/categorias.json`). Persiste reescribiendo los archivos existentes
(`.env` por clave=valor preservando comentarios, los JSON de config
serializados) detrás de nuevos endpoints `/api/configuracion/*`, reutilizando
los parsers fail-fast ya existentes (`categorias-config.js`,
`motivos-ausencia-config.js`) para validar antes de guardar. La verificación de
conectividad del reloj (FR-007) **no** abre una conexión TCP desde el proceso
web (Principio III): agrega una ruta nueva al servidor de control HTTP local
del servicio de fichadas (`contracts/control-api.md`, feature 010) que prueba
un host/puerto candidato con el driver ya aislado, sin persistir ni alterar el
scheduler en curso.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM), mismo stack que
007/010/011/012. Frontend React (Vite) en `frontend/`.

**Primary Dependencies**: Ninguna nueva. Reutiliza `node:fs` (lectura/escritura
de `.env` y de los JSON de config), `node:net` (ya usado por
`src/protocol/client.js` para la prueba de conexión), `node:test`/`node:assert`
para tests backend, y el store HTTP interno (`src/web/api/router.js`) +
cliente `fetch` del frontend ya existentes. Frontend: componentes de formulario
de AntD ya en dependencias (sin librerías nuevas).

**Storage**: Archivos de configuración existentes, reescritos in place (sin base
de datos, Principio VI: esto no es estado operativo por período ni registro de
liquidación, es configuración de despliegue/dominio igual que hoy):
- `.env`: parseo y reescritura por líneas `CLAVE=valor`, preservando
  comentarios y el resto de variables no gestionadas por esta feature
  (`RRHH_ORACLE_*`, rutas — fuera de alcance, FR-014 y Assumptions del spec).
- `config/categorias.json` y `config/motivos-ausencia.json`: se leen con los
  parsers fail-fast existentes, se aplican los cambios en memoria, se
  re-validan con el mismo parser antes de serializar, y se escriben de forma
  atómica (archivo temporal + rename) para no dejar el archivo a medio
  escribir ante un fallo (edge case del spec).

**Testing**: `node:test` + `node:assert`, unitario para los nuevos módulos de
lectura/escritura (`env-file.js`, extensiones de escritura de
`categorias-config.js`/`motivos-ausencia-config.js`) con fixtures de
calibración uno a uno con los Acceptance Scenarios del spec; contrato de los
endpoints nuevos (`tests/contract/web-api-configuracion.test.js`) y de la nueva
ruta del control-API (`tests/contract/control-api-probar-conexion.test.js`);
integración guardar → releer → persiste (`tests/integration`); componentes de
UI con `*.test.jsx` (mismo patrón que `FormularioJustificacion.test.jsx`).

**Target Platform**: Mismo runtime Node.js 20+ (Windows/Linux) y navegador vía
la SPA React existente. Dos procesos de servidor ya existentes: `rs956-web`
(sirve la SPA y `/api`) y `rs956-fichadas` (scheduler + servidor de control
local en loopback).

**Project Type**: Web application (backend Node.js + frontend React), misma
estructura que 007/010/011/012.

**Performance Goals**: Un guardado de configuración responde en < 1 s (SC-001
mide el flujo humano en < 1 min, holgado frente a una escritura de archivo
pequeño). La prueba de conexión al reloj respeta el mismo timeout configurable
que ya usa el driver (`FICHADAS_TIMEOUT_MS`, default 5000 ms).

**Constraints**: el proceso web NUNCA abre una conexión TCP directa al reloj
(Principio III, NON-NEGOTIABLE) — "probar conexión" (FR-007) se resuelve
exclusivamente vía una ruta nueva del control-API del proceso `rs956-fichadas`.
Ningún guardado deja un archivo de configuración a medio escribir (FR-015,
escritura atómica). Nunca se expone ni edita `RRHH_ORACLE_*` ni rutas de
archivos/directorios desde esta página (FR-014, Assumptions). El código de una
categoría y el `id` de un motivo son inmutables una vez creados (FR-012b,
FR-002 de Historia 2). No hay autenticación/roles nuevos (Assumptions del
spec).

**Scale/Scope**: Catálogos pequeños (unos pocos motivos, unas pocas
categorías/modalidades) editados por un puñado de responsables; sin
concurrencia significativa (edge case: última escritura exitosa gana, sin
locking).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: `PaginaConfiguracion.jsx`
  y sus subcomponentes son componentes React funcionales nuevos que hablan
  únicamente con un cliente API nuevo (`frontend/src/api/configuracion-client.js`),
  igual patrón que el resto de las páginas; ningún componente llama a Oracle ni
  al driver del reloj directamente. **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: esta feature no agrega ni
  modifica acceso a Oracle; excluye explícitamente `RRHH_ORACLE_*` de la UI
  (FR-014). **Cumple** (no aplica).
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: la prueba de conectividad
  (FR-007) NO se implementa abriendo un socket desde el proceso web. Se agrega
  una ruta al control-API existente del proceso `rs956-fichadas`
  (`contracts/control-api.md`), que internamente usa `connectSocket(host, port,
  timeoutMs)` de `src/protocol/client.js` — el mismo módulo aislado que ya usa
  el scheduler, sin filtrar detalle de protocolo hacia la UI ni hacia el
  proceso web. **Cumple**.
- **IV — Test-First en Capas Críticas**: esta feature no modifica el
  parser/driver del protocolo (solo agrega una ruta de control que reutiliza
  `connectSocket` tal cual) ni el repositorio Oracle, así que el mandato
  estricto de test-first no aplica directamente; de todos modos, dado que
  `categorias.json` gobierna el cálculo de presentismo (impacta liquidación),
  se escriben tests unitarios de calibración para la escritura/validación de
  categorías y modalidades antes de integrarla a la API, por buena práctica.
  **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: los cambios de
  configuración no son datos de fichaje ni biométricos; por Clarifications del
  spec, esta feature no incorpora auditoría (quién/cuándo). No se logra
  ninguna credencial ni dato sensible nuevo. **Cumple** (no aplica auditoría de
  fichajes).
- **VI — Persistencia por Niveles**: `.env` y los JSON de `config/` no son
  estado operativo por período ni registro de liquidación — son configuración
  de despliegue/dominio, ya persistida en archivo hoy; esta feature solo
  agrega la capacidad de escribirlos desde la UI, sin abrir un camino nuevo de
  escritura a Oracle. **Cumple** (no aplica).
- **Flujo de Git**: desarrollo en la rama `014-pagina-config`. **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity
Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — ver research.md y
data-model.md; el diseño no introdujo ninguna conexión directa al reloj desde
el proceso web ni acceso a Oracle.

## Project Structure

### Documentation (this feature)

```text
specs/014-pagina-config/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — entidades y su forma persistida
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   ├── env-config.schema.md        # Parámetros .env editables, tipos y validaciones
│   ├── web-api-configuracion.md    # Endpoints /api/configuracion/*
│   └── control-api.md              # Extensión: POST /probar-conexion (feature 010 + esta)
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── config/
│   └── env-file.js                  # NUEVO — lee `.env` como pares clave=valor
│                                      # preservando comentarios/orden; actualiza solo
│                                      # las claves editables (FICHADAS_*,
│                                      # PRESENTISMO_RESUMEN_PERIODO) y valida tipos
│                                      # (IP/host, puerto 1-65535, entero positivo,
│                                      # HH:MM, booleano, enum) antes de escribir
│                                      # atómicamente (tmp + rename)
├── presentismo/
│   └── config/
│       ├── categorias-config.js        # + `serializarCategoriasConfig` y funciones
│       │                                 # de edición (agregar/editar modalidad,
│       │                                 # agregar categoría / reasignar su modalidad,
│       │                                 # editar esquemaSemanal) que reutilizan
│       │                                 # `parseCategoriasConfig` para re-validar
│       │                                 # antes de escribir; impide eliminar una
│       │                                 # modalidad en uso (FR-012) y eliminar
│       │                                 # categorías (FR-012a) o renombrar su código
│       │                                 # (FR-012b)
│       └── motivos-ausencia-config.js  # + `serializarMotivosAusenciaConfig` y
│                                         # funciones de alta/edición/desactivación de
│                                         # motivo, reutilizando `parseMotivosAusenciaConfig`
│                                         # para re-validar (id único e inmutable, FR-010).
│                                         # CAMBIO: relaja el fail-fast "debe haber al
│                                         # menos un motivo activo" (spec 012) a una
│                                         # advertencia no bloqueante — ver research.md
│                                         # (conflicto con el edge case de esta spec, que
│                                         # permite dejar el catálogo sin motivos activos)
├── cli/
│   └── consulta-programada.js  # + ruta nueva `POST /probar-conexion` en
│                                 # `crearServidorControl` (junto a `POST /tick`,
│                                 # contracts/control-api.md): recibe { host, port },
│                                 # usa `connectSocket` de src/protocol/client.js con
│                                 # timeout de FICHADAS_TIMEOUT_MS, cierra el socket y
│                                 # responde { ok, motivo? } — nunca persiste ni toca
│                                 # el scheduler
├── web/
│   ├── wiring.js  # + expone al contexto web las rutas de `.env`, `categorias.json`,
│   │                # `motivos-ausencia.json` y el cliente de control (para proxear
│   │                # `/probar-conexion`, mismo patrón que `consultarReloj`)
│   ├── api/
│   │   └── configuracion-handlers.js  # NUEVO — GET/PUT parámetros del reloj/servicio,
│   │                                    # GET/PUT catálogo de motivos, GET/PUT
│   │                                    # categorías+modalidades+esquemaSemanal,
│   │                                    # POST probar-conexion (proxy a control-API)
│   └── server.js  # + registra `configuracion-handlers.js`

frontend/
├── src/
│   ├── api/
│   │   └── configuracion-client.js  # NUEVO — mismo patrón que resumen-periodo-client.js
│   ├── components/
│   │   ├── PaginaConfiguracion.jsx       # NUEVO — orquesta las 3 secciones (tabs o
│   │   │                                  # acordeón: Reloj/Servicio, Motivos,
│   │   │                                  # Categorías) + PaginaConfiguracion.test.jsx
│   │   ├── FormularioConexionReloj.jsx   # NUEVO — Historia 1 y 4 (+ botón "Probar
│   │   │                                  # conexión") + su test
│   │   ├── TablaMotivosAusencia.jsx      # NUEVO — Historia 2 (listar/alta/editar/
│   │   │                                  # desactivar) + su test
│   │   └── FormularioCategoriasModalidades.jsx  # NUEVO — Historia 3 (modalidades,
│   │                                              # categorías, esquema semanal) + su test
│   ├── components/AppShell.jsx  # + entrada de navegación "Configuración"
│   └── App.jsx  # + rama 'configuracion' con PaginaConfiguracion

tests/
├── contract/
│   ├── web-api-configuracion.test.js
│   └── control-api-probar-conexion.test.js
├── integration/
│   └── configuracion.integration.test.js  # guardar cada sección → releer → persiste
└── unit/
    ├── env-file.test.js
    ├── presentismo-categorias-config.test.js  # + casos de escritura/edición
    └── presentismo-motivos-ausencia-config.test.js  # + casos de escritura/edición
```

**Structure Decision**: Web application ya existente (backend Node.js en `src/`
+ frontend React en `frontend/`, feature 007). Esta feature no agrega
proyectos ni cambia la topología de dos procesos backend (`rs956-web` +
`rs956-fichadas`); solo extiende ambos y agrega una página + cliente API en el
frontend, siguiendo el mismo patrón de capas (dominio → adaptador de config →
API → cliente → componente) que 010/011/012.

## Complexity Tracking

*Sin violaciones del Constitution Check — sección vacía.*
