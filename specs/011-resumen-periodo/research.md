# Research: Página "Resumen del Período"

## §1. Fuente de los acumulados: proyección sobre `resumen.jornadas`, no sobre `conteos`

**Hallazgo**: `calcularEmpleado(legajo, periodo)` (feature 004) ya devuelve por tramo
un `ResumenPresentismo` con `conteos { laborables, completas, incompletas,
sinFichadas }`, `horasTrabajadas` y el detalle `resumen.jornadas[]` (fecha + resultado
completo de `aplicarAjustes`: estado, entrada/salida efectivas, `correccionVigente`,
`correccion`, `pausas` con `tipo`, `totalDiario`, `descuentoPausas`).

**Hallazgo 2**: los `conteos` agregados NO sirven directamente para esta pantalla:
`construirResumen` cuenta los días futuros del período en curso como `Sin fichadas`
(el cálculo automático no conoce "hoy"), y el spec exige excluirlos (FR-008, edge
case "período en curso").

**Decisión**: nueva función pura `proyectarResumenPeriodo({ resumen, hoy })` en
`src/presentismo/domain/resumen-periodo.js` que deriva **de una sola pasada sobre
`resumen.jornadas` filtrado por `fecha <= hoy`** tanto la fila de acumulados como el
detalle por día. Indicadores:

- `horasTrabajadas`: Σ `totalDiario` de los días vencidos (los futuros aportan 0
  igual, pero el filtro garantiza la coherencia formal con el detalle).
- `completas` / `incompletas`: por `estado` (`Completa`/`Incompleta`) en días vencidos.
- `ausencias`: `estado === 'Sin fichadas'` en días vencidos (solo ocurre en días
  `Laborable`; `No Laborable`/`Feriado` tienen estados propios y quedan fuera,
  FR-008).
- `llegadasTarde`: días vencidos con entrada considerada fuera del margen (ver §2).
- `retirosAnticipados`: días vencidos con alguna pausa vigente
  `tipo: 'retiro_anticipado'`.
- `correcciones`: días vencidos con `correccionVigente`.

La fila y el detalle salen del mismo arreglo filtrado → SC-002 (0 discrepancias) se
cumple por construcción, y se testea igual.

**Alternativas consideradas**:
- *Usar `resumen.conteos` y restarle los días futuros*: rechazada — duplica la regla
  de corte en dos lugares y no resuelve tarde/retiros, que igual exigen recorrer las
  jornadas.
- *Extender `construirResumen` (004) para que reciba `hoy` y cuente tarde/retiros*:
  rechazada — cambiaría la semántica de un dominio ya calibrado y consumido por el
  CLI de 004 (sus conteos son del período completo, correctos para cierre); una
  proyección aparte no arriesga regresiones y deja claro que es una vista.

## §2. Llegada tarde retrospectiva (con corrección prevaleciendo)

**Decisión**: `esLlegadaTarde(jornada, params)` en `resumen-periodo.js`, aplicando la
MISMA regla de margen que la situación `TARDE` de 010 (`situacion-dia.js`) sobre la
**entrada considerada** = `correccion.entradaCorregida` si hay corrección vigente con
entrada, o `entrada.hora` si no (Clarifications del spec: la corrección prevalece).
Un día sin entrada considerada (ausencia, feriado) no puede ser tarde. Para no
duplicar la regla de margen, el predicado de "fuera de margen de apertura" se extrae
a un helper compartido (exportado desde `jornada.js` o `situacion-dia.js`) y ambos
módulos lo consumen.

**Alternativas consideradas**:
- *Contar tarde sobre la fichada real original ignorando correcciones*: rechazada en
  la clarificación del spec (sesión 2026-07-18).
- *Reutilizar `calcularSituacionHoy` con `ahora` = fin del día*: rechazada —
  `situacion-dia` es una proyección de "día en curso" (ESPERANDO/AUSENTE dependen de
  la hora actual); forzarla día por día para un período entero acopla dos vistas con
  semánticas distintas. Solo se comparte el predicado de margen.

## §3. Quincenales: una fila mensual, tramos visibles solo en el detalle

**Decisión**: para modalidad quincenal, `calcularEmpleado` devuelve dos resúmenes
(Q1 y Q2); `calcularResumenPeriodo` **suma ambos tramos en una única fila mensual**
(el período se selecciona a nivel `YYYYMM`, spec Assumptions) concatenando sus
`jornadas` para el detalle, donde cada día conserva su fecha (el tramo es derivable:
día ≤15 → Q1). Sin selector de quincena en esta versión.

**Alternativas consideradas**:
- *Una fila por tramo (dos filas por empleado quincenal)*: rechazada — rompe la
  invariante "una fila por empleado" del spec (FR-001) y complica la comparación
  visual entre empleados de distinta modalidad.

## §4. Superficie API: dos GET de solo lectura

**Decisión**: nuevo `src/web/api/resumen-periodo-handlers.js` con:

- `GET /api/resumen-periodo?periodo=YYYYMM` → vista completa: `periodos` disponibles
  (`repo.listarPeriodos()`, para el selector), `periodo` efectivo (query o el más
  reciente, FR-002) y `filas[]` de acumulados. Períodos sin calendario → 404
  `CALENDARIO_NO_GENERADO` (mismo código que 007/008).
- `GET /api/resumen-periodo/{legajo}?periodo=YYYYMM` → detalle día por día del
  empleado para el diálogo (US2). Se pide bajo demanda al abrir el diálogo, en vez de
  embutir el detalle de 500 empleados × 31 días en la respuesta del resumen.

