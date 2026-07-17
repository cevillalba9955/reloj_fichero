# Contrato de CLI: `consultar-fichadas`

## Invocación

```text
node src/cli/consultar-fichadas.js --host <ip> [--port <número>] [--output-dir <ruta>] [--log-dir <ruta>] [--timeout-ms <número>]
```

Precedencia de configuración: argumento CLI explícito > variable de entorno
`FICHADAS_*` > default. `npm start` carga automáticamente un `.env` en la raíz
del proyecto (`--env-file-if-exists=.env`), así que cualquier flag se puede
fijar de una vez ahí en vez de pasarlo en cada invocación — mismo mecanismo
que usa `consulta-programada` (feature 002).

## Flags

| Flag | Variable de entorno | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `--host` | `FICHADAS_HOST` | Sí (por uno de los dos) | — | IP del reloj RS596 en la red local (FR-001) |
| `--port` | `FICHADAS_PORT` | No | `5005` | Puerto TCP del reloj (research.md, valor fijo documentado) |
| `--output-dir` | `FICHADAS_OUTPUT_DIR` | No | `./output` | Directorio donde se escribe el JSON de fichadas (FR-006) |
| `--log-dir` | `FICHADAS_LOG_DIR` | No | `./logs` | Directorio donde se escribe el log NDJSON de la sesión (FR-012) |
| `--timeout-ms` | `FICHADAS_TIMEOUT_MS` | No | `5000` | Tiempo máximo de espera por respuesta antes de considerar la conexión anómala (FR-011) |
| `--full-handshake` | `FICHADAS_FULL_HANDSHAKE` | No | `false` (desactivado) | Envía la secuencia completa de apertura (`0x13` parámetros + identificación + parámetros) antes de `0xB4`/`0xA4`, en vez de la secuencia reducida (solo `0x80`) que usa el script por defecto. Ver FR-002 y `research/protocolo_prosoft_rs596.md` §6.6: los `0x13` dejaron de ser necesarios en las pruebas contra el equipo actual, pero el flag queda disponible por si un reloj distinto (u otro firmware) sí los exige. La variable acepta `true`/`1` |

No existe flag de borrado (`--delete`) en esta versión: FR-007 excluye el
borrado automático del alcance de este script; se deja para una feature
separada y explícita.

## Códigos de salida

| Código | Significado |
|---|---|
| `0` | Éxito — incluye el caso de 0 fichadas pendientes (spec, Acceptance Scenario 2 de US1) |
| `1` | Error de conexión: host inalcanzable, timeout, conexión rechazada/reseteada, o sesión concurrente detectada (FR-009, FR-011) |
| `2` | Respuesta de protocolo inesperada: tamaño de payload inválido (FR-010) o discrepancia entre `0xB4` y `0xA4` (FR-014, comportamiento interino) |
| `3` | Argumentos de invocación inválidos (ej. falta `--host`) |

## Salida estándar (consola)

Resumen legible de una sesión exitosa, como mínimo:
- Host y puerto consultados
- Cantidad de fichadas pendientes declaradas (`0xB4`)
- Cantidad de registros exportados
- Ruta del archivo JSON generado
- Ruta del archivo de log generado

Ante error, un mensaje claro y distinguible de un resultado exitoso con 0
fichadas (FR-009), más la ruta del log para diagnóstico.
