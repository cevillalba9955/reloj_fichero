# Contrato de CLI: `consultar-fichadas`

## Invocación

```text
node src/cli/consultar-fichadas.js --host <ip> [--port <número>] [--output-dir <ruta>] [--log-dir <ruta>] [--timeout-ms <número>]
```

## Flags

| Flag | Obligatorio | Default | Descripción |
|---|---|---|---|
| `--host` | Sí | — | IP del reloj RS596 en la red local (FR-001) |
| `--port` | No | `5005` | Puerto TCP del reloj (research.md, valor fijo documentado) |
| `--output-dir` | No | `./output` | Directorio donde se escribe el JSON de fichadas (FR-006) |
| `--log-dir` | No | `./logs` | Directorio donde se escribe el log NDJSON de la sesión (FR-012) |
| `--timeout-ms` | No | `5000` | Tiempo máximo de espera por respuesta antes de considerar la conexión anómala (FR-011) |

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
