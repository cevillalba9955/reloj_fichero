# Contrato Web API: Informe al Cierre del Período

**Feature**: 018-informe-cierre-periodo | **Date**: 2026-09-08

Dos endpoints nuevos, montados bajo el recurso calendario del período. El
parseo de `YYYYMM[-Q1|-Q2]` según `ctx.modoResumenPeriodo` usa el helper
compartido `src/web/api/periodo-id.js` (extraído de `resumen-periodo-handlers.js`,
sin cambio de contrato de `/api/resumen-periodo`).

Formas de datos (`VistaInformeCierre`, `InformeResumen`, `InformeDetalle`,
`Pendientes`, `Sello`): ver [data-model.md](../data-model.md).

Errores: envoltorio estándar del router `{ error: { codigo, mensaje } }`.
Autorización: header `x-apex-rol` → `ctx.rolesConfig.mapear` → `exigirRol`
(feature 016).

---

## `POST /api/calendarios/:periodo/informe-cierre`

Emite (o re-emite) el informe de cierre de un tramo y **reemplaza** la copia
guardada. Rol mínimo: **editor**.

### Parámetros

| Ubicación | Nombre | Requerido | Formato | Notas |
|-----------|--------|-----------|---------|-------|
| path | `periodo` | sí | `YYYYMM` | mes del período |
| query | `tramo` | condicional | `Q1` \| `Q2` | modo `QUINCENAL`: si se omite, se emiten **ambas** quincenas. Modo `MENSUAL`: debe omitirse (se emite `Mes`) |
| body | `autor` | no | string | responsable; se guarda en el `Sello` y el log |

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` (del tramo emitido; si se emitieron ambas quincenas, `{ emitidos: [VistaInformeCierre, VistaInformeCierre] }`) | emisión OK |
| `400 PERIODO_INVALIDO` | — | `periodo` no es `YYYYMM` válido, o `tramo` inconsistente con el modo |
| `403 ACCESO_DENEGADO` | — | rol < editor |
| `404 CALENDARIO_NO_GENERADO` | — | el período no tiene calendario |
| `409 PERIODO_ABIERTO` | — | `calendario.cerrado !== true` (FR-002: hay que cerrar primero) |
| `500 ERROR_EMITIENDO_INFORME` | — | fallo al calcular/persistir |

### Efectos

- Escribe `data/P<periodo>/informe-cierre.json` (entrada del/los tramo/s).
- `logger.evento('informe_cierre_emitido', { periodo, tramo, autor, modo: 'manual', empleados, totalHoras })`.
- Idempotente en el sentido de "reemplaza": llamar dos veces seguidas deja la
  misma copia (salvo `emitidoEn`).

---

## `GET /api/calendarios/:periodo/informe-cierre`

Devuelve la copia guardada de un tramo. Rol mínimo: **lector**.

### Parámetros

| Ubicación | Nombre | Requerido | Formato | Notas |
|-----------|--------|-----------|---------|-------|
| path | `periodo` | sí | `YYYYMM` | |
| query | `tramo` | condicional | `Q1` \| `Q2` | requerido en modo `QUINCENAL`; omitir en `MENSUAL` |

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` | hay copia guardada (puede venir con `obsoleto: true`) |
| `400 PERIODO_INVALIDO` | — | formato inválido |
| `404 CALENDARIO_NO_GENERADO` | — | período sin calendario |
| `404 INFORME_NO_EMITIDO` | — | el período nunca se cerró / nunca se emitió ese tramo |

### Notas

- No recalcula: sirve la copia tal como se guardó. Para cifras "en vivo" de un
  período **abierto** está `/api/resumen-periodo` (feature 011).
- `obsoleto: true` ⇒ el período fue reabierto después de emitir; la UI muestra
  "Informe desactualizado — volvé a emitir".

---

## Impacto en endpoints existentes

- `POST /api/calendarios/:periodo/cerrar` — sin cambio de contrato. Efecto
  colateral nuevo: tras cerrar, el servicio emite y guarda el/los informe/s del
  período (`sello.modo = 'automatico'`). Un fallo de emisión **no** revierte el
  cierre; se registra en el log y la respuesta del cierre no cambia.
- `POST /api/calendarios/:periodo/reabrir` — sin cambio de contrato. Efecto
  colateral nuevo: marca `obsoleto: true` las entradas de `informe-cierre.json`.
- `GET /api/resumen-periodo*` — sin cambio de contrato; sólo pasa a importar
  `periodo-id.js` en vez de tener el parseo inline.

---

## Contract tests (`tests/contract/web-api-informe-cierre.test.js`)

1. `POST` sobre período **abierto** → `409 PERIODO_ABIERTO`.
2. `POST` con rol `lector` (header `x-apex-rol`) → `403 ACCESO_DENEGADO`.
3. `POST` sobre período cerrado (modo MENSUAL) → `200`, cuerpo con `sello`,
   `resumen.filas`, `detalle.secciones`, `pendientes`.
4. `GET` tras ese `POST` → `200`, mismo `periodoId`, `obsoleto: false`.
5. `GET` de un período cerrado sin emitir → `404 INFORME_NO_EMITIDO`.
6. `POST` con `periodo` mal formado → `400 PERIODO_INVALIDO`.
7. Modo QUINCENAL: `POST` sin `tramo` → `200` con dos informes; `GET ?tramo=Q1`
   → sólo días 1–15 en `detalle`.
8. `Σ resumen.filas[].horasTrabajadas === resumen.encabezado.totalHoras`.
9. Para cada sección de `detalle`: `subtotalHoras === ` fila de resumen del mismo
   legajo (cuadre SC-002).
