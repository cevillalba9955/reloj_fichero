# Data Model: Informe de la Primera Quincena antes del Cierre del Mes

**Feature**: 022-informe-primera-quincena-anticipado | **Date**: 2026-09-09

Esta feature **no introduce entidades ni formas de datos nuevas**. Reutiliza
íntegramente el modelo de la feature 018
(`specs/018-informe-cierre-periodo/data-model.md`) con el tramo `Q1`, y agrega
un único campo booleano (`anticipado`) al `Sello` y a la entrada guardada.

## 1. Informe Anticipado de la Primera Quincena  (= Informe de Cierre, `tramo = 'Q1'`, `anticipado = true`)

Reutiliza `VistaInformeCierre` / `InformeResumen` / `InformeDetalle` /
`Pendientes` / `Sello` de la feature 018 sin cambios de forma, salvo
`sello.anticipado`.

| Campo | Valor para el informe anticipado de Q1 |
|-------|----------------------------------------|
| `sello.periodoId` | `'YYYYMM-Q1'` |
| `sello.periodoMes` | `'YYYYMM'` |
| `sello.tramo` | `'Q1'` |
| `sello.modo` | `'manual'` (emisión y re-emisión anticipadas son siempre manuales, FR-018) |
| `sello.emitidoEn` | ISO-8601 de la emisión |
| `sello.autor` | responsable (o `null`) |
| `sello.anticipado` | **NUEVO** — `true` si se emitió sobre un período abierto (ventana anticipada); `false` en toda emisión de cierre (default) |
| `resumen.encabezado.tramo` | `'Q1'` |
| `resumen.encabezado.modo` | `'QUINCENAL'` (la feature sólo aplica en ese modo) |
| `resumen.encabezado.rangoFechas` | `{ desde: 'YYYY-MM-01', hasta: 'YYYY-MM-15' }` |
| `resumen.filas[]` | una por empleado del padrón del período; contadores acumulados de los **días 1–15** |
| `detalle.secciones[]` | una por empleado; `dias[]` cubre del 1 al 15 (menos No Laborables, que el view-model omite); `subtotalHoras` == fila de resumen del mismo legajo |
| `pendientes` | jornadas incompletas + anomalías + días con ajuste, de los días 1–15 |
| `obsoleto` | `false` mientras el mes esté abierto; sólo `true` tras una reapertura posterior al cierre (mecanismo de la feature 018, sin cambios) |
| `invalidadoPor` | `null` (ídem) |

**Invariante de cuadre (SC-002 / SC-003 del spec)**: para cada empleado, cada
contador del informe anticipado de Q1 es igual al que `GET /api/resumen-periodo?periodo=YYYYMM-Q1`
devuelve para el mismo mes en el mismo momento; y `Σ resumen.filas[].horasTrabajadas
=== resumen.encabezado.totalHoras`, y por cada sección de `detalle`,
`subtotalHoras ===` la fila de resumen del mismo legajo. Se cumple por
construcción: ambos caminos usan `calcularResumenPeriodo(periodoMes, legajos,
'<YYYYMM>-15', { tramo: 'Q1' })`.

## 2. Almacenamiento

Archivo existente `data/P<YYYYMM>/informe-cierre.json`, mapa `{ [tramo]: entrada }`:

```jsonc
{
  "Q1": {
    "sello": { "periodoId": "202609-Q1", "tramo": "Q1", "modo": "manual",
               "emitidoEn": "2026-09-16T11:20:00.000Z", "autor": "…",
               "anticipado": true },              // ← NUEVO campo
    "resumen": { … }, "detalle": { … }, "pendientes": { … },
    "obsoleto": false, "invalidadoPor": null
  }
  // "Q2" / "Mes": aparecen recién al cerrar el período (flujo 018/021)
}
```

- Antes del cierre, en la ventana anticipada: el mapa puede tener **sólo** `Q1`
  (con `anticipado: true`), y sólo si hubo una emisión manual.
- Al cerrar el período: `emitirInformesDelCierre` reescribe `Q1`, `Q2` y `Mes`
  con `emision: 'automatico'` → la entrada `Q1` queda con `anticipado: false`.
- Sin migración: entradas `Q1` escritas antes de esta feature no tienen el
  campo `anticipado`; se lee como `false` (`Boolean(entrada.sello.anticipado)`).

## 3. Estados y transiciones

