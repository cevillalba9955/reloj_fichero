# Data Model — IU: Calendario Mensual (feature 007)

Esta feature **no crea entidades de dominio nuevas**: reutiliza el `Calendario del mes` y el
`Período de liquidación` de la feature 004. Define **proyecciones de presentación**
(view-models) que el backend arma a partir del dominio y entrega al frontend, y una **consulta
de solo lectura** nueva en el repositorio. Todo lo aquí descrito es derivado y no introduce
almacenamiento adicional.

## Entidades de dominio reutilizadas (feature 004)

- **Calendario del mes** (`src/presentismo/domain/calendario-mes.js`):
  `{ periodo: 'YYYYMM', esquemaSemanal: number[], dias: DiaCalendario[] }`.
- **DiaCalendario**: `{ fecha: 'YYYY-MM-DD', dd: number, clasificacion: Clasificacion,
  reclasificadoManual: boolean }`.
- **Clasificacion**: `'Laborable' | 'No Laborable' | 'Feriado'`.
- **Período de liquidación** (derivado, `periodo-liquidacion.js`):
  `recortar(calendario, tramo)` con `tramo ∈ { 'Mes', 'Q1', 'Q2' }`.

## Proyecciones de presentación (view-models)

### VistaCalendarioMes

Lo que la pantalla necesita para renderizar un mes. Lo arma `src/web/view-model.js`.

| Campo | Tipo | Origen / regla |
|-------|------|----------------|
| `periodo` | `'YYYYMM'` | del calendario |
| `anio`, `mes` | `number` | `parsePeriodo(periodo)` |
| `esUltimoGenerado` | `boolean` | `periodo === max(listarPeriodos())` |
| `hoy` | `'YYYY-MM-DD' \| null` | fecha actual del servidor **solo si** cae en este mes; si no, `null` (FR-007) |
| `periodoActivo` | `PeriodoActivoVM \| null` | ver abajo (FR-008/010) |
| `dias` | `DiaVM[]` | uno por día del mes, en orden |
| `leyenda` | `LeyendaItem[]` | claves visuales y su significado (FR-006) |

**Reglas de validación / invariantes**:
- `dias.length` = cantidad real de días del mes (28–31), en orden ascendente por `dd`
  (SC-007).
- Ningún campo expone datos personales, legajos ni fichadas (FR-014).

### DiaVM

| Campo | Tipo | Origen / regla |
|-------|------|----------------|
| `fecha` | `'YYYY-MM-DD'` | del día |
| `dd` | `number` | número de día |
| `diaSemana` | `0..6` | 0=domingo … 6=sábado (UTC, igual que el dominio) para ubicar en la grilla |
| `clasificacion` | `Clasificacion` | del día |
| `reclasificadoManual` | `boolean` | del día (permite distinguir en el detalle, opcional para la UI) |
| `esHoy` | `boolean` | `fecha === vista.hoy` |
| `enPeriodoActivo` | `boolean` | `true` si `fecha` está en `recortar(calendario, tramoActivo)` (FR-009) |
| `resaltado` | `'habil' \| 'no-laborable' \| 'feriado'` | mapeo directo de la clasificación para el estilo (hábiles y feriados resaltados, FR-005) |

### PeriodoActivoVM

Derivado del último mes generado (research §4). `null` si no hay período activo definido
(FR-010) — en esta feature solo será `null` si no hay calendario.

| Campo | Tipo | Origen / regla |
|-------|------|----------------|
| `etiqueta` | `string` | p. ej. `"Julio 2026"` o `"202607"` |
| `tramo` | `'Mes' \| 'Q1' \| 'Q2'` | por defecto `'Mes'` (institucional, research §4) |
| `desde` | `'YYYY-MM-DD'` | primer día del tramo |
| `hasta` | `'YYYY-MM-DD'` | último día del tramo |

### LeyendaItem

`{ clave: string, etiqueta: string, descripcion: string }` — una por distinción visual
(hábil, no laborable, feriado, hoy, período activo). Alimenta el componente `Leyenda`
(FR-006) y garantiza que cada clave tenga significado textual (FR-004).

### ListaCalendariosVM

Respuesta de "qué meses hay". `{ periodos: 'YYYYMM'[], ultimo: 'YYYYMM' | null }`.
`ultimo = null` cuando no hay ningún calendario generado (estado vacío global, FR-011).

## Consulta nueva en el repositorio (capa de datos)

Se agrega al puerto `PresentismoRepository` y a su adaptador de archivos:

- **`listarPeriodos(): Promise<string[]>`** — devuelve los `YYYYMM` con calendario
  persistido, ordenados ascendentemente. Implementación (adaptador de archivos): listar
  `repoDir`, tomar archivos que matcheen `^\d{6}\.json$` y cuyo contenido tenga `calendario`
  no nulo, devolver sus `YYYYMM` ordenados. Sin acceso a Oracle (Principios II/VI).

Ningún otro método del repositorio cambia. `cargarCalendario(periodo)` y
`guardarCalendario(cal)` ya existen y se reutilizan tal cual.

## Transiciones de estado (reclasificación)

La única mutación de esta feature es la reclasificación de un día, ya modelada por el
dominio (`reclasificarDia`, inmutable, marca `reclasificadoManual: true`). Flujo:

```
DiaVM(clasificacion = X)
      │  usuario elige nueva clasificación Y (Y ≠ X)  →  estado UI: "pendiente de confirmar"
      │
      ├─ cancelar  ─────────────►  sin cambios (día sigue en X)                 (FR-016)
      │
      └─ confirmar ─► POST /api/.../reclasificar ─► service.reclasificarDia
                         └─ persiste calendario (Y, reclasificadoManual=true)   (FR-017)
                         └─ evento estructurado `dia_reclasificado`             (FR-019, Ppio V)
                         └─ respuesta: VistaCalendarioMes actualizada ─► UI refleja Y
```

Invariantes:
- Sin confirmación no hay `POST` ni persistencia (FR-016).
- `Y ∈ { Laborable, No Laborable, Feriado }` (validado por el dominio; el handler rechaza
  otros valores con 400).
- La `fecha` debe pertenecer al `periodo` (validado por el dominio; handler → 400/404).
- No disponible sobre un mes sin calendario (FR-018): el handler responde 404/409 y la UI no
  ofrece la acción en estado vacío.
