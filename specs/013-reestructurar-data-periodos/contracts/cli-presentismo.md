# Contract: Adiciones al CLI de Cálculo de Presentismo

**Feature**: 013-reestructurar-data-periodos | **Date**: 2026-07-20

Extiende `specs/004-dominio-presentismo/contracts/cli-presentismo.md`
(`src/cli/calcular-presentismo.js`). Los subcomandos existentes no cambian su forma
de uso, solo la ruta de archivo que resuelven por debajo (ver
`contracts/storage-layout.md`).

## Subcomandos nuevos

### `cerrar-periodo --periodo YYYYMM --autor <id>`
Marca el calendario del período como cerrado (de solo lectura). Idempotente: si ya
estaba cerrado, actualiza el autor/fecha del intento y no falla.
- Error si el período no tiene calendario generado todavía.
- Salida: confirmación con período, autor y fecha/hora.

### `reabrir-periodo --periodo YYYYMM --autor <id>`
Revierte el cierre de un período. Idempotente: si ya estaba abierto, actualiza el
autor/fecha del intento y no falla.
- Error si el período no tiene calendario generado todavía.
- Salida: confirmación con período, autor y fecha/hora.

## Cambios de comportamiento en subcomandos existentes

- `generar-calendario --periodo YYYYMM`: además de generar el calendario, ahora
  también crea `P<periodo>/padron.json` si no existe todavía (FR-003), a partir de
  la fuente de padrón resuelta (`--padron archivo|oracle`, mismo flag que ya existe
  para `calcular`/`listar-padron`).
- `reclasificar`, `calcular` (con `--legajo`), `correccion`, `pausa`:
  rechazan la operación con un error claro si el período está cerrado (FR-006). El
  cálculo de solo lectura (`calcular` de la plantilla completa, `listar-padron`)
  sigue funcionando igual sobre un período cerrado (FR-007).
- `importar-fichadas --periodo YYYYMM`: rechaza incorporar fichadas si el período
  está cerrado (FR-006), en vez de escribirlas silenciosamente.
- `sincronizar-padron`: dejó de aceptar `--padron-file` (ver
  `contracts/storage-layout.md`, configuración retirada); siempre escribe en
  `P<mesActualPeriodo()>/padron.json` bajo `--repo-dir`/`PRESENTISMO_REPO_DIR`
  (FR-004), calculando el mes en curso con el reloj real al momento de ejecutar el
  comando.

## Flags retirados

- `--padron-file` (usado por `sincronizar-padron`, `calcular`, `listar-padron`):
  eliminado, ver `contracts/storage-layout.md`.
- `--fichadas-archive-dir` (usado por `calcular`, `importar-fichadas`): eliminado,
  ver `contracts/storage-layout.md`.

## Errores

- `cerrar-periodo`/`reabrir-periodo` sobre un período sin calendario generado →
  exit 1, mensaje indicando que hay que generar el calendario primero.
- Cualquier subcomando de escritura sobre un período cerrado → exit 1, mensaje
  indicando que el período `YYYYMM` está cerrado y desde cuándo.
