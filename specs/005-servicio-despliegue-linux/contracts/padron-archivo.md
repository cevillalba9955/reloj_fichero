# Contract: Lector de padrón por archivo (legacy + snapshot 004)

**Feature**: 005 | Implementa: `ActiveEmployeesProvider` (contrato feature 002/003).

## Interfaz (sin cambios)

```
getActiveEmployees() => Promise<Array<{ legajo: number, activo: true }>>
```

## Entradas aceptadas

El archivo apuntado por `FICHADAS_ROSTER_CONFIG` (`--roster-config`) puede tener **cualquiera**
de estos dos esquemas:

1. **Legacy (feature 002)**
   ```json
   { "legajosActivos": [1, 2, 3] }
   ```
2. **Snapshot (feature 004)** — `data/presentismo/padron.json`
   ```json
   { "generadoEn": "…", "vista": "…", "empleados": [ { "legajo": 9, "categoria": "PROD", "nombre": "…" } ] }
   ```

## Reglas

- **Detección por forma**: `legajosActivos` (array) tiene prioridad; si no, `empleados` (array)
  → se mapea `empleados[].legajo`.
- **Normalización** (regla única `interpretarLegajo`, compartida con el provider Oracle):
  entero ≥ 1; string solo-dígitos; se **descartan** inválidos y se **deduplican** repetidos.
- **Salida**: `[{ legajo, activo: true }]`, ordenada de forma estable por aparición tras dedup.

## Errores (`RosterNoDisponibleError`)

Se rechaza (padrón no disponible, FR-015) cuando:
- el archivo no existe o no se puede leer;
- el contenido no es JSON válido;
- no contiene `legajosActivos` ni `empleados` como array;
- tras normalizar no queda ningún legajo válido (incluye el archivo con lista vacía).

El servicio registra el ciclo afectado como `error` y sigue; **nunca asume un padrón vacío**
(no cierra checkpoints por completitud ficticia).

## Configuración típica (modo snapshot 004)

```
FICHADAS_PADRON=archivo
FICHADAS_ROSTER_CONFIG=./data/presentismo/padron.json
```

Sin conexión a Oracle en runtime (FR-014). El snapshot lo genera/refresca
`sincronizar-padron` (feature 004) por fuera del servicio.

## Compatibilidad

- El esquema legacy sigue funcionando idéntico (tests existentes deben pasar sin cambios de
  expectativa, salvo los que documentan las reglas nuevas de normalización/vacío).
- No cambia `createRosterProvider`: sigue eligiendo archivo vs. oracle por `--padron`.