```text
(período ABIERTO, modo QUINCENAL)
   │
   │  Q1 en curso (hoy ≤ día 15)
   │     → no hay acción; POST ?tramo=Q1 ⇒ 409 QUINCENA_EN_CURSO
   │
   │  Q1 terminada (hoy > día 15) y período no cerrado  ── "ventana anticipada"
   │     ├─ POST ?tramo=Q1 (rol editor): escribe entrada Q1 con anticipado=true, modo='manual'
   │     ├─ re-emisión (mismo POST, mientras el mes siga abierto): reemplaza la entrada; anticipado=true
   │     └─ GET ?tramo=Q1: devuelve la copia anticipada (o 404 INFORME_NO_EMITIDO si nunca se emitió)
   │
   ▼  cerrar período
(período CERRADO)
   ├─ emisión automática: reescribe Q1, Q2 y Mes  →  entrada Q1 con anticipado=false
   ├─ re-emisión manual (POST ?tramo=Q1|Q2|Mes): reemplaza; anticipado=false
   └─ reabrir período: marca obsoleto=true en TODAS las entradas (Q1, Q2, Mes)
        │   (y, si Q1 ya terminó, la ventana anticipada vuelve a estar disponible:
        │    una nueva emisión anticipada limpia obsoleto y pone anticipado=true)
        ▼
   (período ABIERTO otra vez)
```

## 4. Reglas de validación

| Regla | Fuente |
|-------|--------|
| El `:periodo` de la ruta debe ser `YYYYMM` válido (mes 01–12) | `parsePeriodoId` (existente) |
| Emisión anticipada sólo si modo `QUINCENAL` **y** `?tramo=Q1` **y** `calendario.cerrado !== true` | **cambio de esta feature** en `informe-cierre-handlers.js` |
| Emisión anticipada exige `primeraQuincenaTerminada(periodoMes, hoy)` — si no, `409 QUINCENA_EN_CURSO` | **cambio de esta feature** (helper nuevo en `periodo-liquidacion.js`) |
| Para `?tramo=Q2` / `Mes` / omitido sobre período abierto → `409 PERIODO_ABIERTO` (sin cambio) | `exigirCalendarioCerrado` (existente, reubicado) |
| `POST` (emitir/re-emitir) exige rol `editor`+ | `exigirRol` (existente, feature 016) |
| `GET` de un período sin la entrada `Q1` → `404 INFORME_NO_EMITIDO` | `informe-cierre-handlers.js` (existente) |
| El período no cambia de estado al emitir: correcciones/pausas/justificaciones sobre días 1–15 siguen permitidas (FR-011) | sin cambios: la emisión no toca `calendario.cerrado` |
| La acción anticipada se monta en la UI sólo si `vista.emisionAnticipadaQ1Disponible === true` | **cambio de esta feature** en `resumen-periodo-handlers.js` + `PaginaResumenPeriodo.jsx` |

## 5. `primeraQuincenaTerminada(periodoMes, hoy)`  (helper puro, `periodo-liquidacion.js`)

| Entrada | Salida |
|---------|--------|
| `periodoMes` = `'YYYYMM'`, `hoy` = `'YYYY-MM-DD'` (de `hoyLocal()`) | `boolean` |
| mes de `hoy` posterior al mes de `periodoMes` | `true` |
| mismo mes y `Number(hoy.slice(8,10)) > 15` | `true` |
| mismo mes y día ≤ 15, o `periodoMes` en un mes futuro | `false` |

Función pura, sin estado; testeable en aislamiento (unit test del dominio).

## 6. Entidades de UI

| Componente | Rol | Cambio |
|------------|-----|--------|
| `PaginaResumenPeriodo` | monta `<AccionInformeCierre>` bajo el encabezado del período | MOD (pasa `anticipadoQ1Disponible`) |
| `AccionInformeCierre` | trae la copia guardada, "Ver informe", "Descargar PDF", aviso `obsoleto` | MOD (modo anticipado: botón "Emitir informe de la primera quincena" / "Re-emitir" cuando `!cerrado && anticipadoQ1Disponible`; `<Alert type="info">` persistente) |
| `InformeCierreContenido` + `descargarInformePdf` | contenido imprimible / PDF | MOD (renglón visible "EMISIÓN ANTICIPADA — mes no cerrado" cuando `vista.sello.anticipado`) |
| `InformeCierrePrintable` | modal "Ver informe" | MOD (sufijo "· emisión anticipada" en la etiqueta cuando `vista.sello.anticipado`) |
| `informe-cierre-client` | acceso a `/api` | **sin cambios** (`'YYYYMM-Q1'` ya se traduce a `?tramo=Q1`) |
