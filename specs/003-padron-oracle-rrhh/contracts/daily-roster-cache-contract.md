# Contrato: `DailyCachedActiveEmployeesProvider` (política diaria del padrón)

**Motivo**: FR-007/FR-008/FR-011/FR-014 de [spec.md](../spec.md) y
Clarifications (sesión 2026-07-08). Archivo:
`src/roster/daily-cached-active-employees-provider.js`.

**Supersede** la nota "Fuera de alcance / cachear entre ciclos" del
contrato de la feature 002
([roster-provider-contract.md](../../002-servicio-fichadas-programado/contracts/roster-provider-contract.md)):
aquella lo dejaba como optimización futura; FR-014 de esta feature lo
convierte en requisito. La **interfaz** de aquel contrato no cambia.

## Interfaz

```text
createDailyCachedActiveEmployeesProvider({ inner, now?, logger? }) -> ActiveEmployeesProvider
```

- `inner`: cualquier `ActiveEmployeesProvider` (en esta feature, el de
  Oracle). El decorator cumple exactamente el mismo contrato que decora:
  `getActiveEmployees() -> Promise<Empleado[]>` — el servicio 002 no
  distingue si está o no (FR-001/FR-006).
- `now`: inyectable para tests (default `() => new Date()`); define el
  "día de servicio" (`YYYY-MM-DD` local).
- `logger`: `roster-fetch-logger` (FR-010); opcional en tests.

## Comportamiento obligatorio

| Situación | Resultado | Evento de log |
|---|---|---|
| Primera llamada del día, `inner` responde con ≥1 legajo | devuelve el padrón fresco y lo fija como snapshot del día | `padron_fresco` |
| Llamadas siguientes del mismo día con snapshot del día ya fijado | devuelve el snapshot **sin llamar a `inner`** (FR-014) | — (ninguno) |
| `inner` falla y HAY snapshot previo (de hoy o de días anteriores) | devuelve el último snapshot válido | `padron_error` + `padron_respaldo` (con `obtenidoEn` del snapshot) |
| `inner` falla y NO hay snapshot previo | rechaza con `RosterNoDisponibleError` (FR-007) | `padron_error` |
| `inner` responde vacío (0 legajos) | igual que "inner falla" (FR-011): respaldo o rechazo; el vacío NUNCA se fija como snapshot ni consume el éxito del día | `padron_vacio` (+ `padron_respaldo` si aplica) |
| Fallo/vacío en la primera llamada, luego otra llamada el mismo día | REINTENTA contra `inner` (el éxito diario aún no ocurrió — FR-014) | según resultado |
| Cambio de día de servicio | vuelve a consultar `inner` en la primera llamada del nuevo día; el snapshot anterior queda como respaldo | según resultado |

Reglas adicionales:
- Nunca devuelve `[]` como sustituto de un error (regla heredada 002).
- Estado solo en memoria: tras un reinicio no hay respaldo (spec,
  Assumptions).
- Reentrada: si dos llamadas del mismo tick llegan mientras la consulta a
  `inner` está en vuelo, comparten la misma promesa (no se disparan dos
  consultas a Oracle por carrera).

## Tests exigidos (antes de implementar)

Uno por fila de la tabla de comportamiento (con `now()` falso para
simular cambio de día), más: no-reentrada (dos llamadas concurrentes → un
solo `inner.getActiveEmployees()`), y verificación de eventos de log
emitidos en cada caso.
