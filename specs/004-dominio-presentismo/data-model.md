# Data Model: Dominio de Presentismo

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Modelo del dominio derivado de `spec.md` §Key Entities y §Functional Requirements. Todos
los tiempos de "hora del día" se representan como **minutos-del-día** (entero `0..1439`);
las duraciones, como enteros en minutos. Las fechas, como `YYYY-MM-DD`.

## Entidades

### CalendarioMes
Calendario institucional único y compartido de un mes.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `periodo` | string `YYYYMM` | Único. Mes calendario válido (FR-001). |
| `dias` | `DiaMes[]` | Un elemento por fecha del mes; sin huecos ni duplicados (FR-002/006). |
| `esquemaSemanal` | conjunto de días de semana | Con el que se generó; default L–V (FR-003). |

**Reglas**:
- Generación: cada fecha del mes → un `DiaMes`, inicialmente `Laborable` si su día de
  semana ∈ `esquemaSemanal`, si no `No Laborable` (FR-002).
- Regenerar un mes existente no duplica días ni pisa reclasificaciones manuales (FR-006).

### DiaMes
Una fecha dentro del `CalendarioMes`.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `fecha` | string `YYYY-MM-DD` | Única dentro del calendario. |
| `dd` | int `1..31` | Derivable de `fecha`; usado para el recorte quincenal. |
| `clasificacion` | `Clasificacion` | Exactamente una (FR-004). |
| `reclasificadoManual` | bool | `true` si un usuario cambió el valor inicial (protege FR-006). |

**Clasificacion** (enum): `Laborable` | `No Laborable` | `Feriado`.
- `Laborable`: aporta jornada esperada a cumplir con fichadas.
- `Feriado`: aporta jornada esperada, cumplida sin fichadas.
- `No Laborable`: no aporta jornada esperada.

**Transiciones**: cualquier clasificación → cualquier otra por acción de usuario
responsable (FR-004); reclasificar dispara recálculo de los períodos que incluyen el día
(FR-005) sin perder fichadas imputadas.

### Fichada (consumida, no propia)
Registro de marcación provisto por features 001/002. El dominio la lee, no la produce.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `legajo` | int | Identifica al empleado. |
| `fecha` | string `YYYY-MM-DD` \| null | Si null, no imputable (FR-008). |
| `hora` | int minutos-del-día \| null | Si null, no participa como entrada/salida. |
| `id` | string | Identidad estable para deduplicar (FR-009). |

### Modalidad
Régimen de liquidación con su propio juego de parámetros de jornada.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `tipo` | `Mensual` \| `Quincenal` | Determina el recorte del período. |
| `params` | `ParametrosJornada` | Propios de la modalidad (FR-010/011). |

### ParametrosJornada
Propios de cada `Modalidad`.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `aperturaOficial` | int min | Default `07:00` → 420. |
| `cierreOficial` | int min | Default `16:00` → 960. `cierre > apertura`. |
| `margenApertura` | int min | Default 30. `≥ 0`. |
| `margenCierre` | int min | Default 30. `≥ 0`. |
| `ventanaApertura` | `[int, int]` | Rango donde se busca la entrada. Default `[300, 720]`. |
| `ventanaCierre` | `[int, int]` | Rango donde se busca la salida. Default `[720, 1439]`. |

**Derivado**: `jornadaEsperada = cierreOficial − aperturaOficial` (FR-011; default 540 min
= 9 h). No se configura por separado.

### Categoria
Agrupación de empleados definida en este sistema.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `codigo` | string | Único; es el valor que reporta el padrón por empleado. |
| `modalidad` | `Modalidad` | Exactamente una (FR-033). |

Se prevé reutilizarla para futuros cálculos ajenos al presentismo (spec).

