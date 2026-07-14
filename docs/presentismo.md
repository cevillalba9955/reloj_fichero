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
- `calcular --periodo YYYYMM [--legajo N] [--formato json|tabla] [--detalle]` — sin `--legajo` calcula toda la plantilla activa del padrón Oracle.
- `listar-padron [--formato tabla|json]` — legajos activos del padrón con su categoría y modalidad (marca las categorías no configuradas en `categorias.json`).
- `sincronizar-padron [--padron-file PATH]` — consulta Oracle una vez y guarda el padrón como snapshot local; el resto de los comandos operan sobre él sin DB.
- `importar-fichadas --periodo YYYYMM [--fichadas-dir ./output]` — consulta los exports de sesión (`fichadas-*.json`) del servicio de fichadas y registra las del período —deduplicadas por `rawHex`, con `rawHex`— en un archivo acumulativo por período (`<repo-dir>/fichadas/<periodo>.json`), del que `calcular` toma las fichadas.

Fuente del padrón: `--padron archivo|oracle` (default `archivo`, snapshot local). `archivo` no depende de la conexión a la DB; `oracle` consulta en vivo. Ver `PRESENTISMO_PADRON` / `PRESENTISMO_PADRON_FILE` en `.env.example`.
- `correccion --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--horas HH:MM | --revertir) --autor <id> --motivo "<texto>"`
- `pausa --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--desde HH:MM --hasta HH:MM | --revertir <id>) --autor <id> --motivo "<texto>"`

Precedencia de configuración: argumento CLI > variable de entorno > default.

## Limitaciones conocidas

- **Fuente de fichadas en el CLI**: `calcular` lee las fichadas del archivo
  acumulativo por período (`<repo-dir>/fichadas/<periodo>.json`), que se puebla con
  `importar-fichadas` a partir de los exports de sesión del servicio de fichadas.
  Flujo: correr el servicio (feature 002) → `importar-fichadas --periodo` → `calcular`.
  Las fichadas sin fecha no se imputan a un período (se informan y omiten en la
  importación).
- **Categoría por período**: se asume estable dentro del período (spec,
  Clarifications); un cambio intra-período se resuelve manualmente.

## Validación

`npm test` corre la suite completa (unitarios de dominio con fixtures de
calibración, contrato de puertos, integración por historia y rendimiento).
Guía end-to-end: [quickstart](../specs/004-dominio-presentismo/quickstart.md).

## Interfaz web (feature 007)

Pantalla principal (React) que muestra el calendario del último mes generado,
el período de liquidación activo y permite reclasificar días con confirmación
explícita. Ver [spec](../specs/007-ui-calendario-mensual/spec.md) y
[quickstart](../specs/007-ui-calendario-mensual/quickstart.md) para el detalle
funcional y los 7 escenarios de validación manual.

**Desarrollo** (recarga en caliente, dos procesos):

```bash
node src/web/server.js          # backend: sirve /api en :4173
cd frontend && npm install && npm run dev   # frontend: Vite proxya /api al backend
```

**Producción** (un solo proceso Node sirve API + estáticos):

```bash
cd frontend && npm install && npm run build   # genera frontend/dist
cd .. && npm run web                          # sirve /api y frontend/dist en :4173
```

Variable de entorno adicional: `PRESENTISMO_WEB_PORT` (puerto del servidor
web, default `4173`). Reutiliza `PRESENTISMO_REPO_DIR`, `PRESENTISMO_LOG_DIR`
y `PRESENTISMO_CATEGORIAS_CONFIG` de la tabla anterior. Requiere al menos un
calendario generado (`npm run presentismo -- generar-calendario --periodo
YYYYMM`) para mostrar la grilla; sin ninguno, la pantalla muestra el estado
vacío global.

Tests: `node --test tests/contract/web-api-calendario.test.js
tests/integration/reclasificar-desde-api.test.js
tests/unit/file-presentismo-repository-listar.test.js` (backend) y
`cd frontend && npm run test` (componentes).
