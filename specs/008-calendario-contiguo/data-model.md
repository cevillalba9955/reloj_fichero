# Data Model — Generación de Calendario Contigua (feature 008)

Esta feature **no agrega entidades persistentes**. La unidad que se persiste sigue siendo el
Calendario del mes (feature 004, JSON por período). Lo nuevo son **proyecciones derivadas**
(calculadas en cada request) que el backend expone para que la UI aplique la regla de
contigüidad sin recomputarla.

## Entidades / conceptos

### Período de calendario (existente)

- **Identidad**: `periodo` = `"YYYYMM"` (validado por `parsePeriodo`).
- **Estado**: generado (existe archivo JSON) o no generado.
- **Persistencia**: archivo JSON por período detrás del puerto de repositorio (Principio VI).
- Sin cambios en su estructura por esta feature.

### Secuencia contigua generada (derivada, no persistida)

- Conjunto de períodos generados, caracterizado por `min = min(periodos)` y
  `max = max(periodos)`.
- **Invariante (FR-008)**: los períodos forman una corrida de `YYYYMM` consecutivos sin huecos.
  La feature garantiza que ninguna operación de la IU la viole; se asume que la data preexistente
  ya la cumple.

### Frontera generable (derivada, no persistida)

- Conjunto de 0..2 períodos habilitados para generar **ahora**:
  - lista vacía → `{ mesActual }` (semilla, FR-005).
  - si no → `{ periodoAnterior(min) }` ∪ (`{ periodoSiguiente(max) }` **si** `periodoSiguiente(max) ≤ mesActual`).
- `mesActual` = `"YYYYMM"` derivado del reloj del **servidor**.
- Se recalcula en cada `GET /api/calendarios`; nunca se persiste.

## Helpers de dominio (puros, nuevos)

En `src/presentismo/domain/calendario-mes.js`:

- `periodoSiguiente(periodo) -> "YYYYMM"`: mes +1, con cruce de año (dic → ene del año siguiente).
- `periodoAnterior(periodo) -> "YYYYMM"`: mes −1, con cruce de año (ene → dic del año anterior).
- Ambos validan la entrada con `parsePeriodo` y devuelven el `YYYYMM` normalizado (año a 4
  dígitos, mes a 2). Deterministas, sin dependencia del reloj.

> Puede implementarse como un único `desplazarPeriodo(periodo, delta)` y derivar los dos; el
> contrato observable es el de las dos funciones anteriores.

## Proyecciones de presentación (view-models)

### Listado de calendarios — `GET /api/calendarios` (extendido)

Forma devuelta (campos nuevos en **negrita**):

| Campo          | Tipo               | Descripción                                                        |
|----------------|--------------------|--------------------------------------------------------------------|
| `periodos`     | `string[]`         | `YYYYMM` ascendentes de meses generados (existente).               |
| `ultimo`       | `string \| null`   | `max(periodos)` o `null` (existente).                              |
| **`mesActual`**| `string`           | `"YYYYMM"` del reloj del servidor.                                  |
| **`generables`**| `string[]`        | 0..2 períodos `YYYYMM` habilitados para generar ahora (frontera).  |

Reglas:
- `generables` está ordenado ascendentemente y no contiene períodos ya presentes en `periodos`.
- Con `periodos` vacío: `generables === [mesActual]`, `ultimo === null`.
- Nunca incluye un período posterior a `mesActual`.

### Vista de un mes — `VistaCalendarioMes` (sin cambios)

La respuesta de `GET /api/calendarios/:periodo` y de `POST /:periodo/generar` es la
`VistaCalendarioMes` existente (feature 007, ver su data-model). Esta feature no altera su forma.

## Estados y transiciones (período)

```text
no-generado ──[POST /generar, período ∈ generables]──▶ generado
no-generado ──[POST /generar, no contiguo]───────────▶ (rechazo 409 PERIODO_NO_CONTIGUO)
no-generado ──[POST /generar, futuro > mesActual]────▶ (rechazo 409 PERIODO_FUTURO)
generado    ──[POST /generar]────────────────────────▶ generado (idempotente, 200, sin regenerar)
```

Al pasar a `generado`, `max` (o `min`) de la secuencia se corre en un mes y la frontera generable
se recalcula en el siguiente `GET`.

## Reglas derivadas para la UI (sin lógica de negocio propia)

Dado el período mostrado `P`, `periodos` y `generables` del backend:

- Mostrar botón "Generar" en estado vacío ⟺ `generables.includes(P)`.
- Mensaje de no-contiguo (cuando `P` está vacío y `!generables.includes(P)`): identifica el
  período de `generables` más cercano a `P` en la dirección de `P` (el que hay que generar
  primero).
- `siguiente` deshabilitado ⟺ `periodoSiguiente(P) ∉ periodos ∪ generables`.
- `anterior` deshabilitado ⟺ `periodoAnterior(P) ∉ periodos ∪ generables`.

## Sin exposición de datos sensibles

Ninguna de las proyecciones incluye legajos, nombres ni fichadas (FR-011), consistente con la
feature 007.