El universo de legajos es el del snapshot vigente del padrón (mismo
`activeEmployeesProvider` del contexto web de 010) — Clarifications: el universo
histórico exacto llegará con el registro de cierre de período (FR-012).

**Alternativas consideradas**:
- *Un único GET con el detalle embebido por empleado*: rechazada — payload
  innecesariamente grande (≈500×31 jornadas) para una pantalla cuyo caso típico abre
  el detalle de pocos empleados.
- *Reutilizar `GET /api/fichadas-hoy?fecha=` iterando los días desde el frontend*:
  rechazada — N×31 requests, la agregación quedaría en el cliente (contra Principio I)
  y la coherencia fila↔detalle (SC-002) sería incomprobable en el servidor.

## §5. UI: página con selector, tabla y diálogo reutilizando `Dialogo`

**Decisión**: pestaña nueva "Resumen período" en `App.jsx` (mismo patrón de pestañas
sin librería de ruteo). `PaginaResumenPeriodo` carga la vista al montar (período más
reciente), `SelectorPeriodo` cambia el período recargando la vista (US3, sin recargar
la aplicación), `TablaResumenPeriodo` es presentación pura con fila clickeable, y
`DialogoDetalleEmpleado` pide el detalle al cliente y lo muestra dentro del `Dialogo`
modal de 010 iteración 2 (Escape / clic fuera / botón cerrar — FR-006 cubierto por el
componente ya testeado).

**Alternativas consideradas**:
- *Expandir la fila inline (accordion) en vez de diálogo*: rechazada — el pedido del
  usuario dice explícitamente "se abre dialog con detalle", y el patrón modal ya
  existe y está testeado.

## §6. Rendimiento (SC-004: 500 empleados < 10 s)

**Decisión**: el handler calcula los legajos **secuencialmente** reutilizando
`calcularEmpleado` (O(días) por legajo, dominado por lecturas de archivo ya cacheables
por el provider). Con los volúmenes reales (~80 legajos, meses de 31 días) el cálculo
completo está muy por debajo del presupuesto; si una medición con 500 legajos lo
excede, la optimización local es cachear la carga de calendario/correcciones/pausas
por período dentro de la request (hoy se re-leen por legajo), sin cambiar contratos.
Se valida con el test de performance del quickstart antes de optimizar.

**Alternativas consideradas**:
- *Precálculo/caché persistente del resumen*: rechazada (spec Assumptions) — agrega
  invalidación (correcciones de 010 mutan el período abierto) sin necesidad
  demostrada.

## §7. Cambios post-entrega (2026-07-20): quincena configurable y hora real en el detalle

**Decisión 1 — granularidad configurable (FR-013)**: se agrega `PRESENTISMO_RESUMEN_PERIODO`
(`.env`, `MENSUAL` default | `QUINCENAL`, valor inválido aborta el arranque en
`wiring.js`). En `QUINCENAL`, `resumen-periodo-handlers.js` expande cada mes generado a
`YYYYMM-Q1`/`YYYYMM-Q2` (reutilizando `Tramo`/`recortar` de `periodo-liquidacion.js`, 004
§6) y el default pasa a ser la quincena en curso. Se agregó `fechaEnTramo(fecha, tramo)`
a `periodo-liquidacion.js` (el resto del dominio trabajaba con `dd` del calendario, no con
fechas ISO sueltas) para recortar `resumen.jornadas` por tramo en
`calcularResumenPeriodo(periodo, legajos, hoy, { tramo })`. El recorte es institucional:
aplica a todos los legajos por igual, sea cual sea su modalidad (Mensual/Quincenal) — no
hay que confundir el tramo de VISUALIZACIÓN de esta pantalla con el tramo de CÁLCULO de
la modalidad quincenal (research §3), aunque reutilizan el mismo `Tramo`/`recortar`.
`periodo=YYYYMM` (mes completo) se sigue aceptando en ambos modos; `YYYYMM-Q1/Q2` en modo
`MENSUAL` → 400 `PERIODO_INVALIDO`.

**Alternativas consideradas**:
- *Parámetro por request en vez de variable de entorno*: rechazada — el pedido fue
  "agregar parámetro configurable en .env", y la granularidad es una decisión de
  instalación (RRHH liquida mensual o quincenal), no algo que cada consulta deba poder
  cambiar.

**Decisión 2 — entrada/salida del detalle: hora real, no efectiva (spec Clarifications
2026-07-20)**: `proyectarResumenPeriodo`/`detalleDeJornada` (`resumen-periodo.js`)
exponían `jornada.entradaEfectiva`/`salidaEfectiva` (la hora ajustada por el margen de
tolerancia, uso interno para calcular horas). Se pidió que el detalle muestre la hora que
la persona realmente fichó — o la corregida, si hay corrección vigente —, igual criterio
que `construirFilaFichadaHoy` (010). Se agregaron `entradaConsiderada`/
`salidaConsiderada` (misma regla que ya usaba `esLlegadaTarde` para la entrada) y se
reemplazó el campo `entrada`/`salida` del detalle por su resultado; el cálculo de horas
trabajadas no cambia (sigue usando las efectivas internamente).

**Nota — bug relacionado descubierto en esta sesión**: verificando datos reales tras
estos dos cambios, se detectó que días con corrección vigente que completaba una jornada
`Incompleta` (solo fichada de entrada) seguían contando como `Incompleta` en vez de
`Completa`. La causa no estaba en esta feature sino en `aplicarAjustes` (004/010, ver
`specs/004-dominio-presentismo/research.md` §7); el fix ahí beneficia automáticamente los
contadores de esta pantalla sin cambios en `resumen-periodo.js`.
