# Data Model: Justificación de Ausencias

## Entidad: Justificación de Ausencia

Representa el motivo registrado para un día `Laborable` de un legajo, con su
clasificación de pago y su estado de auditoría. Un registro por **día** (una carga por
rango genera un registro por cada día `Laborable` elegible del rango — ver research.md
§3).

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `periodo` | string `YYYYMM` o `YYYYMM-Q1`/`YYYYMM-Q2` | sí | Período de liquidación al que pertenece el día (mismo identificador que usa 004). |
| `legajo` | string | sí | Empleado al que pertenece la ausencia. |
| `fecha` | string `YYYY-MM-DD` | sí | Día `Laborable` justificado; pasado o futuro. |
| `motivoId` | string | sí | Id del motivo en el catálogo vigente al momento de la carga (config/motivos-ausencia.json). |
| `etiquetaMotivo` | string | sí | Etiqueta visible del motivo, copiada al momento de la carga (no se recalcula si el catálogo cambia después — ver Edge Case "motivo eliminado o desactivado"). |
| `tipoPago` | enum `Paga` \| `No paga` | sí | Clasificación de pago del motivo, copiada al momento de la carga por la misma razón que `etiquetaMotivo`. |
| `autor` | string \| null | sí (puede ser `null` si no hay autenticación) | Quién registró la Justificación. |
| `fechaHora` | string ISO 8601 | sí | Cuándo se registró. |
| `vigente` | boolean | sí | `true` mientras no se revierta; `false` tras revertir. |
| `reversion` | `{ autor, fechaHora }` \| `null` | sí | Datos de quién y cuándo revirtió, o `null` si sigue vigente. |
| `origenCarga` | `{ desde, hasta } \| null` | no | Si el día se cargó como parte de un rango, el rango original (trazabilidad; no afecta el cálculo). |

**Invariantes**:
- Un legajo no puede tener más de una Justificación con `vigente = true` para la misma
  `fecha` (FR-008). Antes de crear una nueva, la vigente debe revertirse.
- `fecha` debe corresponder a un día `Laborable` del Calendario del mes (004); si el día
  se reclasifica después a `No Laborable`/`Feriado`, el registro no se borra, pero el
  día queda señalado para revisión (edge case del spec), igual que una Corrección
  Manual sobre un día reclasificado.
- Crear una Justificación exige que el día, al momento de la carga, sea: (a) pasado con
  `EstadoJornada.SIN_FICHADAS`, o (b) futuro (fecha posterior a "hoy"). Un día pasado
  `Incompleta`/`Completa` no es elegible (FR-002).

**Transiciones de estado**:

```
(no existe) --crear (motivo, autor)--> vigente=true
vigente=true --revertir (autor)--> vigente=false, reversion={autor, fechaHora}
vigente=false --crear (nuevo motivo, autor)--> vigente=true (nuevo registro)
```

No hay transición de "editar motivo in place": cambiar de motivo es revertir + crear,
igual que la Corrección Manual (mismo criterio de auditoría: nunca sobrescribir en
silencio).

## Entidad: Motivo de Ausencia (catálogo)

Entrada de configuración, no de estado operativo por período. Vive en
`config/motivos-ausencia.json`.

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `id` | string | sí | Identificador estable, único dentro del catálogo (p. ej. `sin_aviso`). |
| `etiqueta` | string | sí | Texto visible en la lista de selección (p. ej. `Sin Aviso`). |
| `tipoPago` | enum `Paga` \| `No paga` | sí | Clasificación fija del motivo. |
| `activo` | boolean | sí (default `true`) | Si `false`, el motivo deja de ofrecerse para nuevas Justificaciones, pero las ya cargadas conservan su `etiquetaMotivo`/`tipoPago` copiados. |

**Catálogo por defecto** (FR-004/FR-005, carga inicial):

| id | etiqueta | tipoPago |
|---|---|---|
| `sin_aviso` | Sin Aviso | No paga |
| `aviso_justificado` | Aviso Justificado | No paga |
| `enfermedad` | Enfermedad | Paga |
| `art` | ART | Paga |
| `nacimiento` | Nacimiento | Paga |
| `fallecimiento` | Fallecimiento | Paga |
| `vacaciones` | Vacaciones | Paga |
| `matrimonio` | Matrimonio | Paga |
| `examen` | Examen | Paga |

**Invariantes**: `id` único y no vacío dentro del catálogo; `tipoPago` ∈ {`Paga`, `No
paga`}; al menos un motivo `activo: true` (catálogo vacío o todo inactivo es una
configuración inválida — fail-fast, mismo criterio que `categorias-config.js`).

## Forma persistida (extensión del archivo por período)

`file-presentismo-repository.js` ya persiste `{ calendario, correcciones, pausas }` por
`periodo` (`data/presentismo/<periodo>.json`). Se agrega la cuarta colección:

```json
{
  "calendario": { "...": "..." },
  "correcciones": [ "..." ],
  "pausas": [ "..." ],
  "justificaciones": [
    {
      "periodo": "202607",
      "legajo": "1234",
      "fecha": "2026-07-22",
      "motivoId": "vacaciones",
      "etiquetaMotivo": "Vacaciones",
      "tipoPago": "Paga",
      "autor": "rrhh.mgomez",
      "fechaHora": "2026-07-20T14:03:11.000Z",
      "vigente": true,
      "reversion": null,
      "origenCarga": { "desde": "2026-07-20", "hasta": "2026-07-24" }
    }
  ]
}
```

## Relación con entidades existentes (004/010/011)

- **Día del Calendario del mes** (004): fuente de `clasificacion` (`Laborable` requerido)
  y, para días pasados, de `EstadoJornada` (`Sin fichadas` requerido).
- **Resumen del período** (`resumen-presentismo.js`, 004/011): consumidor — un día con
  Justificación `Paga` vigente se agrega igual que un `Feriado` (crédito de jornada
  esperada); un día `No paga` se expone con su motivo pero no cambia el número de horas
  (research.md §4).
- **Corrección Manual** (004): entidad hermana en el patrón de auditoría (autor, fecha,
  motivo, vigente/reversión), mutuamente excluyente por construcción con Justificación
  (research.md §5).
