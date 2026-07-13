# Implementation Plan: Servicio de Fichadas — Persistencia y Despliegue Desatendido en Linux

**Branch**: `005-servicio-despliegue-linux` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-servicio-despliegue-linux/spec.md`

## Summary

Convertir el servicio de consulta programada (feature 002) en un daemon de producción para
Linux que (1) **persiste** las fichadas que recolecta en el mismo **archivo acumulativo por
período** que consume el cálculo de presentismo (feature 004), deduplicadas por `rawHex`;
(2) puede leer el **padrón de empleados activos desde el snapshot local** de presentismo
(sin conexión a Oracle en runtime); (3) opera **día tras día** mediante un reinicio diario
programado; y (4) se despliega como **servicio de systemd** con arranque al boot, reinicio
ante fallo y apagado limpio, documentado en una guía reproducible.

Enfoque técnico: cambios quirúrgicos sobre el código existente, reutilizando piezas de las
features 002 y 004. La persistencia se inyecta como un **sink opcional** en el scheduler
(inversión de dependencias; el scheduler no importa nada de presentismo — el sink se arma en
el composition root del CLI). El lector de padrón por archivo se extiende para aceptar el
esquema del snapshot 004 además del legacy. La continuidad multi-día y la ejecución
desatendida se resuelven con artefactos de systemd (unit + timer), sin lógica nueva en el
proceso. No hay UI.

## Technical Context

**Language/Version**: Node.js 20.12 LTS o superior (JavaScript, ESM `type: module`) — mismo
stack que 001/002/003/004. El piso sube de `>=20` a `>=20.12` por el flag
`--env-file-if-exists` que ya usan los scripts.

**Primary Dependencies**: Ninguna nueva de runtime para el servicio. Solo librería estándar
(`node:net`, `node:fs`, `node:util`, `node:path`, `node:test`). `oracledb` (thin, ya
presente) NO participa del runtime del servicio en modo archivo/snapshot: solo lo usa el
paso puntual `sincronizar-padron` (feature 004) para generar el snapshot. systemd es
dependencia del sistema operativo, no del código.

**Storage**: Reutiliza el **archivo acumulativo de fichadas por período** de la feature 004
(`data/presentismo/fichadas/<periodo>.json`, tras `PRESENTISMO_FICHADAS_DIR`) vía
`file-fichadas-archive.registrarFichadas` — se le agrega **escritura atómica** (temp+rename)
por haber ahora un escritor de larga duración y un lector concurrente (`calcular`). El
padrón se lee del **snapshot local** (`data/presentismo/padron.json`). Estado en memoria del
servicio (checkpoints) sin cambios.

**Testing**: `node:test` + `node:assert` (igual que 001–004). Test-first en la capa crítica
(persistencia de fichadas: impacta liquidación). Integración con el **servidor TCP mock**
existente ([tests/integration/consulta-programada-service.integration.test.js](../002-servicio-fichadas-programado/)),
extendido para verificar el round-trip productor (servicio) → consumidor (`calcular`).

**Target Platform**: Servidor Linux con systemd (Ubuntu/Debian/RHEL). Desarrollo en
Windows/Linux (código ya cross-platform, todo path por `node:path`).

**Project Type**: Proyecto único (daemon backend + artefactos de despliegue). Sin frontend.

**Performance Goals**: Sin objetivos de throughput. Los ciclos corren cada 5 min y solo
consultan/escriben dentro de las ventanas de checkpoint. `registrarFichadas` reescribe el
JSON del período completo por ciclo; a la escala del proyecto (~1000 fichadas/mes, ~500
empleados, 2 marcaciones/día) es despreciable.

**Constraints**: Persistencia **atómica** (un lector nunca ve un archivo truncado);
deduplicación por `rawHex` estable entre ciclos y reinicios; **sin `rawHex` ni credenciales
en logs correlacionables** (Principio V); **sin conexión a Oracle en runtime** con snapshot
(Principio II); apagado limpio ante SIGTERM dejando terminar una consulta en curso.

**Scale/Scope**: ~500 empleados, dos ventanas de checkpoint por día, ~31 días/mes. El eje es
confiabilidad y trazabilidad, no volumen.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **RS956 Fichaje Constitution v1.2.0**.

- **I — Arquitectura Frontend basada en Componentes**: N/A. Feature de operación/persistencia
  sin UI. No introduce presentación; ninguna capa de UI habla con Oracle. **Sin violación**.
- **II — Repositorio de Datos Oracle Aislado**: el servicio en modo archivo/snapshot **no
  toca Oracle en runtime**. El único acceso a Oracle sigue siendo la lectura de solo lectura
  en `src/db/` que usa `sincronizar-padron` (feature 004), sin cambios. **Cumple**.
- **III — Protocolo RS956 Aislado (NON-NEGOTIABLE)**: la feature **no toca** el protocolo. El
  sink de persistencia consume fichadas **ya parseadas** (`parseFichadaRecord`); ningún byte
  de framing entra a la nueva lógica. **Cumple** por no intervención.
- **IV — Test-First en Capas Críticas**: la persistencia de fichadas impacta liquidación de
  haberes → capa crítica → test-first para el archivo/sink y el lector de padrón por archivo,
  con cobertura de integración end-to-end (servicio → archivo → `calcular`). **Cumple**.
- **V — Observabilidad y Protección de Datos Sensibles**: los ciclos se siguen logueando en
  NDJSON sin `rawHex` ni credenciales (el logger ya lo prohíbe como defensa). El `rawHex`
  vive **solo** en el archivo durable de fichadas (dato técnico de trazabilidad, no
  biométrico), igual que el exportador de sesiones de 001/002. **Cumple**.
- **VI — Persistencia por Niveles**: el archivo de fichadas por período y el snapshot del
  padrón son **estado operativo en archivos JSON locales**, detrás de la capa de
  adaptadores/puerto. El registro de liquidación en un esquema Oracle propio al cierre queda
  fuera de alcance. **Cumple**.
- **Flujo de Git**: desarrollo en la rama `005-servicio-despliegue-linux` (creada desde
  `main`). **Cumple**.

**Resultado del gate (pre-Fase 0)**: PASA. Sin violaciones; `Complexity Tracking` vacío.

**Reevaluación post-Fase 1 (diseño)**: PASA sin cambios. El diseño mantiene el protocolo y
Oracle intactos (II/III), concentra la capa crítica de persistencia bajo test-first (IV),
no filtra datos sensibles a logs (V) y persiste estado operativo en archivos locales (VI).
La inyección del sink por el composition root evita acoplar el scheduler (002) al dominio de
presentismo (004): sin dependencias nuevas que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/005-servicio-despliegue-linux/
├── plan.md              # Este archivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md        # Fase 1 (/speckit-plan)
├── quickstart.md        # Fase 1 (/speckit-plan)
├── contracts/           # Fase 1 (/speckit-plan)
│   ├── persistencia-fichadas.md   # sink de persistencia + archivo por período
│   ├── padron-archivo.md          # lector de padrón por archivo (legacy + snapshot 004)
│   └── systemd-deployment.md      # unit del servicio + timer de reinicio diario + guía
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya existente)
└── tasks.md             # Fase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── roster/
│   ├── legajo.js                              # NUEVO: interpretarLegajo compartido (entero ≥ 1)
│   ├── local-file-active-employees-provider.js# AMPLIAR: acepta {legajosActivos} y {empleados} (snapshot 004)
│   └── oracle-active-employees-provider.js    # AJUSTE: usa legajo.js compartido (sin duplicar la regla)
├── scheduling/
│   └── scheduler.js                           # AMPLIAR: sink opcional persistirFichadas(fichadas) tras ciclo success
├── service/
│   └── consulta-programada-service.js         # AMPLIAR: pasa persistirFichadas al scheduler
├── cli/
│   └── consulta-programada.js                 # AMPLIAR: arma el sink (composition root) y lo cablea; nueva var de archivo
└── presentismo/
    └── adapters/
        └── file-fichadas-archive.js           # AMPLIAR: escritura atómica temp+rename; saltar escritura si no hay altas

deploy/                                        # NUEVO (artefactos de despliegue)
├── rs956-fichadas.service                     # unit systemd del servicio
├── rs956-fichadas-restart.service             # oneshot: systemctl restart del servicio
└── rs956-fichadas-restart.timer               # timer diario ~06:00 (rollover)

docs/
└── despliegue-linux.md                        # NUEVO: guía de despliegue reproducible

tests/
├── unit/
│   ├── local-file-active-employees-provider.test.js  # AMPLIAR: esquema snapshot, dedup, vacío→error
│   └── presentismo-fichadas-archive.test.js          # AMPLIAR: escritura atómica / saltar sin altas
└── integration/
    └── consulta-programada-service.integration.test.js  # AMPLIAR: persistencia + round-trip a calcular

package.json                                   # AJUSTE: engines.node ">=20.12"
```

**Structure Decision**: Proyecto único. La feature toca tres áreas existentes —`src/roster/`
(padrón por archivo), `src/scheduling`/`src/service`/`src/cli` (servicio 002) y
`src/presentismo/adapters` (archivo de fichadas 004)— con cambios pequeños y aditivos, más un
subárbol nuevo `deploy/` para los artefactos de systemd y una guía en `docs/`. El acoplamiento
002↔004 (persistencia) se confina al composition root (`src/cli/consulta-programada.js`), que
arma el sink; el scheduler permanece agnóstico (recibe una función). Tests siguen la
convención existente (`node:test`, unit/integration).

## Complexity Tracking

> Sin violaciones de la Constitución. Sección vacía intencionalmente.
