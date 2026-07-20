# Data Model: Reestructurar Almacenamiento por Período

Extiende `CalendarioMes` (feature 004, `specs/004-dominio-presentismo/data-model.md`)
y describe la nueva unidad de almacenamiento (Carpeta de Período) y el padrón, que
pasa de global a propio de cada período.

## Entidad: Carpeta de Período (`P<periodo>`)

No es un objeto de dominio con campos propios: es la unidad de almacenamiento física
que agrupa los tres archivos de un mismo período `YYYYMM`.

| Ruta | Contenido | Reemplaza a (layout anterior) |
|---|---|---|
| `<repoDir>/P<periodo>/calendario.json` | `CalendarioMes` + correcciones + pausas + justificaciones (mismo bulto que hoy) | `<repoDir>/<periodo>.json` |
| `<repoDir>/P<periodo>/fichadas.json` | Acumulado de fichadas del período (mismo formato que hoy) | `<repoDir>/fichadas/<periodo>.json` |
| `<repoDir>/P<periodo>/padron.json` | Snapshot de empleados vigente para ese período | `<repoDir>/padron.json` (único, global) |

**Invariantes**:
- Un período (`YYYYMM`) tiene como máximo una carpeta `P<periodo>`.
- Ningún adaptador escribe directamente una ruta: todos pasan por
  `rutaCarpetaPeriodo(repoDir, periodo)` (research.md §1), para que el nombre de
  carpeta y los tres nombres de archivo tengan un único punto de verdad.
- Listar los períodos existentes (`listarPeriodos`, ya usado por 007/008/011) sigue
  significando "carpetas `P<periodo>` que tienen `calendario.json` con un
  `calendario` no nulo"; el prefijo `P` se recorta al reportar el período (`YYYYMM`
  hacia el resto del sistema, nunca `PYYYYMM`).

## Entidad: `CalendarioMes` (extendida)

Mismos campos que `specs/004-dominio-presentismo/data-model.md` (`periodo`, `dias`,
`esquemaSemanal`), más:

| Campo | Tipo | Reglas |
|---|---|---|
| `cerrado` | boolean | `false` al generarse (FR-005). |
| `cierre` | `{ autor, fechaHora } \| null` | Datos de auditoría del último cierre; `null` mientras nunca se cerró. Se conserva (no se borra) al reabrir, como historial del último cierre/reapertura (FR-008). |
| `reapertura` | `{ autor, fechaHora } \| null` | Datos de auditoría de la última reapertura; `null` mientras nunca se reabrió. |

**Transiciones**:

```
(generado) --cerrar(autor)--> cerrado=true,  cierre={autor, fechaHora}
cerrado=true --reabrir(autor)--> cerrado=false, reapertura={autor, fechaHora}
cerrado=false --cerrar(autor)--> cerrado=true, cierre={autor, fechaHora} (nuevo cierre)
```

**Reglas**:
- `cerrarCalendario`/`reabrirCalendario` (funciones puras, `calendario-mes.js`) son
  transformaciones inmutables, mismo patrón que `reclasificarDia`: devuelven un
  calendario nuevo, no mutan el original.
- Cerrar un calendario ya cerrado, o reabrir uno ya abierto, es un no-op idempotente
  a nivel de dominio (no lanza), pero SÍ actualiza `cierre`/`reapertura` con el
  autor/fecha del intento más reciente — evita un "doble cierre" confuso sin
  bloquear al responsable que repite la acción por las dudas (edge case del spec).
- `exigirPeriodoAbierto(calendario)` (research.md §4) lanza si `cerrado === true`;
  es el único punto que las operaciones de escritura consultan.

## Entidad: Padrón del Período

Igual forma que el snapshot que ya produce `guardarSnapshotPadron` (feature
003/004): `{ generadoEn, vista, empleados: [{ legajo, categoria, nombre? }] }`. Lo
que cambia es su **ubicación** (ahora `P<periodo>/padron.json`, uno por período) y
**cuándo se crea/actualiza**:

| Momento | Acción | Período destino |
|---|---|---|
| Al generar el calendario de un período (`generarCalendario`) | Si `P<periodo>/padron.json` no existe todavía, se crea a partir de la nómina de empleados vigente en ese instante (FR-003) | El período que se está generando |
| Al sincronizar el padrón (`sincronizar-padron`, o su equivalente futuro) | Sobrescribe el padrón | **Siempre** el período del mes en curso (`mesActualPeriodo()` al momento de sincronizar — FR-004), nunca el período que se esté consultando o generando si no coincide con el mes en curso |
| Al leer el padrón para calcular/consultar (`EmployeeCategoryProvider`, `ActiveEmployeesProvider`) | Lee `P<mesActualPeriodo()>/padron.json` (research.md §5) | El mes en curso, resuelto en cada llamada |

**Invariantes**:
- El padrón de un período que ya pasó no se vuelve a escribir nunca (SC-002 del
  spec): solo se lee.
- Si se genera el calendario de un período que **no** es el mes en curso (por
  ejemplo, backfill de un mes anterior sin calendario todavía — feature 008), su
  padrón igual se crea con la nómina vigente en ese instante, pero las
  sincronizaciones posteriores seguirán apuntando al mes en curso, no a ese período
  backfilleado.

## Relación con entidades existentes (004/010/012)

- **Corrección Manual, Pausa Intermedia, Justificación de Ausencia**: sin cambios de
  forma; siguen viviendo dentro de `calendario.json` del período correspondiente.
  Su alta/reversión ahora exige además `exigirPeriodoAbierto` (research.md §4).
- **Fichadas** (features 001/002, acumulado 004): sin cambio de forma; solo cambia
  su ruta a `P<periodo>/fichadas.json`. Incorporar fichadas a un período cerrado se
  rechaza (FR-006).
- **Resumen del período / Resumen de presentismo** (004/011/012): sin cambios; leen
  el mismo `CalendarioMes` extendido y pueden opcionalmente reflejar `cerrado` en su
  respuesta (no es un requisito de esta feature, ver Assumptions del spec: el
  resultado de los cálculos no cambia).
