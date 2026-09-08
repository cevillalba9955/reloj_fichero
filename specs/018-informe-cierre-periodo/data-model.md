# Data Model: Informe al Cierre del Período

**Feature**: 018-informe-cierre-periodo | **Date**: 2026-09-08

Todas las estructuras son proyecciones derivadas: se construyen desde las filas
de `calcularResumenPeriodo` (features 004/011) y se persisten como estado
operativo del período (Principio VI). No hay entidades nuevas en Oracle.

---

## 1. Archivo persistido — `data/P<periodo>/informe-cierre.json`

Objeto con una entrada por tramo emitido. Claves posibles: `Mes`, `Q1`, `Q2`
(las de `Tramo` en `periodo-liquidacion.js`). En modo `MENSUAL` sólo se usa
`Mes`; en `QUINCENAL`, `Q1` y `Q2`.

```jsonc
{
  "<Tramo>": {
    "sello":      Sello,
    "resumen":    InformeResumen,
    "detalle":    InformeDetalle,
    "pendientes": Pendientes,
    "obsoleto":   false,          // true tras reabrir el período (§4 research)
    "invalidadoPor": null         // { autor, fechaHora } de la reapertura, o null
  }
}
```

Reglas:
- Re-emitir un tramo **reemplaza** su entrada completa (una sola copia por
  tramo, FR-003).
- `reabrirPeriodoMes` pone `obsoleto: true` e `invalidadoPor` en cada entrada
  existente; no borra el archivo.
- Volver a cerrar el período, o `POST .../informe-cierre`, regenera la entrada
  con `obsoleto: false` e `invalidadoPor: null`.

---

## 2. `Sello` — sello de emisión (FR-009)

| Campo | Tipo | Notas |
|-------|------|-------|
| `periodoId` | string | `YYYYMM` (Mes) o `YYYYMM-Q1` / `YYYYMM-Q2` |
| `periodoMes` | string | `YYYYMM` |
| `tramo` | `"Mes" \| "Q1" \| "Q2"` | |
| `modo` | `"automatico" \| "manual"` | automático = generado al cerrar; manual = re-emisión |
| `emitidoEn` | string ISO-8601 | momento de la emisión |
| `autor` | string \| null | responsable que cerró / re-emitió |

---

## 3. `InformeResumen` — Informe de Resumen de Horas Computadas (US1)

```jsonc
{
  "encabezado": {
    "periodoId": "202607-Q1",
    "tramo": "Q1",
    "modo": "QUINCENAL",           // ctx.modoResumenPeriodo al emitir
    "rangoFechas": { "desde": "2026-07-01", "hasta": "2026-07-15" },
    "empleados": 132,               // cantidad de filas (incluye anomalías)
    "totalHoras": 18234.5           // suma de filas[].horasTrabajadas
  },
  "filas": [ FilaResumen, ... ]     // orden: por legajo asc
}
```

### `FilaResumen`

| Campo | Tipo | Origen |
|-------|------|--------|
| `legajo` | number | padrón del período |
| `nombre` | string \| null | snapshot `P<periodo>/padron.json` |
| `modalidad` | `"Mensual" \| "Quincenal" \| null` | `params.tipo` (lo agrega el servicio) |
| `horasTrabajadas` | number | `calcularResumenPeriodo` |
| `completas` | number | jornadas completas |
| `incompletas` | number | jornadas incompletas |
| `ausencias` | number | días `SIN_FICHADAS` que no son licencia/vacaciones |
| `llegadasTarde` | number | |
| `retirosAnticipados` | number | |
| `correcciones` | number | días con corrección vigente |
| `feriado` | number | días Feriado del tramo |
| `licencia` | number | días con Justificación `Paga` |
| `vacaciones` | number | días con Justificación de Vacaciones |
| `anomalia` | string \| null | `"sin categoría configurada"` → fila señalada, contadores en 0 |

**Invariante (SC-002 / SC-008)**:
`encabezado.totalHoras == Σ filas[].horasTrabajadas` y cada `FilaResumen`
coincide con la fila del mismo empleado en `GET /api/resumen-periodo?periodo=<periodoId>`.

---

## 4. `InformeDetalle` — Informe de Detalle de Asistencia (US2)

```jsonc
{
  "encabezado": { "periodoId": "...", "tramo": "...", "empleados": 132 },
  "secciones": [ SeccionEmpleado, ... ]   // orden: por legajo asc
}
```

### `SeccionEmpleado`

