# Contract: Parámetros editables de `.env`

**Feature**: 014-pagina-config | **Date**: 2026-07-22

Módulo `src/config/env-file.js`. Lee el `.env` real del proyecto (mismo archivo
que carga `--env-file-if-exists=.env` en los scripts de `package.json`),
preserva todo lo que no gestiona esta feature (comentarios, `RRHH_ORACLE_*`,
rutas de directorios/config — FR-014 y Assumptions del spec), y solo
reemplaza o agrega las claves de la siguiente tabla.

## Claves gestionadas

| Clave | Tipo | Default si falta | Validación al guardar |
|---|---|---|---|
| `FICHADAS_HOST` | string | *(ninguno; requerido)* | no vacío |
| `FICHADAS_PORT` | int | `5005` | entero, `1 <= x <= 65535` |
| `FICHADAS_TIMEOUT_MS` | int | `5000` | entero `> 0` |
| `FICHADAS_TICK_INTERVAL_MS` | int | `300000` | entero `> 0` |
| `FICHADAS_STATUS_INTERVAL_MS` | int | `60000` | entero `> 0` |
| `FICHADAS_ENTRADA_HORA` | `HH:MM` | `07:00` | `parseHoraMinuto` válido |
| `FICHADAS_ENTRADA_DURACION` | int (min) | `30` | entero `>= 0` |
| `FICHADAS_FULL_HANDSHAKE` | `"true"` \| `"false"` \| `"1"` \| `"0"` | `false` | se normaliza a `"true"`/`"false"` al escribir |
| `FICHADAS_CONTROL_PORT` | int \| ausente | *(ausente = deshabilitado)* | si se define, entero `1..65535`; se puede dejar en blanco/comentado para volver a deshabilitarlo |
| `PRESENTISMO_RESUMEN_PERIODO` | enum | `MENSUAL` | `MENSUAL` \| `QUINCENAL` |

Fuera de alcance de este módulo (nunca leídas ni escritas por esta feature):
`RRHH_ORACLE_*`, `PRESENTISMO_CATEGORIAS_CONFIG`, `PRESENTISMO_REPO_DIR`,
`PRESENTISMO_LOG_DIR`, `FICHADAS_LOG_DIR`, `FICHADAS_ROSTER_CONFIG`,
`FICHADAS_PADRON`.

## API del módulo

```js
leerParametrosEditables(rutaEnv) → { FICHADAS_HOST, FICHADAS_PORT, ... }
// valores ya parseados a su tipo (int/bool/string), con los defaults de la
// tabla aplicados si la clave no está presente en el archivo.

escribirParametrosEditables(rutaEnv, cambios) → void
// `cambios` es un objeto parcial (solo las claves que cambian). Valida cada
// clave presente según la tabla; si alguna es inválida, NO escribe nada
// (rechazo atómico, FR-004) y lanza con un mensaje que identifica el campo.
// Si todas son válidas, reescribe el archivo preservando el resto del
// contenido, con escritura atómica (tmp + rename) para no dejarlo a medio
// escribir ante un fallo de disco (edge case del spec, FR-015).
```

## Errores

- Archivo `.env` inexistente: se trata como archivo vacío al leer (todos los
  defaults aplican); al escribir, se crea.
- Clave inválida (fuera de rango, formato incorrecto): `escribirParametrosEditables`
  lanza un error que nombra la clave y la regla incumplida; el llamador
  (`configuracion-handlers.js`) lo traduce a `400` con el código de la tabla de
  `web-api-configuracion.md`.
- Fallo de escritura en disco (permisos, disco lleno): el archivo temporal no
  llega a reemplazar al original; se lanza el error del sistema de archivos tal
  cual, traducido a `500` por el handler.
