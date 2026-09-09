# Data Model: Informe de Asistencia Mensual desde el Calendario

**Feature**: 021-informe-asistencia-mensual | **Date**: 2026-09-09

Esta feature **no introduce entidades ni formas de datos nuevas**. Reutiliza
íntegramente el modelo de la feature 018 (`specs/018-informe-cierre-periodo/data-model.md`)
con el tramo `Mes`. Este documento describe sólo lo específico del alcance
mensual.

## 1. Informe de Asistencia Mensual  (= Informe de Cierre, `tramo = 'Mes'`)

Reutiliza `VistaInformeCierre` / `InformeResumen` / `InformeDetalle` /
`Pendientes` / `Sello` de la feature 018 sin cambios de forma.

| Campo | Valor para el informe mensual |
|-------|-------------------------------|
| `sello.periodoId` | `'YYYYMM'` (sin sufijo de quincena) |
| `sello.periodoMes` | `'YYYYMM'` |
| `sello.tramo` | `'Mes'` |
| `sello.modo` | `'automatico'` (al cerrar) \| `'manual'` (re-emisión) |
| `sello.emitidoEn` | ISO-8601 de la emisión |
| `sello.autor` | responsable (o `null`) |
| `resumen.encabezado.tramo` | `'Mes'` |
| `resumen.encabezado.modo` | granularidad de la instalación: `'MENSUAL'` \| `'QUINCENAL'` |
| `resumen.encabezado.rangoFechas` | `{ desde: 'YYYY-MM-01', hasta: 'YYYY-MM-<último día>' }` |
| `resumen.filas[]` | una por empleado del padrón del período; contadores acumulados del **mes completo** |
| `detalle.secciones[]` | una por empleado; `dias[]` cubre del 1 al último del mes (menos No Laborables, que el view-model omite); `subtotalHoras` == fila de resumen del mismo legajo |
| `pendientes` | jornadas incompletas + anomalías + días con ajuste, del mes completo |
| `obsoleto` | `true` si el mes se reabrió tras emitir |

**Invariante de unificación (SC-002 del spec)**: para cada empleado y para cada
contador (`horasTrabajadas`, `completas`, `incompletas`, `ausencias`,
`llegadasTarde`, `retirosAnticipados`), el valor del tramo `Mes` es igual a la
suma de los valores de los tramos `Q1` y `Q2` del mismo mes cerrado. Se cumple
por construcción: `calcularResumenPeriodo(periodoMes, legajos, hasta, { tramo: null })`
concatena las jornadas de todo el mes, que son exactamente las de Q1 más las de
Q2.

## 2. Almacenamiento

Archivo existente `data/P<YYYYMM>/informe-cierre.json`, cuyo contenido es un
mapa `{ [tramo]: entrada }`:

```jsonc
{
  "Q1":  { "sello": { … }, "resumen": { … }, "detalle": { … }, "pendientes": { … }, "obsoleto": false, "invalidadoPor": null },
  "Q2":  { … },
  "Mes": { … }   // ← NUEVO en modo QUINCENAL; ya existía como única clave en modo MENSUAL
}
```

- Modo `MENSUAL`: el mapa tiene sólo `Mes` (igual que hoy).
- Modo `QUINCENAL`: el mapa pasa a tener `Q1`, `Q2` y `Mes`.
- Sin migración: los períodos ya cerrados en QUINCENAL no tienen `Mes` hasta
  que se re-emita o se reabra+cierre. `GET ?tramo=Mes` → `404 INFORME_NO_EMITIDO`
  hasta entonces.

## 3. Estados y transiciones (sin cambios respecto de la feature 018)

```text
(período abierto)
   │  cerrar período  ────────────────────────────────────────────┐
   ▼                                                               │
(período cerrado)                                                  │
   ├─ emisión automática: escribe Q1, Q2 y Mes (QUINCENAL)         │
   │                       o Mes (MENSUAL)                         │
   ├─ re-emisión manual (rol editor, POST ?tramo=Mes): reemplaza   │
   │   la entrada Mes; emitidoEn actualizado; obsoleto=false       │
   └─ reabrir período: marca obsoleto=true en TODAS las entradas ──┘
                        (Q1, Q2, Mes)
```

## 4. Reglas de validación

| Regla | Fuente |
|-------|--------|
| El `:periodo` de la ruta debe ser `YYYYMM` válido (mes 01–12) | `parsePeriodoId` (existente) |
| `tramo=Mes` es aceptable en cualquier modo de instalación | **cambio de esta feature** en `informe-cierre-handlers.js` |
| `POST` (emitir/re-emitir) exige rol `editor`+ | `exigirRol` (existente, feature 016) |
| `POST` exige `calendario.cerrado === true` (si no, `409 PERIODO_ABIERTO`) | `exigirCalendarioCerrado` (existente) |
| `GET` de un período sin la entrada `Mes` → `404 INFORME_NO_EMITIDO` | `informe-cierre-handlers.js` (existente) |
| La acción sólo se monta en la UI si `vista.cerrado === true` | **cambio de esta feature** en `PaginaCalendario.jsx` |

## 5. Entidades de UI

| Componente | Rol | Cambio |
|------------|-----|--------|
| `PaginaCalendario` | monta la acción del informe mensual cuando el mes está cerrado | MOD |
| `AccionInformeCierre` | trae la copia guardada, "Ver informe", "Descargar PDF", aviso `obsoleto` | MOD (prop para fijar tramo `Mes`) |
| `InformeCierrePrintable` | modal "Ver informe" | sin cambios |
| `InformeCierreContenido` + `descargarInformePdf` | contenido imprimible / PDF | sin cambios |
| `informe-cierre-client` | acceso a `/api` | MOD (`obtenerMensual` / `emitirMensual`) |