| Campo | Tipo | Notas |
|-------|------|-------|
| `legajo` | number | |
| `nombre` | string \| null | |
| `modalidad` | string \| null | |
| `dias` | `RenglonDetalle[]` | todos los días del tramo, orden cronológico |
| `subtotalHoras` | number | Σ `dias[].horas` — **debe** == `FilaResumen.horasTrabajadas` |
| `anomalia` | string \| null | si la fila era anomalía, la sección va sin `dias` |

### `RenglonDetalle`

| Campo | Tipo | Origen |
|-------|------|--------|
| `fecha` | string `YYYY-MM-DD` | |
| `diaSemana` | string | derivado de `fecha` (view-model) |
| `clasificacion` | `Clasificacion` | `Laborable` / `No Laborable` / `Feriado` / `Vacaciones` / … |
| `estado` | `EstadoJornada` | `COMPLETA` / `INCOMPLETA` / `SIN_FICHADAS` |
| `entrada` | `"HH:MM"` \| null | hora real, o corregida si hay corrección vigente — **nunca** la efectiva por tolerancia (FR-006) |
| `salida` | `"HH:MM"` \| null | ídem |
| `pausas` | `[{ desde:"HH:MM", hasta:"HH:MM", tipo }]` | pausas vigentes |
| `horas` | number | horas computadas del día |
| `llegadaTarde` | boolean | |
| `corregida` | boolean | marca visible "proviene de corrección" |
| `justificacion` | `{ motivoId, etiquetaMotivo, tipoPago } \| null` | marca visible "proviene de justificación" |
| `requiereJustificacionRevision` | boolean | |

---

## 5. `Pendientes` — puntos a revisar antes de liquidar (FR-010 / US3)

```jsonc
{
  "hayPendientes": true,
  "jornadasIncompletas": [ { "legajo": 4021, "nombre": "…", "fechas": ["2026-07-03","2026-07-11"] } ],
  "anomalias":          [ { "legajo": 5510, "nombre": "…", "detalle": "sin categoría configurada" } ],
  "ajustes":            [ { "legajo": 4102, "nombre": "…", "fechas": ["2026-07-08"] } ]  // corrección o justificación
}
```

`hayPendientes` = `jornadasIncompletas`, `anomalias` o `ajustes` no vacío. Si es
`false`, la vista imprime "Sin pendientes de revisión".

---

## 6. `VistaInformeCierre` — respuesta de la API

Lo que devuelven `POST` y `GET .../informe-cierre`. Es la entrada de tramo del
archivo, formateada para presentación (`construirVistaInformeCierre`):

```jsonc
{
  "periodoId": "202607-Q1",
  "sello": Sello,
  "obsoleto": false,
  "resumen": InformeResumen,     // horas como número; la UI las formatea a HH:MM o decimal
  "detalle": InformeDetalle,
  "pendientes": Pendientes
}
```

`GET` sin copia guardada → `404 INFORME_NO_EMITIDO`.
`POST` sobre período no cerrado → `409 PERIODO_ABIERTO`.

---

## 7. Transiciones de estado

```
período ABIERTO
   │  POST .../cerrar  (rol editor+)
   ▼
período CERRADO  ──►  cerrarPeriodoMes emite y guarda informe-cierre.json
   │                    (todos los tramos del modo; sello.modo = "automatico")
   │
   ├─  POST .../informe-cierre  (rol editor+, exige CERRADO)
   │      └─► regenera la entrada del tramo (sello.modo = "manual", obsoleto=false)
   │
   │  POST .../reabrir  (rol editor+)
   ▼
período ABIERTO otra vez  ──►  reabrirPeriodoMes marca cada entrada obsoleto=true
   │
   │  (ajustes: corrección / justificación / reclasificación)
   │
   │  POST .../cerrar  de nuevo
   ▼
período CERRADO  ──►  informe regenerado, obsoleto=false, cifras actualizadas
```

---

## 8. Puerto `PresentismoRepository` — métodos nuevos

| Método | Firma | Semántica |
|--------|-------|-----------|
| `guardarInformeCierre` | `(periodo:string, tramo:string, entrada:object) => Promise<void>` | Crea/reemplaza la entrada del tramo en `P<periodo>/informe-cierre.json` (crea la carpeta y el archivo si no existen) |
| `cargarInformeCierre` | `(periodo:string) => Promise<object \| null>` | Devuelve el objeto completo (mapa por tramo) o `null` si el archivo no existe |

`reabrirPeriodoMes` usa `cargarInformeCierre` + `guardarInformeCierre` (por
tramo) para setear `obsoleto`. Ambos métodos se agregan también al
`in-memory-presentismo-repository.js` para paridad en tests, y a
`METODOS.PresentismoRepository` en `ports/index.js`.
