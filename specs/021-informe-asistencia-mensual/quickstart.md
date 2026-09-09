# Quickstart: Informe de Asistencia Mensual desde el Calendario

**Feature**: 021-informe-asistencia-mensual | **Date**: 2026-09-09

Guía de validación end-to-end. Asume el repo ya clonado y las dependencias
instaladas (`npm install` en la raíz y en `frontend/`).

## Prerrequisitos

- Node.js ≥ 20.12.
- Una instalación en modo **QUINCENAL** para ejercitar la unificación:
  `PRESENTISMO_RESUMEN_PERIODO=QUINCENAL` en `.env` (o variable de entorno).
- Datos de un mes con calendario generado y fichadas/correcciones cargadas
  (los fixtures de `tests/` ya cubren esto para los tests automáticos).

## 1. Tests automatizados (rápido)

```bash
# Backend: contrato del informe de cierre, incluye los casos nuevos del tramo "Mes"
node --test tests/contract/web-api-informe-cierre.test.js

# Backend: integración cerrar período → informe mensual disponible (si se agrega)
node --test tests/integration

# Frontend: página Calendario + acción del informe mensual
cd frontend && npx vitest run src/components/PaginaCalendario.test.jsx src/components/AccionInformeCierre.test.jsx
```

**Esperado**: verde. Los casos 10–18 de `contracts/web-api.md` cubren
`POST/GET ?tramo=Mes` en QUINCENAL, el cuadre `Mes == Q1 + Q2`, el acceso por
rol y que el cierre escribe los tres tramos.

## 2. Validación manual por API (modo QUINCENAL)

Levantar el servicio: `npm run web` (usa `.env`).

```bash
BASE=http://localhost:3000/api
PER=202607   # un mes con calendario generado

# 2.1 Cerrar el período (rol editor). Emite Q1, Q2 y Mes automáticamente.
curl -s -X POST "$BASE/calendarios/$PER/cerrar" \
  -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"autor":"ana"}' | head -c 400

# 2.2 Leer el informe mensual unificado
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Mes" | \
  npx --yes json -e 'this.sello.tramo, this.resumen.encabezado.rangoFechas, this.resumen.encabezado.empleados'

# 2.3 Comparar con las quincenas: Mes == Q1 + Q2 por empleado
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" > /tmp/q1.json
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Q2" > /tmp/q2.json
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Mes" > /tmp/mes.json
# Verificar manualmente: para cada fila de /tmp/mes.json, horasTrabajadas y cada
# contador == suma de la fila del mismo legajo en q1 + q2.

# 2.4 Re-emisión a demanda (rol editor)
curl -s -X POST "$BASE/calendarios/$PER/informe-cierre?tramo=Mes" \
  -H 'x-apex-rol: editor' -d '{"autor":"ana"}' | head -c 200

# 2.5 Rol lector NO puede emitir
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$BASE/calendarios/$PER/informe-cierre?tramo=Mes" -H 'x-apex-rol: lector'   # → 403

# 2.6 Reabrir → el informe mensual queda obsoleto
curl -s -X POST "$BASE/calendarios/$PER/reabrir" -H 'x-apex-rol: editor' -d '{"autor":"ana"}'
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Mes" | npx --yes json -e 'this.obsoleto'   # → true
```

## 3. Validación manual por UI

1. `cd frontend && npm run dev`; abrir la app y entrar a **Calendario**.
2. Navegar a un mes cuyo período **no** esté cerrado → **no** aparece la
   acción del informe mensual (US3 escenario 1).
3. Con rol editor, **Cerrar período** en un mes concluido.
4. Tras el cierre, en la misma página aparecen **"Ver informe"** y
   **"Descargar PDF"** del informe mensual (US1 escenario 1, US3 escenario 2).
5. **Ver informe** → modal con sello (mes, alcance mes completo, emisión,
   responsable), resumen por empleado del mes completo, detalle día por día y
   pendientes (US1 escenarios 2 y 5).
6. **Descargar PDF** → documento imprimible con el mismo contenido
   (US1 escenario 3).
7. **Reabrir período** (rol editor) → al volver a entrar, el informe mensual
   muestra el aviso "desactualizado" (US3 escenario 3).
8. Navegar a un mes **sin calendario generado** → no aparece la acción
   (US3 escenario 4).

## 4. Criterios de aceptación cubiertos

| Escenario | Dónde se valida |
|-----------|-----------------|
| US1 — ver/descargar desde Calendario con período cerrado | §3 pasos 3–6; `PaginaCalendario.test.jsx` |
| US2 — el informe mensual unifica las quincenas (`Mes == Q1+Q2`) | §2.3; contract test 12 |
| US2 — modo MENSUAL: mismo `Mes` que "Resumen del Período" | contract test 17 |
| US3 — acción sólo con período cerrado | §3 pasos 2, 3, 8; `PaginaCalendario.test.jsx` |
| US3 — reabrir marca obsoleto | §2.6, §3 paso 7; contract test (reabrir) |
| FR-009 — emisión automática al cerrar (3 tramos en QUINCENAL) | §2.1; contract test 13 |
| FR-011 / SC-009 — lector no emite, sí ve | §2.5; contract test 14 |
| SC-002 / SC-003 — cuadres de horas | contract tests 12 y 18 |
