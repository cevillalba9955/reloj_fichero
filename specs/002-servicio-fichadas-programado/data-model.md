# Data Model: Servicio de Consulta Programada de Fichadas

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Este documento describe las entidades manejadas por el servicio, derivadas
de la sección "Key Entities" de la spec y de las decisiones de
`research.md`. Todo vive en memoria de proceso (sin persistencia); no
representa tablas de base de datos.

## 1. Empleado

Representa a una persona identificable por su legajo, cuyo estado
activo/inactivo surge de `ActiveEmployeesProvider` (research.md §4).

| Campo | Tipo | Descripción |
|---|---|---|
| `legajo` | integer | Identificador numérico del empleado (entero de 4 bytes, ver `001-consulta-fichadas-rs596`, research.md §5.15). Clave primaria dentro del store. |
| `activo` | boolean | Provisto por `ActiveEmployeesProvider`; solo los empleados activos participan del cálculo de completitud por checkpoint. |
| `checkpoints` | `Map<checkpointId, EstadoCheckpoint>` | Para cada checkpoint del día (ver §3), si el empleado está `completo` o `incompleto`, y qué Fichada (si alguna) lo completó. |

**Validation rules**:
- Un `Empleado` sin `activo=true` no bloquea el cierre de ningún
  checkpoint (FR-005/FR-006): solo los empleados activos cuentan para la
  condición de completitud.
- `checkpoints` se reinicia (vacío, todos `incompleto`) al comenzar la
  ventana del primer checkpoint del día (Edge Case de spec.md: reinicio
  diario del progreso).

## 2. Fichada

Evento de marcación de un Empleado, tal como lo entrega
`parseFichadaRecord` de `001-consulta-fichadas-rs596` (método de
verificación, hora y fecha ya decodificados por completo — research.md
§5.16 de esa feature), enriquecido con la asociación a Período y
checkpoint que hace esta feature.

| Campo | Tipo | Descripción |
|---|---|---|
| `legajo` | integer | Referencia al Empleado (puede no tener un `Empleado` activo asociado si el legajo no está en el padrón — ver Validation rules). |
| `metodo` | `"huella"` \| `"tarjeta"` \| `"rostro"` \| `null` | Tal como lo entrega el cliente existente, sin reinterpretar. |
| `fecha` | string (`YYYY-MM-DD`) \| `null` | Tal como lo entrega el cliente existente (decodificada por completo en la práctica totalidad de los casos). |
| `hora` | string (`HH:MM:SS`) \| `null` | Tal como lo entrega el cliente existente. |
| `rawHex` | string (40 caracteres hex) | Igual que en feature 001, para trazabilidad. Actúa además como identificador único de la Fichada dentro del store (FR-017): una Fichada con un `rawHex` ya presente en el store se ignora. |
| `periodo` | string (`YYYY-MM`) | Derivado de `fecha` (research.md §5); si `fecha` es `null`, derivado de la fecha de recolección y marcado con `periodoAproximado: true`. |
| `periodoAproximado` | boolean | `true` únicamente cuando `periodo` se derivó de la fecha de recolección en vez de `fecha` (caso excepcional). |
| `checkpointId` | `"entrada"` \| `"salida"` \| `null` | Checkpoint al que quedó asociada (research.md §6); `null` si ningún checkpoint estaba abierto al momento de la descarga. |
| `recolectadaEn` | string (ISO 8601) | Momento en que el servicio la descargó del reloj (distinto de `fecha`/`hora`, que son del evento real). |

**Validation rules**:
- Toda Fichada recolectada se guarda, incluso si su `legajo` no
  corresponde a ningún `Empleado` activo conocido (el padrón puede estar
  desactualizado o el legajo puede pertenecer a un empleado inactivo) —
  nunca se descarta una fichada real (FR-008, herencia de FR-013 de
  feature 001).
