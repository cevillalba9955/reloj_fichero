# Contrato: extensión del padrón Oracle con `fechaIngreso` (extiende feature 003)

Extiende `contracts/oracle-roster-repository-contract.md` de la feature 003
(no lo reemplaza). Cambios acotados a agregar un campo; nada de lo que ya
consume `activo`/`legajo` se rompe.

## Repositorio Oracle (capa aislada, Principio II)

`fetchLegajosActivos()` (o el método equivalente que use el repositorio
Oracle de 003) agrega la columna de fecha de ingreso del padrón de RRHH a la
consulta de solo lectura ya existente. Sigue sin agregar ninguna escritura
nueva a Oracle (Principio VI: la única escritura prevista es el registro de
liquidación al cierre de período, ajeno a este cambio).

## `ActiveEmployeesProvider` (contrato normalizado)

Antes (003): `{ legajo: integer, activo: true }[]`.

**Ahora**: `{ legajo: integer, activo: true, fechaIngreso: 'YYYY-MM-DD' |
null }[]`.

- `oracle-active-employees-provider.js` interpreta la columna cruda de
  fecha de ingreso: si es nula, vacía o no parseable como fecha, normaliza a
  `null` y **no** descarta el legajo (a diferencia de un `legajo` inválido,
  que sí se descarta hoy) — un legajo sin fecha de ingreso sigue siendo un
  legajo activo válido para el resto del sistema; solo queda sin antigüedad
  calculable para esta feature (edge case del spec, FR-012).
- `local-file-active-employees-provider.js` / `daily-cached-active-
  employees-provider.js`: el snapshot cacheado localmente (`padron.json`,
  tanto `data/presentismo/` como cada `P<periodo>/`) agrega el campo
  `fechaIngreso` por legajo, mismo criterio de caché diaria que ya aplica a
  `categoria`/`nombre`.

## Compatibilidad hacia atrás

Cualquier consumidor existente del padrón que solo lea `legajo`/`activo`
sigue funcionando sin cambios (campo agregado, ninguno removido/renombrado).
