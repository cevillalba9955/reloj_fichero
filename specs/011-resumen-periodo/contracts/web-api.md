# Contrato: API web `/api/resumen-periodo*`

Mismo estilo que los contratos de 008/010: router propio (`src/web/api/router.js`),
errores uniformes `{ error: { codigo, mensaje } }` vía `ApiError`. Rutas registradas
en `src/web/api/resumen-periodo-handlers.js` con `registrarRutas(router, ctx)`; `ctx`
es el contexto web existente (`repo`, `service`, `activeEmployeesProvider`,
`categoryProvider`, `logger`). **Ambos endpoints son de solo lectura** (FR-010): no
existe ningún POST/PUT/DELETE en esta feature.

## `GET /api/resumen-periodo`

Devuelve la `VistaResumenPeriodo` (data-model.md) del período pedido.

Query:
- `periodo` (opcional, `YYYYMM`): por defecto, el período más reciente con calendario
  generado (FR-002).

Respuestas:
- **200** `VistaResumenPeriodo` — incluye `periodos` (para el selector), el `periodo`
  efectivo y `filas[]` ordenadas por legajo. Un empleado sin categoría configurada va
  con `anomalia` y acumulados en 0 (FR-007), sin abortar la vista.
- **400** `PERIODO_INVALIDO` — formato distinto de `YYYYMM`.
- **404** `CALENDARIO_NO_GENERADO` — el período pedido no tiene calendario (también
  cuando no existe ningún período generado y no hay default posible).
- **500** `ERROR_CALCULANDO_RESUMEN` — fallo de cálculo no atribuible a un legajo
  (los fallos por legajo individual se reflejan como `anomalia` en su fila).

Padrón vacío o no disponible → **200** con `filas: []` (mismo criterio best-effort
que `GET /api/fichadas-hoy`).

## `GET /api/resumen-periodo/{legajo}`

Devuelve la `VistaDetalleEmpleado` (data-model.md) para el diálogo de detalle (US2).

Query:
- `periodo` (opcional, `YYYYMM`): mismo default y validación que el GET anterior.

Respuestas:
- **200** `VistaDetalleEmpleado` — `dias[]` ordenados por fecha ascendente, solo días
  vencidos (`fecha <= hoy` del servidor, FR-008), con horas en `'HH:MM'`.
- **400** `PERIODO_INVALIDO` / `LEGAJO_INVALIDO`.
- **404** `CALENDARIO_NO_GENERADO`.
- **409** `EMPLEADO_SIN_CATEGORIA` — el legajo existe pero no tiene categoría de
  presentismo configurada (no hay detalle calculable; la UI no ofrece abrir el
  diálogo en filas con anomalía).

## Invariantes de contrato (verificadas por tests)

- Coherencia fila↔detalle (SC-002): para cualquier legajo sin anomalía,
  `Σ dias[].horas === fila.horasTrabajadas` y los conteos de la fila coinciden con
  los derivables de `dias[]`.
- Solo lectura (SC-005): ningún GET altera los archivos de período (se verifica
  comparando el estado persistido antes/después en el test de integración).
- Sin `rawHex` ni datos biométricos en ninguna respuesta (FR-011).
- Horas hacia el cliente siempre `'HH:MM'` (entrada/salida/pausas) o minutos entero
  (`horasTrabajadas`/`horas`), mismo criterio que 010.
