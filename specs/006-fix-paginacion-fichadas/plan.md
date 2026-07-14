# Implementation Plan: Corrección de la paginación del detalle de fichadas (0xA4)

**Branch**: `006-fix-paginacion-fichadas` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-fix-paginacion-fichadas/spec.md`

## Summary

Los comandos de continuación `0xA4` que arma el driver del reloj RS956 envían un `byteLen`
distinto al del software oficial, lo que desalinea 4 bytes todos los registros a partir de la
3ª página (>102 fichadas). El plan alinea `byteLen` a la fórmula oficial verificada contra
`research/fichada.pcapng` (`pageCount*20+4` con más páginas, `pageCount*20-8` en la última),
corrige el arrastre entre continuaciones (8 bytes) y reemplaza el troceo posicional por un
**encuadre auto-sincronizante por invariante estructural** (`recordType=00000001` + fecha/hora
válida) con **deduplicación** por `(legajo,fecha,hora,método)`. Todo queda aislado en el driver
del protocolo (`src/protocol/`), con la captura del software oficial como fixture de regresión.

## Technical Context

**Language/Version**: JavaScript ESM, Node.js ≥ 20.12 (`"type": "module"`)

**Primary Dependencies**: Ninguna nueva. Runtime: `node:net`, `node:buffer`. Test: runner
integrado `node --test` (sin dependencias de dev). El `.pcapng` se preprocesa con `tshark`
(fuera del runtime) para extraer los bytes a un fixture versionado; el test no depende de tshark.

**Storage**: N/A (feature de protocolo; no toca persistencia). El fixture de tráfico se versiona
en el repo.

**Testing**: `node --test` — contrato (`tests/contract/`), integración (`tests/integration/`),
unit (`tests/unit/`). Test-First obligatorio en la capa de protocolo (Constitución IV).

**Target Platform**: Servicio Node en Linux (systemd, feature 005) y desarrollo en Windows.

**Project Type**: Single project (CLI + servicio backend + driver de protocolo aislado).

**Performance Goals**: N/A material. La descarga está acotada por el equipo (tandas de 51,
`byteLen+4` por respuesta); el cambio no altera el perfil de rendimiento.

**Constraints**: Tope del equipo de 51 registros por página (no modificable). El equipo
responde siempre `byteLen+4` bytes. Ground truth confirmado solo hasta 3 páginas (123 registros);
4+ páginas sin captura → se cubre con el encuadre auto-sincronizante.

**Scale/Scope**: Lotes reales observados hasta 123 fichadas. Cambio localizado en 2-3 archivos
de `src/protocol/` + tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Frontend por componentes** — N/A (no toca UI). ✅
- **II. Repositorio Oracle aislado** — N/A (no toca Oracle ni SQL). ✅
- **III. Protocolo RS956 documentado y aislado (NON-NEGOTIABLE)** — ✅ **Núcleo de la feature.**
  El cambio vive íntegramente en `src/protocol/` (driver aislado); ningún detalle del protocolo
  se filtra a UI/negocio. Cada corrección (fórmula de `byteLen`, arrastre, invariante de encuadre)
  se documenta en `research.md` con la evidencia de tráfico que la respalda. La captura
  `research/fichada.pcapng` se conserva versionada como fixture (no se descarta). Un cambio de
  firmware exigiría re-validar — se deja explícito en assumptions.
- **IV. Test-First en protocolo (NON-NEGOTIABLE)** — ✅ Ciclo Red-Green-Refactor: se escriben
  primero los tests de contrato/integración a partir de la captura real y de flujos sintéticos,
  se los ve fallar contra el código actual, y recién se implementa. Fixture = tráfico real.
- **V. Observabilidad y datos sensibles** — ✅ Se mantiene el logging estructurado por sesión ya
  existente (comando, byteLength, bloque de cierre por página). No se loguean datos biométricos
  crudos ni credenciales. Se agrega traza de la discrepancia `declaredPendingCount` vs. únicos
  (FR-009) sin exponer datos sensibles.
- **VI. Persistencia por niveles** — N/A (no toca persistencia). ✅

**Gate result: PASS.** Sin violaciones; no se requiere `Complexity Tracking`.

**Flujo de desarrollo aplicable**: la PR modifica el adaptador del protocolo → requiere revisión
de alguien familiarizado con el protocolo, y la nueva captura se agrega como fixture versionado
junto con los tests que la ejercitan (Flujo de Desarrollo y Revisión).

## Project Structure

### Documentation (this feature)

```text
specs/006-fix-paginacion-fichadas/
├── plan.md              # Este archivo
├── research.md          # Fase 0: causa raíz + evidencia de la captura oficial
├── data-model.md        # Fase 1: registro, página, sesión, fixture
├── quickstart.md        # Fase 1: cómo reproducir y validar el fix
├── contracts/
│   └── pagination-0xA4.md  # Contrato de comandos/respuestas 0xA4 por página
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (ya generada)
└── tasks.md             # Fase 2 (/speckit-tasks — no lo crea este comando)
```

### Source Code (repository root)

```text
src/protocol/
├── commands.js     # buildPendingDetailContinuationCommand + fórmula de byteLen (FR-001/002)
├── client.js       # queryPendingFichadas: byteLen correcto, arrastre 8B, lectura byteLen+4,
│                   #   discrepancia declarada vs. únicos (FR-003/004/009)
├── records.js      # parseFichadaRecord + nuevo encuadre auto-sincronizante y dedup (FR-005/006/007/010)
└── framing.js      # (sin cambios previstos)

tests/
├── contract/
│   └── pagination-0xA4.contract.test.js   # byteLen por página == oficial (FR-001/002, SC-003)
├── integration/
│   └── paginacion-3-paginas.integration.test.js  # replay de fichada.pcapng: 122 únicos OK (SC-001/002)
└── unit/
    └── encuadre-sincronizante.test.js     # flujo sintético 4+ páginas con solape (FR-006/007, SC-005)

tests/fixtures/
└── fichada-3paginas/   # bytes extraídos de research/fichada.pcapng (comandos + respuestas)
    ├── stream10.json   # secuencia request/response del stream TCP del software oficial
    └── README.md       # cómo se generó desde el .pcapng (tshark), para reproducibilidad

research/
└── fichada.pcapng      # captura del software oficial (fixture probatorio, ya versionado)
```

**Structure Decision**: Single project. El cambio se concentra en el driver aislado
`src/protocol/` (Principio III). Se agrega un fixture de tráfico derivado del `.pcapng` en
`tests/fixtures/` para que los tests corran sin tshark ni red, conservando el `.pcapng` original
en `research/` como evidencia. Los tests siguen la partición existente contract/integration/unit.

## Complexity Tracking

> No aplica: el Constitution Check pasó sin violaciones.
