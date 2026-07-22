# Contrato: `config/vacaciones.json`

Mismo estilo que `config/motivos-ausencia.json` (feature 012) y
`config/categorias.json`: archivo JSON externo, editable sin cambios de
código, validado **fail-fast** al arranque por `src/presentismo/config/
vacaciones-config.js`. Un archivo ausente, corrupto o que no pasa la
validación bloquea el incremento automático y la carga de nuevas
asignaciones de vacaciones (no bloquea el resto del sistema, mismo criterio
que un catálogo de motivos inválido en 012/014).

## Forma

```json
{
  "incrementoAnual": { "mes": 11, "dia": 1 },
  "escalaAntiguedad": [
    { "aniosMinimos": 0, "dias": 14 },
    { "aniosMinimos": 5, "dias": 21 },
    { "aniosMinimos": 10, "dias": 28 },
    { "aniosMinimos": 20, "dias": 35 }
  ]
}
```

## Validación (`parseVacacionesConfig`)

- `incrementoAnual` obligatorio, objeto con:
  - `mes`: entero `1..12`.
  - `dia`: entero válido para ese mes (1..28/29/30/31 según corresponda,
    sin asumir año bisiesto — el día 29/30/31 se re-evalúa cada año contra
    el mes real, igual que cualquier fecha recurrente sin año).
- `escalaAntiguedad` obligatorio, array no vacío de tramos `{ aniosMinimos,
  dias }`:
  - `aniosMinimos`: entero ≥ 0.
  - `dias`: entero > 0.
  - Ordenado estrictamente creciente por `aniosMinimos`.
  - El primer tramo DEBE tener `aniosMinimos: 0` (cubre cualquier legajo
    desde el ingreso; sin este tramo, un legajo con menos antigüedad que el
    primer tramo definido no tendría días asignables — se rechaza el
    archivo completo en vez de dejar ese hueco).

Cualquier violación → `fail('vacaciones-config: ...')`, mismo criterio de
mensaje que `motivos-ausencia-config.js`.

## API de configuración (mismo patrón que `motivos-ausencia-config.js`)

- `loadVacacionesConfig(path)` / `saveVacacionesConfig(path, config)` —
  lectura/escritura atómica (`.tmp-<pid>-<timestamp>` + rename).
- `serializarVacacionesConfig(config)` — vuelta a JSON plano.
- `editarIncrementoAnual(config, { mes, dia })` — re-valida con
  `parseVacacionesConfig` antes de aceptar el cambio (nunca persiste un
  incremento inválido).
- `editarEscalaAntiguedad(config, tramos)` — reemplaza la escala completa;
  re-valida igual que arriba.
- `diasPorAntiguedad(config, aniosAntiguedad)` — función de dominio pura
  (vive en `src/presentismo/domain/vacaciones.js`, no en el módulo de
  config): devuelve `dias` del último tramo con `aniosMinimos <=
  aniosAntiguedad`.

## Archivo de ejemplo

`config/vacaciones.example.json` — versionado junto al código, mismo
contenido que el valor inicial de arriba (escala LCT Argentina), para que un
entorno nuevo tenga una plantilla de referencia (mismo criterio que
`config/motivos-ausencia.example.json`).
