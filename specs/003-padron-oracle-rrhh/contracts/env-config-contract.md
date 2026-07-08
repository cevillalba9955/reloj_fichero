# Contrato: configuración por variables de entorno del padrón Oracle

**Motivo**: FR-004/FR-005 de [spec.md](../spec.md) y Constitución
Principio II (credenciales solo por entorno o gestor de secretos).
Archivo: `src/db/oracle-roster-config.js`.

## Interfaz

```text
readOracleRosterConfig(env) -> OracleRosterConfig    // lanza ConfiguracionPadronInvalidaError
```

`env` es inyectable (default `process.env`) para testear sin tocar el
entorno real.

## Variables

| Variable | Requerida | Default | Validación |
|---|---|---|---|
| `RRHH_ORACLE_USER` | Sí | — | no vacía |
| `RRHH_ORACLE_PASSWORD` | Sí | — | no vacía |
| `RRHH_ORACLE_CONNECT_STRING` | Sí | — | no vacía (forma sugerida `host:puerto/servicio`) |
| `RRHH_ORACLE_VISTA_PADRON` | Sí | — | identificador SQL: `^[A-Za-z][A-Za-z0-9_$#]*(\.[A-Za-z][A-Za-z0-9_$#]*)?$` |
| `RRHH_ORACLE_COLUMNA_LEGAJO` | No | `LEGAJO` | identificador SQL (sin `.`) |
| `RRHH_ORACLE_TIMEOUT_MS` | No | `10000` | entero > 0 |

## Comportamiento obligatorio

- **Fail-fast** (FR-005): el CLI llama `readOracleRosterConfig` ANTES de
  `startService()` cuando `--padron oracle`; una config inválida aborta el
  arranque con exit code distinto de 0.
- El mensaje de `ConfiguracionPadronInvalidaError` enumera **los nombres**
  de todas las variables faltantes/inválidas de una vez (no de a una), y
  **nunca** incluye el valor de ninguna variable (FR-005, SC-006).
- Las credenciales no viajan por argv (FR-004): el único flag CLI nuevo es
  `--padron archivo|oracle` (ver research.md §9).
- El objeto `OracleRosterConfig` retornado no debe serializarse a logs ni
  a `getState()`.

## Tests exigidos (antes de implementar)

1. Config completa → objeto con defaults aplicados (`columnaLegajo`,
   `timeoutMs`).
2. Faltan N variables requeridas → un solo error que nombra las N.
3. `RRHH_ORACLE_VISTA_PADRON` con caracteres fuera del patrón (espacios,
   `;`, comillas) → error.
4. `RRHH_ORACLE_TIMEOUT_MS` no numérico o ≤ 0 → error.
5. Ningún mensaje de error contiene el valor de `RRHH_ORACLE_PASSWORD`
   (assertion explícita).
