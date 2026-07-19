# Data Model: Página "Resumen del Período"

Todo es **proyección calculada, no persistida** (FR-010: cero escrituras). La fuente
única es el `ResumenPresentismo` con su detalle `jornadas[]` que ya devuelve
`calcularEmpleado` (feature 004); esta feature solo proyecta (research.md §1).

## Proyección de dominio: `ResumenPeriodoEmpleado`

Salida de `proyectarResumenPeriodo({ resumen, hoy })`
(`src/presentismo/domain/resumen-periodo.js`), derivada de `resumen.jornadas`
filtrado por `fecha <= hoy`:

```text
ResumenPeriodoEmpleado {
  legajo: number
  horasTrabajadas: number      # minutos, Σ totalDiario de días vencidos
  completas: number             # estado 'Completa' en días vencidos
  incompletas: number           # estado 'Incompleta' en días vencidos
  ausencias: number             # estado 'Sin fichadas' en días vencidos (solo Laborable)
  llegadasTarde: number         # entrada considerada fuera de margen (research §2;
                                 # la corrección de entrada prevalece)
  retirosAnticipados: number    # días con pausa vigente tipo 'retiro_anticipado'
  correcciones: number          # días con correccionVigente
  detalle: DetalleJornada[]     # mismo arreglo filtrado — coherencia SC-002 por
                                 # construcción
}
```

Reglas:
- Días `No Laborable` / `Feriado` no aportan a `ausencias` ni a `incompletas`
  (tienen estados propios `No aplica` / `Feriado cumplido`, FR-008); sí aportan
  `totalDiario` (el feriado acredita jornada, regla de 004).
- Empleado sin categoría (`sinCalculo: true`): no se proyecta — la fila sale marcada
  como anomalía sin acumulados (FR-007).
- Quincenales: los dos tramos (Q1+Q2) se suman en una fila mensual y sus jornadas se
  concatenan para el detalle (research §3).

## Proyección por día: `DetalleJornada`

```text
DetalleJornada {
  fecha: string                 # YYYY-MM-DD
  clasificacion: 'Laborable' | 'No Laborable' | 'Feriado'
  estado: EstadoJornada         # 'Completa' | 'Incompleta' | 'Sin fichadas' |
                                 # 'Feriado cumplido' | 'No aplica'  (004)
  entrada: string | null        # 'HH:MM' efectiva (corregida si corresponde)
  salida: string | null         # 'HH:MM' efectiva (corregida si corresponde)
  horas: number                 # minutos (totalDiario)
  llegadaTarde: boolean
  corregida: boolean            # correccionVigente (FR-005)
  pausas: { desde: string, hasta: string, tipo: string }[]   # vigentes; el tipo
                                 # distingue retiro_anticipado (FR-005)
}
```

## Vistas de presentación (API)

### `VistaResumenPeriodo` — `GET /api/resumen-periodo`

```text
VistaResumenPeriodo {
  periodo: string               # YYYYMM efectivo (query o el más reciente, FR-002)
  periodos: string[]            # períodos con calendario generado (selector, FR-002)
  filas: FilaResumenPeriodo[]
}

FilaResumenPeriodo {
  legajo: number
  nombre: string | null         # del snapshot del padrón (único dato personal)
  horasTrabajadas: number       # minutos (la UI formatea H:MM, mismo criterio 010)
  completas: number
  incompletas: number
  ausencias: number
  llegadasTarde: number
  retirosAnticipados: number
  correcciones: number
  anomalia: string | null       # motivo si sinCalculo (FR-007); acumulados en 0
}
```

### `VistaDetalleEmpleado` — `GET /api/resumen-periodo/{legajo}`

```text
VistaDetalleEmpleado {
  periodo: string
  legajo: number
  nombre: string | null
  dias: DetalleJornada[]        # horas ya en 'HH:MM' para entrada/salida/pausas
}
```

Ninguna vista incluye fichadas crudas, `rawHex` ni datos biométricos (FR-011,
Principio V).

## Relaciones

- `FilaResumenPeriodo` = padrón vigente (`ActiveEmployeesProvider`, universo de esta
  versión — Clarifications/FR-012) × `calcularEmpleado(legajo, periodo)` ×
  `proyectarResumenPeriodo`.
- `VistaDetalleEmpleado.dias` proviene del mismo `detalle` de la proyección: la suma
  de sus `horas` y sus conteos coinciden exactamente con la fila (SC-002).
- Cuando exista el registro de cierre de período (feature futura, Principio VI), los
  períodos cerrados reemplazarán la rama de cálculo en vivo por una lectura de ese
  registro, sin cambiar estas vistas (FR-012).
