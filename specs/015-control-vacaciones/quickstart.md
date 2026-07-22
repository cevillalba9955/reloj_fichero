# Quickstart: Control de Vacaciones Anual

Valida end-to-end las 4 historias del spec sobre el entorno local file-based
ya usado por 004/011/012/013 (sin Oracle real ni reloj real).

## Prerrequisitos

- Node.js ≥20, dependencias instaladas (`npm install` en la raíz y en
  `frontend/`).
- `config/vacaciones.json` presente (copiar de `vacaciones.example.json` si
  no existe) con la escala LCT por defecto y `incrementoAnual` apuntando a
  una fecha de prueba cercana (para poder ejercitar US3 sin esperar al 1° de
  noviembre real).
- `config/motivos-ausencia.json` con la entrada `vacaciones` deshabilitada
  (`activo: false`) tras el despliegue de esta feature (FR-018).
- Al menos dos períodos consecutivos con calendario generado (004/007/008),
  para poder probar una asignación que cruce de un período a otro.
- Padrón local (`data/presentismo/padron.json`) con 2-3 legajos activos, al
  menos uno con `fechaIngreso` cargada y otro con `fechaIngreso: null`
  (simula un legajo pendiente de completar el dato, edge case de US2).

## Escenario 1 — Asignar vacaciones y ver el saldo/calendario reflejarlo (US1)

1. `GET /api/vacaciones` → **200**, el legajo con `fechaIngreso` muestra
   `antiguedadAnios` y `saldo` (`0` si nunca tuvo un incremento).
2. Para poder asignar con saldo positivo, forzar un incremento: ajustar
   `config/vacaciones.json` con `incrementoAnual` en una fecha ya pasada y
   volver a llamar `GET /api/vacaciones` (el cómputo perezoso lo aplica,
   research.md §4). **Esperado**: `saldo` refleja los días de la escala
   según la antigüedad del legajo.
3. `POST /api/vacaciones/asignaciones` con `fechaInicio` = un lunes futuro y
   `cantidadDias` = 10 (cruza sábado/domingo). **Esperado**: **200**,
   `saldoResultante` = saldo previo − 10.
4. `GET /api/resumen-periodo/{legajo}` para el período de esos días.
   **Esperado**: los 10 días (incluidos el/los fines de semana del rango)
   aparecen con `justificacion: { motivoId: "vacaciones-anual", tipoPago:
   "No paga" }` y suman a `ausencias`, nunca a `licencia`.
5. Repetir el `POST` sobre un rango que se solape con el ya asignado.
   **Esperado**: **409** `VACACIONES_SUPERPUESTA`, listando las fechas en
   conflicto; nada queda registrado a medias.

## Escenario 2 — Asignación que cruza de período (US1, FR-005)

1. `POST /api/vacaciones/asignaciones` con un rango que empieza en los
   últimos días de un período y termina en los primeros del siguiente.
   **Esperado**: **200** único (no se corta la asignación).
2. `GET /api/resumen-periodo/{legajo}` en **ambos** períodos. **Esperado**:
   cada uno muestra los días de vacaciones que le corresponden dentro de su
   propio mes.
3. Repetir el `POST` apuntando a un rango donde el período siguiente **no**
   tiene calendario generado todavía. **Esperado**: **404**
   `CALENDARIO_NO_GENERADO`, sin registrar ningún día (todo o nada).

## Escenario 3 — Incremento automático anual (US3)

1. Con `incrementoAnual` de `config/vacaciones.json` en una fecha ya
   pasada y un legajo con `fechaIngreso` tal que le correspondan 21 días
   (5–10 años de antigüedad a esa fecha), llamar `GET /api/vacaciones/
   {legajo}`. **Esperado**: `movimientos` incluye un `tipo: "incremento"`
   con `dias: 21` y `antiguedadAnios` coherente.
2. Volver a llamar el mismo `GET`. **Esperado**: el incremento **no** se
   duplica (idempotencia vía `ultimoIncrementoAplicado`).
3. Cambiar la escala en `config/vacaciones.json` a un valor sin el tramo
   `aniosMinimos: 0` y reiniciar. **Esperado**: el servidor rechaza la
   configuración al arranque (fail-fast, mismo criterio que 012/014).
4. Sobre un legajo con `fechaIngreso: null`, llamar `GET /api/vacaciones`.
   **Esperado**: aparece con `pendienteFechaIngreso: true`, sin
   `antiguedadAnios` ni incremento aplicado, sin bloquear el resto de la
   respuesta.

## Escenario 4 — Revertir una asignación (US4)

1. Sobre la asignación creada en el Escenario 1, `DELETE /api/vacaciones/
   asignaciones/{id}`. **Esperado**: **200**, `saldoResultante` vuelve al
   valor previo a la asignación.
2. `GET /api/resumen-periodo/{legajo}` para esos días. **Esperado**: ya no
   aparece `justificacion` vigente (vuelven a `Sin fichadas`).
3. Repetir el `DELETE` sobre el mismo `id`. **Esperado**: **404**
   `VACACIONES_NO_ENCONTRADA`.
4. `DELETE /api/justificaciones` apuntando directamente a uno de los días
   que generó una asignación **todavía vigente** (antes de revertirla).
   **Esperado**: **409** `JUSTIFICACION_ES_VACACIONES`, indicando que debe
   revertirse desde `/api/vacaciones/asignaciones/{id}`.

## Escenario 5 — Página de control de vacaciones anual (UI, US1/US2)

1. Abrir la sección "Vacaciones" del sidebar (`AppShell.jsx`).
2. **Esperado**: tabla con un legajo por fila (antigüedad, saldo, próximo
   incremento; el legajo sin `fechaIngreso` se ve señalado como pendiente).
3. Usar el formulario de asignación (fecha de inicio + cantidad de días)
   sobre un legajo con saldo positivo. **Esperado**: tras confirmar, la fila
   de ese legajo actualiza su saldo sin recargar toda la página.
4. Abrir el historial de un legajo con movimientos. **Esperado**: se ve cada
   incremento/asignación/reversión con fecha, días y saldo resultante en
   ese momento (US2, Acceptance Scenario 2).
