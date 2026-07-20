# Quickstart: Justificación de Ausencias

Valida end-to-end las 3 historias del spec sobre el entorno local ya usado por
004/010/011 (repo file-based, sin Oracle ni reloj real).

## Prerrequisitos

- Node.js ≥20, dependencias instaladas (`npm install` en la raíz y en `frontend/`).
- `config/motivos-ausencia.json` presente (copiar de `motivos-ausencia.example.json`
  si no existe) con el catálogo por defecto de 9 motivos.
- Al menos un período con calendario generado (004/007) que incluya: un día pasado
  `Laborable` sin ninguna fichada de un legajo, un día pasado `Laborable` con
  fichadas de otro legajo, y varios días futuros (para probar la carga por rango).
- Snapshot local del padrón con 2-3 legajos con categoría configurada (mismo setup
  que 004/010/011).

## Escenario 1 — Registrar la Justificación de un día (US1)

1. `GET /api/motivos-ausencia` → **200** con los 9 motivos por defecto, cada uno con
   su `tipoPago`.
2. `POST /api/justificaciones` con el legajo y la fecha del día pasado sin fichadas,
   `motivoId: "enfermedad"`.
3. **Esperado**: **200**, `registradas` incluye ese día con `tipoPago: "Paga"`.
4. Repetir sobre otro legajo/día con `motivoId: "sin_aviso"`. **Esperado**:
   `tipoPago: "No paga"`.
5. `POST /api/justificaciones` sin `motivoId` → **400** `JUSTIFICACION_INVALIDA`.
6. `POST /api/justificaciones` sobre el día pasado que **tiene** fichadas → **409**
   `JUSTIFICACION_NO_APLICABLE` (`CON_FICHADAS`).
7. `POST /api/justificaciones` sobre un día `No Laborable`/`Feriado` del calendario →
   **409** `JUSTIFICACION_NO_APLICABLE` (`NO_LABORABLE`).

## Escenario 2 — Carga por rango de días futuros (US1, FR-003a)

1. `POST /api/justificaciones` con `fecha` = próximo lunes, `hasta` = viernes de esa
   misma semana, `motivoId: "vacaciones"`, sobre un legajo sin Justificación previa
   en ese rango.
2. **Esperado**: **200**, `registradas` tiene los 5 días `Laborable` de lunes a
   viernes; si el rango incluía sábado/domingo, no aparecen ni en `registradas` ni en
   `noAplicables` (se omiten en silencio).
3. Repetir el mismo `POST` una segunda vez sobre el mismo rango. **Esperado**:
   `registradas: []`, `noAplicables` lista los 5 días con `razon: "YA_JUSTIFICADO"`
   (no rompe, informa).
4. `GET /api/resumen-periodo/{legajo}` para el período que contiene esos días futuros
   una vez que el período los incluya en su cálculo. **Esperado**: cada día muestra
   `justificacion: { motivoId: "vacaciones", tipoPago: "Paga" }` y acredita la
   jornada esperada como cumplida (FR-013) — comparar `horasEsperadas` antes/después
   de justificar para confirmar que no bajó por esos días.

## Escenario 3 — Revertir una Justificación (US3)

1. Sobre uno de los días del Escenario 1, `DELETE /api/justificaciones` con el mismo
   legajo/fecha. **Esperado**: **200** `{ fecha, revertida: true }`.
2. `GET /api/resumen-periodo/{legajo}` para ese día. **Esperado**: ya no aparece
   `justificacion` vigente para ese día (vuelve a `Sin fichadas` sin motivo).
3. `DELETE /api/justificaciones` de nuevo sobre el mismo día → **404**
   `JUSTIFICACION_NO_ENCONTRADA`.
4. Volver a `POST /api/justificaciones` sobre ese mismo día con otro motivo.
   **Esperado**: **200** — revertir habilita cargar un motivo nuevo (FR-009).

## Escenario 4 — Consultar motivo y clasificación en la UI (US2)

1. En la UI (`npm run web` + frontend), abrir la tabla de fichadas de hoy o el
   resumen del período con al menos un día justificado.