### AsignacionEmpleadoCategoria (leída del padrón)
Vínculo legajo→categoría, de solo lectura desde Oracle RRHH (FR-034).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `legajo` | int | Del padrón de activos (feature 003). |
| `codigoCategoria` | string | Debe existir en la config de categorías; si no, anomalía (FR-035). |

### PeriodoLiquidacion (derivado, no persistido)
Recorte del `CalendarioMes` según la modalidad del empleado (research §6).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `periodo` | string `YYYYMM` | Mes base. |
| `tramo` | `Mes` \| `Q1` \| `Q2` | `Mes` (mensual); `Q1`=días 1–15, `Q2`=días 16–fin (quincenal). |
| `dias` | `DiaMes[]` | Subconjunto del calendario según el tramo (FR-031/032). |

**Identidad**: (`periodo`, `tramo`). Suma Q1+Q2 = Mes (SC-012).

### Jornada
Unidad de cálculo: (`DiaMes`, empleado).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `legajo` | int | |
| `fecha` | `YYYY-MM-DD` | |
| `fichadas` | `Fichada[]` | Del legajo en esa fecha, deduplicadas (FR-009). |
| `entrada` | `Fichada` \| null | Primera en ventana de apertura (FR-012). |
| `salida` | `Fichada` \| null | Última en ventana de cierre, posterior a entrada (FR-013). |
| `entradaEfectiva` | int min \| null | Tras tolerancia (FR-014). |
| `salidaEfectiva` | int min \| null | Tras tolerancia (FR-014). |
| `horasAuto` | int min | Cálculo automático, `clamp(0, jornadaEsperada)` (FR-014/024). |
| `descuentoPausas` | int min | Suma de solapes de pausas (FR-038). |
| `correccion` | `CorreccionManual` \| null | Si vigente, prevalece (FR-028). |
| `pausas` | `PausaIntermedia[]` | Cero o más (FR-037). |
| `estado` | `EstadoJornada` | Ver abajo. |
| `totalDiario` | int min | Resultado final del día (auto − pausas, o corrección). |
| `sugerencia` | int min \| null | Valor sugerido no aplicado si `Incompleta` (FR-015). |
| `requiereRevision` | bool | `true` si un recálculo alteró la base de una corrección/pausa (FR-029/041). |

**EstadoJornada** (enum): `Completa` | `Incompleta` | `Sin fichadas` | `Feriado cumplido`
| `No aplica`.
- `Completa`: entrada y salida válidas en día `Laborable`.
- `Incompleta`: falta una punta en día `Laborable` → `horasAuto = 0`, con `sugerencia`.
- `Sin fichadas`: día `Laborable` sin fichadas → `0` (FR-016).
- `Feriado cumplido`: día `Feriado` → crédito = jornada esperada (FR-020).
- `No aplica`: día `No Laborable` (no aporta jornada esperada).

**Total diario**:
- Con corrección vigente: `totalDiario = correccion.valor`.
- Sin corrección: `totalDiario = max(0, horasAuto − descuentoPausas)` (FR-038/039).

### CorreccionManual
Intervención auditable sobre una `Jornada` (FR-026–030).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `autor` | string | Usuario responsable identificable (Assumption). |
| `fechaHora` | timestamp | Momento de la corrección. |
| `valorCalculado` | int min | Snapshot del auto al corregir (FR-028, se conserva visible). |
| `valorCorregido` | int min | Prevalece sobre el auto (FR-028). Puede exceder jornada esperada (FR-024). |
| `camposCorregidos` | conj. | Horas / estado / elección entrada / elección salida (FR-026). |
| `motivo` | string no vacío | Obligatorio (FR-027). |
| `vigente` | bool | `false` tras reversión (FR-030). |

### PausaIntermedia
Descuento horario cargado a mano (FR-037–041).

| Campo | Tipo | Reglas |
|-------|------|--------|
| `desde` | int min | Inicio del intervalo. `desde < hasta`, mismo día. |
| `hasta` | int min | Fin del intervalo. |
| `autor` | string | Responsable identificable. |
| `fechaHora` | timestamp | Momento de la carga. |
| `motivo` | string no vacío | Obligatorio (FR-040). |
| `vigente` | bool | `false` tras reversión (FR-041). |

