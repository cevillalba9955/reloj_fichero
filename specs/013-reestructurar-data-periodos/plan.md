# Implementation Plan: Reestructurar Almacenamiento por Período

**Branch**: `013-reestructurar-data-periodos` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-reestructurar-data-periodos/spec.md`

## Summary

Reorganiza el estado operativo del dominio de presentismo (features 004/010/012) de
archivos sueltos y un padrón único y global a **una carpeta por período mensual**
(`P<YYYYMM>`, por ejemplo `P202608`), que contiene `calendario.json` (calendario +
correcciones + pausas + justificaciones, el mismo estado que hoy vive en
`<periodo>.json`), `fichadas.json` (el mismo acumulado que hoy vive en
`fichadas/<periodo>.json`) y `padron.json` (nuevo: antes era un único archivo
compartido por todo el sistema). El padrón se crea junto con el calendario al
generarlo, y toda sincronización posterior del padrón escribe siempre sobre la
carpeta del **mes en curso** (el reloj real al momento de sincronizar), nunca sobre
un período pasado. Se agrega un indicador `cerrado` al calendario, con una acción
explícita de un responsable para cerrar y otra para reabrir un período (reversible,
auditada); mientras un período está cerrado, todas las operaciones que lo modifican
(reclasificar, corregir, pausar, justificar, incorporar fichadas) se rechazan, pero
la consulta sigue funcionando igual. La subida a la base institucional y el borrado
de carpetas antiguas, mencionadas como motivación, quedan fuera de esta feature.

## Technical Context

**Language/Version**: Node.js 20 LTS (JavaScript, ESM), mismo stack que 001–012.

**Primary Dependencies**: Ninguna nueva. Sigue usando exclusivamente `node:fs`/`node:path`
de la librería estándar (mismo criterio que `file-presentismo-repository.js` y
`file-fichadas-archive.js` ya existentes).

**Storage**: Reestructuración del **mismo nivel de persistencia** que ya define el
Principio VI (estado operativo en archivos JSON locales por período, sin base de
datos): pasa de `<repoDir>/<periodo>.json` + `<repoDir>/fichadas/<periodo>.json` +
`<repoDir>/padron.json` (único) a `<repoDir>/P<periodo>/{calendario.json,
fichadas.json, padron.json}`. No introduce Oracle ni cambia el registro de
liquidación al cierre (fuera de alcance, ya lo estaba en 004).

**Testing**: `node:test` + `node:assert`, test-first en las capas que ya se tratan
como críticas (Principio IV): el repositorio de archivo (rutas nuevas, no debe perder
ni mezclar datos entre períodos) y el guardado de "cerrado" (debe bloquear
consistentemente todas las vías de escritura). Se reutiliza el mismo test de
contrato parametrizado (`presentismo-ports.contract.test.js`) para verificar que el
adaptador de archivo sigue cumpliendo `PresentismoRepository` con el layout nuevo.

**Target Platform**: Mismo runtime Node.js 20+ (Windows/Linux); afecta tanto al CLI
(`src/cli/calcular-presentismo.js`, `src/cli/consulta-programada.js`) como al backend
web (`src/web/wiring.js` y handlers).

**Project Type**: Web application existente (backend Node.js + frontend React) — esta
feature es mayormente backend/infraestructura de datos; agrega dos acciones nuevas
(cerrar/reabrir período) con su reflejo mínimo en la API web, siguiendo el mismo
patrón que ya expone `reclasificar` en `calendario-handlers.js`.

**Performance Goals**: Sin cambio de orden de magnitud (mismo volumen que hoy: ~500
empleados, ~31 días/mes, un archivo por período en vez de tres ubicaciones); leer o
escribir el estado de un período sigue siendo una operación de archivo único por
tipo de dato, ahora dentro de una carpeta en vez de tres rutas distintas.

**Constraints**: Ningún dato de un período DEBE filtrarse ni mezclarse con el de
otro al migrar la resolución de rutas (SC de "un período no lee ni modifica a otro").
Toda actualización del padrón DEBE resolver el "mes en curso" a partir del reloj real
en el momento de la operación, no de un valor cacheado al arrancar el proceso (el
backend web es de larga vida y puede seguir corriendo cuando el mes cambia).

**Scale/Scope**: Mismo orden que 004/010/012; alcance limitado a la capa de
persistencia/adaptadores y al nuevo ciclo de vida cerrado/abierto — no cambia ningún
cálculo de presentismo ni ninguna vista existente más allá de reflejar el nuevo
indicador `cerrado`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: el único tocado de UI es
  reflejar `cerrado` en la vista de calendario existente y, opcionalmente, un botón
  de cerrar/reabrir en `PaginaCalendario`; sigue pasando por el cliente API existente
  (`frontend/src/api/calendario-client.js`), sin acceso directo a archivos. **Cumple**.
- **II — Repositorio de Datos Oracle Aislado**: esta feature no toca Oracle; el
  padrón se sigue sincronizando solo vía `sincronizar-padron` (lectura, capa
  `src/db/`). **Cumple** (no aplica cambio).
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: no toca el protocolo del reloj;
  solo cambia dónde se persisten las fichadas ya decodificadas. **Cumple** por no
  intervención.
- **IV — Test-First en Capas Críticas**: el repositorio de archivo y el guardado de
  "cerrado" impactan la integridad de todo el estado operativo (y, transitivamente,
  la liquidación) → se tratan como capas críticas: test-first con el test de
  contrato parametrizado existente más casos nuevos de "no mezcla entre períodos" y
  "bloqueo de escritura con período cerrado". **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: cerrar/reabrir un período
  se loguea en NDJSON estructurado (mismo logger de 004), con autor y período, sin
  datos biométricos ni credenciales; el padrón por período sigue guardando solo
  `{legajo, categoria, nombre}` (mismo criterio que hoy). **Cumple**.
- **VI — Persistencia por Niveles (Estado Operativo en Archivo, Liquidación en
  Oracle)**: esta feature es exactamente una reorganización **dentro** del nivel de
  estado operativo en archivo que el Principio VI ya define como "por período";
  no introduce una escritura nueva a Oracle ni adelanta el registro de liquidación.
  **Cumple** — refuerza el principio en vez de tensionarlo.
- **Flujo de Git**: desarrollo en la rama `013-reestructurar-data-periodos`, creada
  desde `main` (que ya incluye 012 mergeada). **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking`
vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios — ver research.md y
data-model.md; ningún hallazgo de diseño introdujo Oracle, UI fuera del cliente API
existente, ni un tercer nivel de persistencia.

## Project Structure

### Documentation (this feature)

```text
specs/013-reestructurar-data-periodos/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 — decisiones de diseño
├── data-model.md        # Fase 1 — entidades y forma persistida
├── quickstart.md        # Fase 1 — escenarios de validación end-to-end
├── contracts/
│   ├── storage-layout.md      # Layout de carpetas/archivos por período
│   ├── cli-presentismo.md     # Subcomandos nuevos/modificados del CLI
│   └── web-api.md             # Endpoints nuevos (cerrar/reabrir período)
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── presentismo/
│   ├── domain/
│   │   ├── calendario-mes.js        # + `cerrado`/`cierre` en la forma del
│   │   │                             # calendario; + cerrarCalendario/
│   │   │                             # reabrirCalendario (auditoría); +
│   │   │                             # periodoDeFecha(date) reutilizable
│   │   │                             # (dedup con view-model.js mesActualPeriodo)
│   │   └── periodo-storage.js       # NUEVO — pura: `rutaCarpetaPeriodo(repoDir,
│   │                                 # periodo)` = `${repoDir}/P${periodo}`, y
│   │                                 # los 3 nombres de archivo fijos
│   │                                 # (calendario.json/fichadas.json/padron.json)
│   ├── adapters/
│   │   ├── file-presentismo-repository.js   # rutaDe(periodo) → carpeta/
│   │   │                                     # calendario.json; sin cambio de
│   │   │                                     # forma del estado (correcciones/
│   │   │                                     # pausas/justificaciones siguen ahí)
│   │   ├── file-fichadas-archive.js         # ruta → carpeta/fichadas.json
│   │   │                                     # (ya no una subcarpeta `fichadas/`
│   │   │                                     # aparte)
│   │   ├── archive-fichadas-provider.js     # sin cambios de contrato, solo
│   │   │                                     # sigue la ruta nueva
│   │   ├── file-padron-category-provider.js # + resuelve la carpeta del
│   │   │                                     # PERÍODO PEDIDO (no un path fijo);
│   │   │                                     # cache por período, no eterna
│   │   └── in-memory-presentismo-repository.js  # refleja `cerrado` en memoria
│   │                                             # (mismo comportamiento que el
│   │                                             # adaptador de archivo)
│   ├── ports/
│   │   └── index.js                 # + métodos de PresentismoRepository:
│   │                                 # cerrarPeriodo/reabrirPeriodo
│   └── service/
│       └── calcular-presentismo-service.js  # + cerrarPeriodo/reabrirPeriodo;
│                                             # + guarda "período abierto" antes
│                                             # de cada operación de escritura
│                                             # (reclasificar, corrección, pausa,
│                                             # justificación, sus reversiones)
├── roster/
│   └── local-file-active-employees-provider.js  # + resuelve la carpeta del mes
│                                                  # en curso en cada llamada
│                                                  # (FR-004), no un path fijo
├── web/
│   ├── wiring.js                    # ya no arma `padronFile`/`fichadasDir`
│   │                                 # fijos: pasa `repoDir` a los adaptadores,
│   │                                 # que resuelven el período internamente
│   └── api/
│       └── calendario-handlers.js   # + POST /api/calendarios/:periodo/cerrar
│                                     # y /reabrir (mismo patrón que reclasificar)
└── cli/
    ├── calcular-presentismo.js      # + subcomandos `cerrar-periodo` /
    │                                 # `reabrir-periodo`; ajusta las funciones
    │                                 # de resolución de ruta de padrón/fichadas
    │                                 # al layout nuevo
    └── consulta-programada.js       # ajusta `fichadasArchiveDir` al layout
                                     # nuevo (repoDir + período, ya no una
                                     # subcarpeta `fichadas/` fija)

frontend/
└── src/
    └── components/
        └── PaginaCalendario.jsx     # (opcional, ver research.md §5) botón
                                     # cerrar/reabrir + indicador visual de
                                     # período cerrado en el encabezado

tests/
├── unit/
│   └── presentismo-calendario-mes.test.js   # + cerrado por defecto false,
│                                             # cerrarCalendario/reabrirCalendario
├── contract/
│   └── presentismo-ports.contract.test.js   # + casos: no mezcla entre
│                                             # períodos, cerrar bloquea listado
│                                             # de mutaciones del contrato
└── integration/
    └── periodo-cerrado.integration.test.js  # NUEVO — extremo a extremo: cerrar
                                             # bloquea reclasificar/corrección/
                                             # pausa/justificación/importar-
                                             # fichadas; reabrir los vuelve a
                                             # habilitar; el padrón se actualiza
                                             # siempre en el mes en curso
```

**Structure Decision**: Web application existente. No se agrega ningún subárbol de
alto nivel: se reubican las rutas que ya resuelven `file-presentismo-repository.js`,
`file-fichadas-archive.js` y el par padrón (`file-padron-category-provider.js` +
`local-file-active-employees-provider.js`) detrás de un único helper puro nuevo
(`periodo-storage.js`), y se extiende el dominio del calendario (004) con el ciclo
de vida cerrado/abierto siguiendo el mismo patrón de auditoría que ya usan
Corrección Manual y Justificación.

## Complexity Tracking

> Sin violaciones de la Constitución. Sección no aplicable.