2. **Esperado**: el día muestra el motivo (`Vacaciones`, `Enfermedad`, etc.) y una
   marca visual de `Paga`/`No paga`; el botón "Justificación" está disponible en
   días `Sin fichadas`/futuros y deshabilitado en días con fichadas.
3. Abrir `FormularioJustificacion.jsx`, confirmar sin seleccionar motivo → el botón
   Guardar permanece deshabilitado (mismo patrón que `FormularioCorreccion.jsx`).

## Verificación transversal — fichadas tardías sobre un día justificado (edge case)

1. Con el día del Escenario 1 revertido en el Escenario 3, volver a justificarlo.
2. Cargar (vía el mecanismo de importación de fichadas de 004) una fichada real para
   ese legajo/día.
3. `GET /api/resumen-periodo/{legajo}`. **Esperado**: el día queda señalado para
   revisión (mismo campo que ya usa 004 para correcciones invalidadas por
   recálculo), sin que la Justificación ni la fichada se descarten en silencio.

## Verificación de rendimiento (SC-001)

- Medir `POST /api/justificaciones` para un rango de 31 días (un mes completo).
  **Esperado**: respuesta en <500 ms.

## Resultado de ejecución (T034 — 2026-07-20)

Suites automatizadas: **465/465 PASS** backend (`node --test`: unit + contract +
integration, incluidos `presentismo-justificacion.test.js`,
`presentismo-motivos-ausencia-config.test.js`, `web-api-justificaciones.test.js`,
`justificacion.integration.test.js` y las extensiones de `presentismo-jornada`,
`presentismo-resumen`, `presentismo-resumen-periodo`, `web-api-resumen-periodo`,
`presentismo-ports.contract`) + **97/97 PASS** frontend (`vitest run`, 22 archivos,
incluidos `FormularioJustificacion.test.jsx` y las extensiones de
`TablaFichadasHoy`/`TablaResumenPeriodo`/`DialogoDetalleEmpleado`/`PaginaFichadasHoy`).
Sin regresiones en 001–011.

Escenarios verificados manualmente sobre la app real (`npm run web` + `npm run dev`
del frontend con proxy `/api`, datos reales del repo — padrón de 12 empleados,
calendario de julio/junio 2026 — navegador real):

| Escenario | Resultado |
|-----------|-----------|
| 1 — Botón "Justificación" visible en fila `AUSENTE` (legajo 35, VILLAR JOSE); diálogo precarga legajo y fecha del día mostrado; catálogo de 9 motivos cargado desde `config/motivos-ausencia.json` real | PASS |
| 1 — `POST /api/justificaciones` con `motivoId: "vacaciones"` → fila pasa a `9:00` horas, `AUSENTE (Vacaciones, Paga)`, botón cambia a "Revertir justificación" | PASS |
| 2 — "Resumen período": columnas `Feriado`/`Licencia` nuevas junto a las 7 existentes; fila del legajo justificado muestra `Licencia: 1` y horas totales con el crédito (`27:00` con 2 días completos + 1 Paga) | PASS |
| 2 — Detalle por empleado (clic en la fila): día `2026-07-20` muestra `Sin fichadas (Vacaciones, Paga)` con `9:00` | PASS |
| 3 — "Revertir justificación" → `DELETE /api/justificaciones` **200**; fila vuelve a `AUSENTE` sin motivo, horas a `0:00`, botón vuelve a ofrecer "Justificación" | PASS |

Bug encontrado y corregido durante esta verificación manual (no cubierto por los tests
automatizados originales): el botón de fila "Justificación" precargaba `fila.fecha`,
pero `FilaFichadaHoy` no trae ese campo (solo `estado.vista.fecha` a nivel página) —
la fecha quedaba vacía en el formulario. Corregido en `PaginaFichadasHoy.jsx`
(`onJustificar={(fila) => abrirJustificacion({ ...fila, fecha: estado.vista.fecha })}`)
y cubierto con una prueba de regresión en `PaginaFichadasHoy.test.jsx`.

Escenarios 3 (rango de días futuros con `incluirMesSiguiente`) y la verificación
transversal de fichadas tardías se validaron mediante las suites de integración
(`justificacion.integration.test.js`), no repetidos manualmente por requerir
mutar el archivo de fichadas del período en caliente.
