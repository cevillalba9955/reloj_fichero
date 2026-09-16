# Data Model: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature**: 023-ocultar-fichadas-vacaciones | **Date**: 2026-09-16

No se agregan entidades ni campos nuevos. Esta feature cambia el VALOR de
campos ya existentes de `InformeDetalle` (feature 018,
`specs/018-informe-cierre-periodo/data-model.md`) bajo una condición
específica, sin tocar su forma ni el resto del pipeline de cálculo (features
004/011/012/015).

## Entidades involucradas (ya existentes, sin cambios de forma)

### Jornada / día de calendario (features 004/012/015)

Sin cambios. Sigue trayendo, entre otros, `entrada`, `salida`,
`entradaEfectiva`, `salidaEfectiva`, `justificacion`,
`requiereJustificacionRevision`. Es la fuente que consumen tanto la pantalla
"Resumen del Período" (011) como los informes generados (018/021/022).

### Justificación-espejo de Vacaciones (feature 015)

Sin cambios. `justificacion.motivoId === MotivoVacaciones.id`
(`'vacaciones-anual'`) identifica un día cubierto por una Asignación de
Vacaciones vigente. Es el criterio que esta feature usa para decidir cuándo
aplicar el ocultamiento (research.md §1).

### `InformeDetalle.secciones[].dias[]` (renglón del día en el informe — feature 018)

Forma sin cambios:

```text
{ fecha, clasificacion, estado, entrada, salida, pausas, horas,
  llegadaTarde, corregida, motivoCorreccion, justificacion,
  requiereJustificacionRevision }
```

**Regla nueva de esta feature** (aplicada en `renglonDe()`,
`src/presentismo/domain/informe-cierre.js`, ver research.md §2-§3):

> Si `justificacion?.motivoId === MotivoVacaciones.id` (día cubierto por una
> Asignación de Vacaciones vigente), el renglón se arma con:
> - `entrada: null`
> - `salida: null`
> - `pausas: []`
> - `requiereJustificacionRevision: false`
>
> independientemente de los valores reales calculados aguas arriba
> (`resumen-periodo.js`), y sin tocar `clasificacion`, `estado`, `horas`,
> `corregida`, `motivoCorreccion` ni `justificacion` (esos campos ya reflejan
> el tratamiento correcto — `estado: 'Sin fichadas'`, `horas: 0` — por FR-014
> de la feature 012 y FR-017 de la feature 015; sólo `entrada`/`salida`/
> `pausas`/`requiereJustificacionRevision` son los que, hoy, filtran la
> fichada excepcional hacia el documento).

El renglón resultante es indistinguible del que produce hoy un día de
vacaciones que nunca tuvo fichadas (SC-002 del spec).

### `VistaResumenPeriodo` (feature 011) y `VistaFichadasHoy` (feature 010)

Sin cambios — no consumen `informe-cierre.js`; siguen usando directamente
`detalleDeJornada()`/`resumen-periodo.js`, que esta feature no toca (FR-004).

## Sin cambios de persistencia

`data/P<YYYYMM>/informe-cierre.json` conserva exactamente la misma forma
(`VistaInformeCierre`); sólo cambian, para las entradas nuevas que se
emitan/re-emitan después de este cambio, los valores de
`detalle.secciones[].dias[].entrada|salida|pausas|requiereJustificacionRevision`
en los días de vacaciones con fichadas excepcionales. Las fichadas en sí
siguen almacenadas sin cambios en el estado operativo del período (Principio
VI); esta feature es exclusivamente de presentación del documento de informe
(FR-005).
