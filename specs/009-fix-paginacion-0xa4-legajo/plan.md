# Implementation Plan: Corrección de la paginación por bytes del 0xA4 y del ancho del legajo

**Branch**: `009-fix-paginacion-0xa4-legajo` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-fix-paginacion-0xa4-legajo/spec.md`

## Summary

El modelo de paginación del `0xA4` heredado de la feature 006 (tope de 51 **registros** por
página, con descuento de arrastre en la última) coincidía con el comportamiento real del
equipo solo hasta 3 páginas; un lote real de 173 fichadas (4 páginas) reveló que la
paginación real es por **bytes** (`min(bytesRestantes, 1024)` sobre un stream total de
`declaredPendingCount*20`). El plan reemplaza `MAX_RECORDS_PER_PAGE` por `MAX_PAGE_BYTES` y
elimina el cálculo de arrastre por registros, calibrado contra dos capturas nuevas del
software oficial (`research/fichada_2.pcapng`, `research/fichada_3.pcapng`, mismo lote con
`ID DISPOSITIVO` 99 y 255). En paralelo, corrige el ancho decodificado del campo `legajo` de
4 a los 2 bytes con evidencia real, tratando los bytes altos como chequeo de plausibilidad.
Ambos cambios quedan aislados en el driver del protocolo (`src/protocol/`), con las capturas
nuevas como fixtures de regresión.

## Technical Context

**Language/Version**: JavaScript ESM, Node.js ≥ 20.12 (`"type": "module"`)

**Primary Dependencies**: Ninguna nueva. Runtime: `node:net`, `node:buffer`. Test: runner
integrado `node --test` (sin dependencias de dev). Los `.pcapng` se preprocesan con `tshark`
(fuera del runtime) para extraer los bytes a un fixture versionado; el test no depende de
tshark.

**Storage**: N/A (feature de protocolo; no toca persistencia). Las capturas de tráfico se
versionan en el repo.

**Testing**: `node --test` — contrato (`tests/contract/`), integración (`tests/integration/`),
unit (`tests/unit/`). Test-First obligatorio en la capa de protocolo (Constitución IV).

**Target Platform**: Servicio Node en Linux (systemd, feature 005) y desarrollo en Windows.

**Project Type**: Single project (CLI + servicio backend + driver de protocolo aislado).

**Performance Goals**: N/A material. La descarga sigue acotada por el equipo (1024 bytes por
respuesta); el cambio no altera el perfil de rendimiento, solo el punto de corte de cada
página.

**Constraints**: Tope del equipo de 1024 bytes de contenido por página (no modificable, sin
confirmar si es el límite real o un valor seguro por debajo de él). El equipo responde
siempre `byteLen+4` bytes. Ground truth confirmado hasta 4 páginas (173 registros); 5+
páginas sin captura.

**Scale/Scope**: Lote real de referencia: 173 fichadas (4 páginas). Cambio localizado en 3
archivos de `src/protocol/` + tests + 1 fixture nuevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Frontend por componentes** — N/A (no toca UI). ✅
- **II. Repositorio Oracle aislado** — N/A (no toca Oracle ni SQL). ✅
- **III. Protocolo RS956 documentado y aislado (NON-NEGOTIABLE)** — ✅ **Núcleo de la feature.**
  El cambio vive íntegramente en `src/protocol/` (driver aislado); ningún detalle del
  protocolo se filtra a UI/negocio. Cada corrección (fórmula de paginación por bytes, ancho
  real del legajo) se documenta en `research/protocolo_prosoft_rs596.md` (§5.19/§5.20) con la
  evidencia de tráfico que la respalda. Las capturas `research/fichada_2.pcapng` y
  `research/fichada_3.pcapng` se conservan versionadas como fixtures (no se descartan). Un
  cambio de firmware exigiría re-validar — se deja explícito en assumptions.
- **IV. Test-First en protocolo (NON-NEGOTIABLE)** — ✅ Ciclo Red-Green-Refactor: se agregan
  primero los tests de contrato/integración a partir de la captura real (fixture de 173
  fichadas), se los ve fallar contra el modelo de paginación anterior, y recién se corrige
  la implementación.
- **V. Observabilidad y datos sensibles** — ✅ Se mantiene el logging estructurado por sesión
  ya existente (comando, byteLength, bloque de cierre por página); el mensaje de detalle pasa
  a incluir `byteLen`/`restantes` en vez de `pageCount`, sin exponer datos biométricos ni
  credenciales.
- **VI. Persistencia por niveles** — N/A (no toca persistencia). ✅

**Gate result: PASS.** Sin violaciones; no se requiere `Complexity Tracking`.

**Flujo de desarrollo aplicable**: la PR modifica el adaptador del protocolo → requiere
revisión de alguien familiarizado con el protocolo, y las nuevas capturas se agregan como
fixtures versionados junto con los tests que las ejercitan (Flujo de Desarrollo y Revisión).

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-paginacion-0xa4-legajo/
├── plan.md              # Este archivo
├── research.md          # Fase 0: causa raíz + evidencia de ambas capturas oficiales
├── data-model.md        # Fase 1: página, stream continuo, campo de legajo
├── quickstart.md        # Fase 1: cómo reproducir y validar ambas correcciones
├── contracts/
│   └── pagination-0xA4-bytes.md  # Contrato de comandos/respuestas 0xA4 por página (bytes)
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya generada)
└── tasks.md             # Fase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
src/protocol/
├── commands.js     # MAX_PAGE_BYTES (reemplaza MAX_RECORDS_PER_PAGE) (FR-001)
├── client.js       # queryPendingFichadas: paginación por bytes, sin arrastre por registros
│                   #   (FR-001/002/003/004/005)
├── records.js      # parseFichadaRecord: legajo de 2 bytes + chequeo de plausibilidad de los
│                   #   bytes altos (FR-006/007/008/009)
└── framing.js      # (sin cambios previstos)

tests/
├── contract/
│   ├── fixtures/ciento-setenta-y-tres-pendientes-paginado.json  # bytes reales (FR-010)
│   └── records.contract.test.js   # legajo con bytes altos != 0 -> null (FR-007/009, SC-004/005)
├── integration/
│   ├── query-pending-fichadas.integration.test.js  # 173 fichadas / 4 páginas (SC-001/002/003)
│   └── performance.integration.test.js             # mock actualizado a paginación por bytes
└── unit/
    └── json-exporter.test.js  # registro de referencia re-encuadrado (sin cambio de conducta)

research/
├── fichada_2.pcapng   # captura del software oficial, ID DISPOSITIVO=99 (fixture probatorio)
└── fichada_3.pcapng   # captura del software oficial, ID DISPOSITIVO=255 (fixture probatorio)
```

**Structure Decision**: Single project. El cambio se concentra en el driver aislado
`src/protocol/` (Principio III), igual que la feature 006. Se agrega un fixture de contrato
derivado de las capturas nuevas en `tests/contract/fixtures/` para que los tests corran sin
tshark ni red, conservando los `.pcapng` originales en `research/` como evidencia.

## Complexity Tracking

> No aplica: el Constitution Check pasó sin violaciones.