- **Actualizado 2026-07-07 (FR-017):** el reloj no borra fichadas
  (herencia de FR-007 de feature 001), por lo que vuelve a reportar como
  pendiente la misma fichada en ciclos de sondeo posteriores. El servicio
  DEBE deduplicar contra el propio store: antes de agregar una Fichada
  recién parseada, se compara su `rawHex` contra las ya almacenadas; si
  coincide, se descarta el duplicado (no se agrega, no se cuenta en
  `periodos[]`, no dispara ningún efecto — es como si no hubiera llegado).
  La suposición anterior de esta spec ("no hay deduplicación, queda fuera
  de alcance") quedó reemplazada por esta decisión.

## 3. Checkpoint (configuración, no entidad persistida)

No es una de las tres entidades de dominio pedidas por la spec (Empleado,
Fichada, Período), sino la configuración de scheduling que el servicio
evalúa en cada tick. Se documenta acá por su rol central en FR-002 a
FR-007.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `"entrada"` \| `"salida"` | Identificador del checkpoint. |
| `horaEsperada` | string (`HH:MM`) | 07:00 para "entrada", 16:00 para "salida" por defecto; configurable. |
| `margenMinutos` | integer | 30 por defecto; configurable. Define la ventana de aceptación `[horaEsperada - margen, horaEsperada + margen]`. |
| `estado` | `"pendiente"` \| `"abierto"` \| `"cerrado_completo"` \| `"cerrado_margen_agotado"` | Ver transición de estados abajo. |

**State transitions**:

```
pendiente → abierto (al llegar horaEsperada - margen, o al arrancar el
             servicio si ya se está dentro de la ventana)
abierto → cerrado_completo (todos los Empleados activos tienen Fichada
           válida para este checkpoint)
abierto → cerrado_margen_agotado (se venció horaEsperada + margen sin que
           todos los Empleados activos estén completos — FR-007)
```

**Validation rules**:
- Un checkpoint en `cerrado_completo` o `cerrado_margen_agotado` no
  vuelve a `abierto` el mismo día, aunque lleguen fichadas nuevas después
  (Edge Cases de spec.md).
- Mientras exista al menos un checkpoint en estado `abierto`, el
  scheduler (research.md §2) sigue disparando consultas cada 5 minutos.
- Todos los checkpoints se reinician a `pendiente` al empezar el día
  siguiente (no hay persistencia entre días, igual que entre reinicios).

## 4. Período (AñoMes)

Agrupación mensual bajo la cual se acumulan las Fichadas de un Empleado.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string (`YYYY-MM`) | Por ejemplo, `"2026-07"`. |
| `legajo` | integer | Empleado al que pertenece este agrupamiento. |
| `fichadas` | `Fichada[]` | Todas las fichadas de ese empleado cuyo `periodo` coincide con este `id`. |

**Validation rules**:
- Un Período se crea "on demand" la primera vez que se recolecta una
  Fichada que le corresponde; no se pre-crean períodos vacíos.

## 5. Estado acumulado en memoria (snapshot de `getState()`, FR-014)

Estructura devuelta por la interfaz de consulta interna (research.md §7);
no es una entidad de dominio nueva, es la vista agregada de las anteriores.

| Campo | Tipo | Descripción |
|---|---|---|
| `fechaServicio` | string (`YYYY-MM-DD`) | Día que el scheduler tiene "en curso". |
| `checkpoints` | `Checkpoint[]` | Estado actual de cada checkpoint (ver §3). |
| `empleados` | `Empleado[]` | Con su estado de completitud por checkpoint (ver §1). |
| `periodos` | `Período[]` | Todos los períodos con fichadas acumuladas hasta el momento (ver §4). |
| `ultimoCiclo` | `{ ejecutadoEn: string, resultado: "success"\|"error"\|"omitido", fichadasNuevas: number, duracionMs: number }` | Diagnóstico del último ciclo de sondeo (FR-015). |