**Descuento efectivo** = `overlap([desde,hasta], [entradaEfectiva, salidaEfectiva])`;
solo aplica en `Laborable` con horas efectivas (FR-039); no aplica en `Feriado`/`No
Laborable`/sin horas.

### ResumenPresentismo
Resultado por empleado y `PeriodoLiquidacion`.

| Campo | Tipo | Reglas |
|-------|------|--------|
| `legajo` | int | |
| `periodo` / `tramo` | string / enum | Identifican el período de liquidación. |
| `modalidad` | `Mensual`\|`Quincenal` | Aplicada (FR-019/022). |
| `params` | `ParametrosJornada` | Con los que se calculó (FR-022). |
| `horasEsperadas` | int min | Σ jornada esperada de días `Laborable` + `Feriado` del tramo (FR-020). |
| `horasTrabajadas` | int min | Σ `totalDiario` de los días del tramo. |
| `horasAuto` / `horasCorregidas` / `descuentoPausas` | int min | Desglose (FR-022). |
| `saldo` | int min | `horasTrabajadas − horasEsperadas`. |
| `conteos` | objeto | `laborables`, `completas`, `incompletas`, `sinFichadas` (FR-019). |
| `fichadasFueraDeCalendario` | lista | Fichadas en `No Laborable`/`Feriado` (FR-018). |
| `anomalias` | lista | Categoría no configurada, fichadas no imputadas, etc. |

## Relaciones

```
CalendarioMes 1───* DiaMes
DiaMes 1───* Fichada (por fecha)          [Fichada es consumida, no propiedad del dominio]
Categoria 1───1 Modalidad 1───1 ParametrosJornada
Empleado(legajo) *───1 Categoria           [vía AsignacionEmpleadoCategoria, leída de RRHH]
PeriodoLiquidacion (derivado) ──recorta──> CalendarioMes
Jornada = (DiaMes × Empleado)
Jornada 0..1 CorreccionManual
Jornada 0..* PausaIntermedia
ResumenPresentismo = agregación de Jornada sobre PeriodoLiquidacion
```

## Estado persistido vs derivado

| Persistido (`PresentismoRepository`) | Derivado en cálculo (no se guarda) |
|--------------------------------------|-------------------------------------|
| `CalendarioMes` + `DiaMes.clasificacion` | `PeriodoLiquidacion` |
| `CorreccionManual` | `Jornada` (entrada/salida/efectivas/horasAuto/total) |
| `PausaIntermedia` | `ResumenPresentismo` |

| Leído de fuentes externas (read-only) | Config local |
|---------------------------------------|--------------|
| `Fichada` (store en memoria, feat. 002) | `Categoria`/`Modalidad`/`ParametrosJornada` |
| `AsignacionEmpleadoCategoria` (Oracle RRHH) | `esquemaSemanal` global |

## Invariantes (para tests)

1. `0 ≤ horasAuto ≤ jornadaEsperada` (SC-008).
2. `totalDiario ≥ 0` siempre (FR-039/SC-015).
3. `horasEsperadas(Q1) + horasEsperadas(Q2) = horasEsperadas(Mes)` y lo mismo para
   trabajadas, sin contar días de más en el corte 15/16 (SC-012).
4. Cálculo automático puro: misma entrada ⇒ misma salida, sin leer reloj (SC-005).
5. Toda `CorreccionManual`/`PausaIntermedia` con `motivo` no vacío; sin motivo ⇒ rechazo
   (FR-027/040, SC-009).
6. Fichada en `No Laborable`/`Feriado` nunca entra en `horasTrabajadas`; aparece en
   `fichadasFueraDeCalendario` (FR-018/SC-007).
