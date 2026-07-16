# Data Model: Página "Fichadas de Hoy"

Todas las entidades reutilizan la forma ya definida en la feature 004
(`src/presentismo/domain/`, `ports/index.js`); acá solo se documentan los campos
**nuevos o extendidos** y la proyección de vista que arma el backend para el frontend.

## Entidades de dominio (extendidas)

### Pausa (extiende 004)

```text
Pausa {
  periodo: string            # YYYYMM
  legajo: number
  fecha: string               # YYYY-MM-DD
  desde: number                # minutos-del-día
  hasta: number                # minutos-del-día, desde < hasta
  autor: string | null
  motivo: string               # obligatorio, no vacío (FR-004 de esta feature / FR-040 de 004)
  fechaHora: string            # ISO 8601, alta del registro
  vigente: boolean             # default true; false tras revertir
  tipo: 'intermedia' | 'retiro_anticipado'   # NUEVO — default 'intermedia' si se omite
}
```

- `retiro_anticipado`: por convención `hasta = params.cierreOficial` de la modalidad
  vigente ese día; `desde` es la hora de retiro declarada por el administrador.
- Persistencia sin cambios de esquema en el repositorio: el campo es adicional dentro
  del mismo objeto ya guardado por `repo.guardarPausa`.

### Corrección Manual (extiende 004)

```text
CorreccionManual {
  periodo: string
  legajo: number
  fecha: string
  valorCalculado: number | null      # snapshot del total automático (ya existía)
  valorCorregido: number | null      # total override (ya existía) — opcional si se
                                      # corrige entrada/salida en su lugar
  entradaCorregida: number | null    # NUEVO — minutos-del-día, o null
  salidaCorregida: number | null     # NUEVO — minutos-del-día, o null
  camposCorregidos: string[]         # ya existía; ahora puede incluir 'entrada'/'salida'
  autor: string | null
  motivo: string                     # obligatorio, no vacío (ya existía, FR-027 de 004)
  fechaHora: string                  # ISO 8601
  vigente: boolean                   # default true; false tras revertir
}
```

Regla de derivación (dominio, `aplicarAjustes`): si `entradaCorregida` y/o
`salidaCorregida` están presentes, se recalculan `entradaEfectiva`/`salidaEfectiva` con
`horaEfectivaEntrada`/`horaEfectivaSalida` (mismas funciones que el cálculo automático)
y el total se deriva de ellas (más el descuento de pausas vigentes), salvo que
`valorCorregido` también venga seteado, en cuyo caso prevalece como antes (compat 004).

## Entidad nueva: Situación (proyección, no persistida)

```text
SituacionDia =
  | 'ESPERANDO'
  | 'PRESENTE'
  | 'TARDE'
  | 'AUSENTE'
  | 'Completa'            # jornada cerrada dentro de lo esperado (reusa EstadoJornada)
  | 'RETIRO_ANTICIPADO'
  | 'Feriado cumplido'    # reusa EstadoJornada de 004, día no penalizado
  | 'No aplica'           # día No Laborable, reusa EstadoJornada de 004
  | 'ANOMALIA'            # sin categoría configurada (mismo caso que 004 sinCalculo)
```

Se calcula en el momento de servir la vista (`calcularSituacionHoy`, research.md §1);
no se persiste — depende de la hora actual del servidor.

## Vista de presentación: `VistaFichadasHoy`

Lo que arma `construirVistaFichadasHoy` (`src/web/view-model.js`) y devuelve
`GET /api/fichadas-hoy`:

```text
VistaFichadasHoy {
  fecha: string                 # YYYY-MM-DD, hoy del servidor
  periodo: string                # YYYYMM del día (para llamadas subsiguientes)
  diaClasificacion: 'Laborable' | 'No Laborable' | 'Feriado'
  empleados: FilaFichadaHoy[]
}

FilaFichadaHoy {
  legajo: number
  nombre: string | null          # del snapshot del padrón (research.md §5); null si no
                                  # está en el snapshot (no bloquea la fila)
  entrada: string | null         # 'HH:MM' o null
  salida: string | null          # 'HH:MM' o null
  horasTrabajadas: number        # minutos u horas decimales — mismo formato que 004
                                  # (`totalDiario`), documentado una sola vez ahí
  situacion: SituacionDia
  correccionVigente: boolean
  pausas: { desde: string, hasta: string, tipo: string, motivo: string }[]
  anomalias: string[]            # p. ej. "categoría no configurada"
}
```

No incluye legajos crudos del reloj, templates biométricos ni credenciales (Principio
V, FR-015 del spec). El campo `nombre` es el único dato personal expuesto, ya presente
en la vista de 004 (snapshot local).

## Relaciones

- `FilaFichadaHoy` se arma por legajo a partir de: `ActiveEmployeesProvider`
  (legajo+nombre esperado hoy) × `calcularEmpleado(legajo, periodo)` de 004 (jornada
  del día `fecha` dentro del resumen del período) × `calcularSituacionHoy` (proyección
  nueva).
- Una `Pausa` con `tipo: 'retiro_anticipado'` y una `CorreccionManual` pueden coexistir
  sobre el mismo día/legajo (ver spec, edge case "retiro anticipado + salida fichada
  real"): la corrección de salida, si existe, prevalece sobre la fichada real para el
  valor mostrado; el retiro anticipado sigue describiendo el motivo de la salida
  temprana independientemente de cuál horario prevalezca.
