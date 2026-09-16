# Contrato Web API: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature**: 023-ocultar-fichadas-vacaciones | **Date**: 2026-09-16

Esta feature **no agrega, elimina ni cambia la forma** de ningún endpoint.
Reutiliza íntegramente los dos endpoints ya documentados en
[specs/018-informe-cierre-periodo/contracts/web-api.md](../../018-informe-cierre-periodo/contracts/web-api.md):

- `POST /api/calendarios/:periodo/informe-cierre`
- `GET  /api/calendarios/:periodo/informe-cierre`

(con `?tramo=Q1|Q2|Mes` — el mismo endpoint sirve al informe de cierre 018, al
informe mensual 021 y al informe anticipado de Q1 022; ver
[research.md §4](../research.md)).

## Delta de comportamiento (mismo shape, distinto valor)

Para cada objeto `dias[]` dentro de `InformeDetalle.secciones[]` de la
respuesta (`VistaInformeCierre.detalle`), cuando
`dias[i].justificacion?.motivoId === 'vacaciones-anual'`:

| Campo | Antes de esta feature | Después de esta feature |
|-------|------------------------|--------------------------|
| `entrada` | hora real fichada, si hubo fichada excepcional ese día | `null` |
| `salida` | hora real fichada, si hubo fichada excepcional ese día | `null` |
| `pausas` | pausas registradas ese día, si las hubo | `[]` |
| `requiereJustificacionRevision` | `true` si llegó una fichada excepcional ese día | `false` |

El resto de los campos del renglón (`fecha`, `clasificacion`, `estado`,
`horas`, `llegadaTarde`, `corregida`, `motivoCorreccion`, `justificacion`) no
cambia. Tampoco cambian `InformeResumen` (`resumen.filas[]` y sus contadores,
incluida la columna `vacaciones`) ni `Pendientes`: ninguno de los dos
consultaba `entrada`/`salida`/`pausas` de un día de vacaciones, así que sus
valores ya eran los mismos antes y después de esta feature (ver
[data-model.md](../data-model.md)).

## Sin cambios en otros endpoints

`GET /api/resumen-periodo` y `GET /api/fichadas` (features 010/011) **no**
cambian: siguen devolviendo la fichada real y la señal de revisión de un día
de vacaciones excepcional, sin ningún ocultamiento (FR-004 del spec).
