# Contrato Web API: Informe de Asistencia Mensual desde el Calendario

**Feature**: 021-informe-asistencia-mensual | **Date**: 2026-09-09

**No hay endpoints nuevos.** Esta feature amplía el contrato de los dos
endpoints de la feature 018 para aceptar el tramo `Mes` también en
instalaciones `QUINCENAL`, y agrega un efecto colateral al cierre del período.

Formas de datos (`VistaInformeCierre`, `InformeResumen`, `InformeDetalle`,
`Pendientes`, `Sello`): ver `specs/018-informe-cierre-periodo/data-model.md`
(sin cambios).

Envoltorio de error: estándar del router `{ error: { codigo, mensaje } }`.
Autorización: header `x-apex-rol` → `ctx.rolesConfig.mapear` → `exigirRol`
(feature 016).

---

## `POST /api/calendarios/:periodo/informe-cierre`  (ampliado)

Emite / re-emite un tramo y **reemplaza** la copia guardada. Rol mínimo:
**editor**.

### Cambio de contrato

| Antes (feature 018) | Ahora (feature 021) |
|---------------------|---------------------|
| `?tramo` en modo `QUINCENAL`: sólo `Q1` \| `Q2` (u omitido = ambos) | se agrega `Mes` como valor válido de `?tramo` en **cualquier** modo |
| `?tramo` en modo `MENSUAL`: debe omitirse | además se acepta `?tramo=Mes` (equivalente a omitirlo) |

### Parámetros

| Ubicación | Nombre | Requerido | Formato | Notas |
|-----------|--------|-----------|---------|-------|
| path | `periodo` | sí | `YYYYMM` | mes del período |
| query | `tramo` | condicional | `Q1` \| `Q2` \| `Mes` | `Mes` = informe del mes calendario completo (unifica Q1+Q2 en QUINCENAL). En `MENSUAL`, `Mes` u omitido son equivalentes. Omitir en `QUINCENAL` sigue emitiendo `Q1` y `Q2` (no `Mes`) |
| body | `autor` | no | string | responsable; va al `Sello` y al log |

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` del tramo emitido (`periodoId` == `YYYYMM`, `sello.tramo` == `'Mes'`) | emisión OK de `?tramo=Mes` |
| `200` | `{ emitidos: [VistaInformeCierre, VistaInformeCierre] }` | `QUINCENAL` sin `?tramo` (Q1+Q2, comportamiento 018) |
| `400 PERIODO_INVALIDO` | — | `periodo` no es `YYYYMM`, o `tramo` fuera de `{Q1,Q2,Mes}` |
| `403 ACCESO_DENEGADO` | — | rol < editor |
| `404 CALENDARIO_NO_GENERADO` | — | el período no tiene calendario |
| `409 PERIODO_ABIERTO` | — | `calendario.cerrado !== true` |
| `500 ERROR_EMITIENDO_INFORME` | — | fallo al calcular/persistir |

### Efectos de `?tramo=Mes`

- Escribe la clave `"Mes"` en `data/P<periodo>/informe-cierre.json` (junto a
  `"Q1"`/`"Q2"` si existían; no las toca).
- `logger.evento('informe_cierre_emitido', { periodo, tramo: 'Mes', autor, emision: 'manual', empleados, totalHoras })`.
- "Reemplaza": llamar dos veces seguidas deja la misma copia salvo
  `sello.emitidoEn`.

---

## `GET /api/calendarios/:periodo/informe-cierre`  (ampliado)

Devuelve la copia guardada de un tramo. Rol mínimo: **lector** (lectura
abierta).

### Cambio de contrato

`?tramo=Mes` pasa a ser válido en **cualquier** modo. En `MENSUAL`, `?tramo=Mes`
u omitido son equivalentes (ambos leen la clave `"Mes"`).

### Parámetros

| Ubicación | Nombre | Requerido | Formato | Notas |
|-----------|--------|-----------|---------|-------|
| path | `periodo` | sí | `YYYYMM` | |
| query | `tramo` | condicional | `Q1` \| `Q2` \| `Mes` | `Mes` lee la copia del mes completo. En `QUINCENAL` sigue siendo obligatorio indicar el tramo (ahora puede ser `Mes`) |

### Respuestas

| Código | Cuerpo | Cuándo |
|--------|--------|--------|
| `200` | `VistaInformeCierre` (puede venir `obsoleto: true`) | hay copia guardada del tramo `Mes` |
| `400 PERIODO_INVALIDO` | — | formato inválido |
| `404 CALENDARIO_NO_GENERADO` | — | período sin calendario |
| `404 INFORME_NO_EMITIDO` | — | el período nunca se cerró, o se cerró en `QUINCENAL` antes de esta feature y aún no se re-emitió el tramo `Mes` |

---

## Impacto en endpoints existentes

- `POST /api/calendarios/:periodo/cerrar` — **sin cambio de firma**. Efecto
  colateral ampliado: al cerrar en modo `QUINCENAL`, la emisión automática
  ahora escribe **tres** tramos (`Q1`, `Q2`, `Mes`) en vez de dos. En modo
  `MENSUAL` sigue escribiendo sólo `Mes`. Best-effort: un fallo se loguea
  (`informe_cierre_emision_fallida`) y no revierte el cierre.
- `POST /api/calendarios/:periodo/reabrir` — **sin cambio**. Ya marca
  `obsoleto: true` en **todas** las entradas del mapa `informe-cierre.json`; la
  entrada `Mes` queda cubierta.
- `GET /api/resumen-periodo*` — sin cambio.
- `GET /api/calendarios/:periodo` (`VistaCalendarioMes`) — sin cambio; la UI ya
  recibe `cerrado` y con eso decide montar la acción del informe mensual.

---

## Contract tests (`tests/contract/web-api-informe-cierre.test.js`, casos nuevos)

Se agregan a la suite existente de la feature 018.

10. **QUINCENAL — `POST ?tramo=Mes` sobre período cerrado** → `200`; cuerpo con
    `sello.tramo === 'Mes'`, `periodoId` sin sufijo, `resumen.filas`,
    `detalle.secciones`, `pendientes`.
11. **QUINCENAL — `GET ?tramo=Mes` tras ese `POST`** → `200`, `obsoleto: false`,
    `detalle` con días del 1 al fin de mes.
12. **QUINCENAL — cuadre de unificación**: para cada legajo,
    `resumenMes.fila.horasTrabajadas === resumenQ1.fila.horasTrabajadas + resumenQ2.fila.horasTrabajadas`
    (ídem `ausencias`, `llegadasTarde`, `retirosAnticipados`, `completas`,
    `incompletas`). Emitir Q1, Q2 y Mes y comparar.
13. **QUINCENAL — cerrar período escribe 3 tramos**: tras `POST …/cerrar`,
    `GET ?tramo=Q1`, `?tramo=Q2` y `?tramo=Mes` devuelven todos `200`.
14. **`POST ?tramo=Mes` con rol `lector`** → `403 ACCESO_DENEGADO`.
15. **`POST ?tramo=Mes` sobre período abierto** → `409 PERIODO_ABIERTO`.
16. **`POST ?tramo=Xx` (valor no en {Q1,Q2,Mes})** → `400 PERIODO_INVALIDO`.
17. **MENSUAL — `GET ?tramo=Mes`** devuelve lo mismo que `GET` sin `?tramo`
    (equivalencia).
18. **Cuadre SC-002/SC-003 del tramo Mes**:
    `Σ resumen.filas[].horasTrabajadas === resumen.encabezado.totalHoras`, y por
    cada sección de `detalle`, `subtotalHoras ===` fila de resumen del mismo
    legajo.
