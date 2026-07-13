# Contract: CLI de Cálculo de Presentismo

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Comando `src/cli/calcular-presentismo.js`, ejecutable como el resto del proyecto
(`node src/cli/calcular-presentismo.js ...`, ESM, Node 20+). Precedencia de configuración
como en la feature 002: **argumento CLI > variable de entorno > default**.

## Subcomandos

### `generar-calendario --periodo YYYYMM`
Genera (o regenera sin pisar reclasificaciones) el calendario del mes.
- Salida: resumen de días por clasificación. Exit 0 en éxito.

### `reclasificar --periodo YYYYMM --fecha YYYY-MM-DD --clasificacion <Laborable|NoLaborable|Feriado> --autor <id>`
Reclasifica un día y recalcula lo afectado.
- Error si la fecha no pertenece al mes o la clasificación es inválida.

### `calcular --periodo YYYYMM [--legajo N] [--formato json|tabla]`
Calcula el presentismo de un empleado (`--legajo`) o de toda la plantilla activa (sin
`--legajo`). Para modalidad quincenal emite dos resúmenes (Q1, Q2).
- Salida `json` (default): array de `ResumenPresentismo` (ver data-model.md).
- Salida `tabla`: resumen legible por consola.
- Empleado con categoría no configurada: aparece en la salida con `anomalias` y sin
  cálculo automático (FR-035); exit 0 (no es error del comando), pero se reporta.
- Sin `--legajo` (plantilla completa): toma la lista de legajos activos del padrón
  (snapshot local por defecto, u Oracle con `--padron oracle`). Requiere el padrón
  disponible; si no lo está es error (exit 1). Con `--legajo`, el padrón es best-effort
  (si no está, el empleado queda sin categoría → anomalía).

### `listar-padron [--formato tabla|json] [--padron archivo|oracle]`
Lista los legajos activos del padrón con su categoría, cruzando con `categorias.json`
para indicar la modalidad resuelta o marcar la categoría como no configurada (FR-035).
Fuente según `--padron` (default `archivo`: snapshot local, sin DB).
- Salida `tabla` (default): una línea por legajo (nombre incluido si está disponible) +
  aviso de cuántos quedan sin configurar.
- Salida `json`: array de `{ legajo, nombre, categoria, modalidad, configurada }`.
- Nunca imprime credenciales ni connect string (Principio V).

### `sincronizar-padron [--padron-file PATH]`
Consulta el padrón Oracle (solo lectura) **una vez** y lo guarda como snapshot JSON
local (Principio VI), para que los demás comandos operen sin conexión a la DB. Es el
único comando que exige Oracle configurado (`RRHH_ORACLE_*`, incluida
`RRHH_ORACLE_COLUMNA_CATEGORIA`). No sobrescribe el snapshot si el padrón devuelve 0
legajos. El snapshot contiene solo `{ legajo, categoria, nombre? }` (Principio V): el
nombre es dato personal para la IU, nunca datos biométricos ni credenciales.

### Fuente del padrón
`--padron archivo|oracle` (o `PRESENTISMO_PADRON`, default `archivo`) elige de dónde
sale el padrón en `calcular` (plantilla) y `listar-padron`. `archivo` lee el snapshot
(`--padron-file` / `PRESENTISMO_PADRON_FILE`, default `<repo-dir>/padron.json`) sin tocar
la DB; `oracle` consulta en vivo.

### `correccion --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--horas HH:MM | --revertir) --autor <id> --motivo "<texto>"`
Alta o reversión de corrección manual. `--motivo` obligatorio en el alta (FR-027); su
ausencia es error de uso.

### `pausa --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--desde HH:MM --hasta HH:MM | --revertir <id>) --autor <id> --motivo "<texto>"`
Alta o reversión de pausa intermedia. `--motivo` obligatorio en el alta (FR-040).
`--desde < --hasta`. Alta sobre día sin horas efectivas: se acepta pero se informa que no
descuenta (FR-039).

## Configuración (entorno)

Reutiliza las variables de la feature 003 para el acceso al padrón/categoría, más:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PRESENTISMO_CATEGORIAS_CONFIG` | Ruta de `categorias.json` | `./config/categorias.json` |
| `PRESENTISMO_REPO_DIR` | Directorio del estado persistido (JSON) | `./data/presentismo` |
| `PRESENTISMO_LOG_DIR` | Directorio de logs NDJSON | `./logs` |
| `RRHH_ORACLE_COLUMNA_CATEGORIA` | Columna de categoría en la vista del padrón | (definir en despliegue) |
| `RRHH_ORACLE_COLUMNA_NOMBRE` | Columna del nombre del empleado (opcional, para la IU) | (sin nombre) |
| `PRESENTISMO_PADRON` | Fuente del padrón: `archivo` \| `oracle` | `archivo` |
| `PRESENTISMO_PADRON_FILE` | Ruta del snapshot local del padrón | `<repo-dir>/padron.json` |

Las credenciales Oracle viajan solo por entorno (Principio II), nunca por argv.

## Códigos de salida

- `0`: operación exitosa (incluye cálculo con anomalías por empleado reportadas).
- `1`: error de uso (argumentos inválidos, motivo faltante) o de configuración (config
  ausente/ inconsistente, fuente Oracle inaccesible).

## Garantías

- El cálculo es determinista (FR-023): misma entrada ⇒ misma salida.
- Ningún dato biométrico ni credencial aparece en stdout/stderr ni en logs (Principio V).
