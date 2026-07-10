# Dominio de Presentismo (feature 004)

Cálculo de horas trabajadas por período de liquidación a partir de las fichadas
(features 001/002) y el padrón de RRHH (feature 003). Diseño dominio puro +
puertos/adaptadores; ver [spec](../specs/004-dominio-presentismo/spec.md),
[plan](../specs/004-dominio-presentismo/plan.md) y
[data-model](../specs/004-dominio-presentismo/data-model.md).

## Conceptos

- **Calendario del mes** (`YYYYMM`): institucional y compartido. Cada día es
  `Laborable`, `No Laborable` o `Feriado`.
- **Período de liquidación**: recorte del calendario según la modalidad del
  empleado — mes completo (`Mensual`) o quincena `Q1` (1–15) / `Q2` (16–fin).
- **Categoría**: define la modalidad y sus parámetros de jornada. Se configura en
  este sistema; la asignación legajo→categoría se lee del padrón Oracle.
- **Jornada**: día × empleado. Entrada = primera fichada de la ventana de
  apertura; salida = última de la de cierre. Tolerancia lleva a la hora oficial
  sin generar horas extra. Feriado acredita la jornada esperada.
- **Corrección manual** y **Pausa intermedia**: ajustes auditables de un
  responsable (autor, motivo obligatorio, reversibles).

## Configuración

Copiar `config/categorias.example.json` → `config/categorias.json` y ajustar
modalidades y categorías (esquema en
[contracts/categorias-config.schema.md](../specs/004-dominio-presentismo/contracts/categorias-config.schema.md)).

Variables de entorno (`.env`, ver `.env.example`):

| Variable | Descripción | Default |
|----------|-------------|---------|
| `PRESENTISMO_CATEGORIAS_CONFIG` | Ruta de `categorias.json` | `./config/categorias.json` |
| `PRESENTISMO_REPO_DIR` | Estado persistido (JSON) | `./data/presentismo` |
| `PRESENTISMO_LOG_DIR` | Logs NDJSON | `./logs` |
| `RRHH_ORACLE_COLUMNA_CATEGORIA` | Columna de categoría en la vista del padrón | (definir en despliegue) |

El acceso a Oracle reutiliza las variables `RRHH_ORACLE_*` de la feature 003
(solo lectura, credenciales solo por entorno — Constitución, Principio II).

## CLI

```bash
npm run presentismo -- <subcomando> [opciones]
```

- `generar-calendario --periodo YYYYMM`
- `reclasificar --periodo YYYYMM --fecha YYYY-MM-DD --clasificacion <Laborable|NoLaborable|Feriado> --autor <id>`
- `calcular --periodo YYYYMM --legajo N [--formato json|tabla] [--detalle]`
- `correccion --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--horas HH:MM | --revertir) --autor <id> --motivo "<texto>"`
- `pausa --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--desde HH:MM --hasta HH:MM | --revertir <id>) --autor <id> --motivo "<texto>"`

Precedencia de configuración: argumento CLI > variable de entorno > default.

## Limitaciones conocidas

- **Fuente de fichadas en el CLI**: el motor consume el store en memoria de la
  feature 002. El comando `calcular` invocado de forma aislada no tiene acceso a
  ese store vivo; el cálculo con fichadas reales se obtiene integrando el
  servicio dentro del proceso de la feature 002 (o inyectando un
  `FichadasProvider` propio). El dominio y el servicio están cubiertos por tests.
- **Plantilla completa**: `calcular` sin `--legajo` requiere la lista de legajos
  activos; por ahora el CLI opera por `--legajo`. `calcularPlantilla` está
  disponible en la API del servicio.
- **Categoría por período**: se asume estable dentro del período (spec,
  Clarifications); un cambio intra-período se resuelve manualmente.

## Validación

`npm test` corre la suite completa (unitarios de dominio con fixtures de
calibración, contrato de puertos, integración por historia y rendimiento).
Guía end-to-end: [quickstart](../specs/004-dominio-presentismo/quickstart.md).
