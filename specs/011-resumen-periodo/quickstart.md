# Quickstart: Página "Resumen del Período"

Valida end-to-end las 3 historias del spec sobre el entorno local ya usado por
007/008/010 (repo file-based, sin Oracle ni reloj real).

## Prerrequisitos

- Node.js ≥20, dependencias instaladas (`npm install` en la raíz y en `frontend/`).
- Al menos dos períodos con calendario generado (features 007/008), uno de ellos el
  mes en curso.
- Snapshot local del padrón con 3-4 legajos con categoría configurada y uno sin
  categoría (anomalía), mismo setup que 004/010.
- Fichadas cargadas en el archivo de al menos un período: un empleado con jornadas
  completas, uno con una entrada fuera de margen (tarde), uno con un día laborable
  sin fichadas (ausencia) y uno con entrada sin salida (incompleta).
- Al menos una corrección, una pausa intermedia y un retiro anticipado cargados vía
  la API de 010.

## Escenario 1 — Resumen del período (US1)

1. `GET /api/resumen-periodo` (sin query).
2. **Esperado**: **200** con `periodo` = el más reciente generado, `periodos` con
   todos los generados, y una fila por legajo del padrón con los 7 acumulados
   (`horasTrabajadas`, `completas`, `incompletas`, `ausencias`, `llegadasTarde`,
   `retirosAnticipados`, `correcciones`).
3. Verificar contra los datos cargados: el empleado tarde suma 1 en
   `llegadasTarde`; el del día sin fichadas suma 1 en `ausencias`; el de entrada sin
   salida suma 1 en `incompletas`; el legajo sin categoría viene con `anomalia` y
   acumulados en 0.
4. Corregir vía 010 la entrada del empleado tarde a un horario dentro del margen y
   repetir el `GET`. **Esperado**: `llegadasTarde` baja a 0 para ese legajo y
   `correcciones` sube a 1 (la corrección prevalece, Clarifications).
5. Con el período en curso seleccionado, verificar que los días futuros del mes no
   suman ausencias (FR-008).

## Escenario 2 — Detalle de un empleado (US2)

1. `GET /api/resumen-periodo/{legajo}` para el empleado con pausa y retiro cargados.
2. **Esperado**: **200** con `dias[]` ordenados por fecha, solo días vencidos; el día
   corregido viene con `corregida: true`; el retiro anticipado aparece en `pausas`
   con `tipo: 'retiro_anticipado'`, distinguible de la pausa intermedia.
3. Verificar SC-002: `Σ dias[].horas` = `horasTrabajadas` de la fila del resumen, y
   los conteos de la fila coinciden con los derivables de `dias[]`.
4. En la UI: clic en la fila abre el diálogo modal (`role="dialog"`); Escape, clic
   fuera y el botón cerrar lo cierran sin efecto (FR-006).
5. `GET /api/resumen-periodo/{legajo-sin-categoria}` → **409**
   `EMPLEADO_SIN_CATEGORIA`; en la UI la fila con anomalía no abre diálogo.

## Escenario 3 — Cambiar de período (US3)

1. En la UI, cambiar el selector al otro período generado.
2. **Esperado**: la tabla se actualiza con los acumulados de ese período sin recargar
   la aplicación (SC-003).
3. Seleccionar (vía API) un período sin calendario: `GET
   /api/resumen-periodo?periodo=<inexistente>` → **404** `CALENDARIO_NO_GENERADO`;
   la UI no lo ofrece en el selector.
4. Con un período con calendario pero sin fichadas: **Esperado**: filas con
   acumulados en 0 y las ausencias que dicte el calendario (días laborables
   vencidos).

## Verificación transversal — solo lectura (SC-005)

- Tomar hash/copia de `data/presentismo/<periodo>.json` y del archivo de fichadas
  antes de los escenarios; al terminar, verificar que ningún archivo cambió: 0
  escrituras originadas por esta pantalla.

## Verificación de rendimiento (SC-004)

- Con un padrón sintético de 500 legajos (fixture), medir `GET /api/resumen-periodo`
  del período con más datos: **Esperado**: respuesta en <10 s.

## Resultado de ejecución (T025-T026 — 2026-07-18)

Suites automatizadas: **93/93 PASS** (13 backend en
`tests/contract/web-api-resumen-periodo.test.js` +
`tests/integration/resumen-periodo.integration.test.js` incluido el test de
rendimiento, 9 unit de `presentismo-resumen-periodo.test.js`, y 12 archivos /
83 tests de frontend). Suite completa del repo: 408 backend + 83 frontend,
sin regresiones.

Escenarios 1-3 verificados manualmente sobre la app real (`npm run web` +
build de Vite, datos reales del repo, navegador):

| Escenario | Resultado |
|-----------|-----------|
| 1 — Tabla con 12 empleados y 7 indicadores por fila (horas, completas, incompletas, ausencias, tarde, retiros, correcciones) | PASS |
| 2 — Clic en fila abre diálogo modal (`role="dialog"`) con detalle día por día | PASS |
| 2 — Escape cierra el diálogo sin efecto | PASS |
| 3 — Selector de período (5 meses generados, más reciente por defecto) cambia la tabla sin recargar la app | PASS |

Rendimiento (SC-004): 500 legajos sintéticos → **748 ms** (test automatizado),
muy por debajo del presupuesto de 10 s; no hizo falta la optimización de
research.md §6.
