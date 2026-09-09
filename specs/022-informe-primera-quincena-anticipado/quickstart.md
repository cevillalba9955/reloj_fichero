# Quickstart: Informe de la Primera Quincena antes del Cierre del Mes

**Feature**: 022-informe-primera-quincena-anticipado | **Date**: 2026-09-09

Guía de validación end-to-end. Asume el repo ya clonado y las dependencias
instaladas (`npm install` en la raíz y en `frontend/`).

## Prerrequisitos

- Node.js ≥ 20.12.
- Instalación en modo **QUINCENAL**: `PRESENTISMO_RESUMEN_PERIODO=QUINCENAL` en
  `.env` (la feature no aplica en MENSUAL).
- Un mes con calendario generado y fichadas/correcciones cargadas para los días
  1–15, cuyo período **no** esté cerrado y cuya primera quincena **ya haya
  terminado** (fecha del servidor posterior al día 15 de ese mes). Los fixtures
  de `tests/` fijan `hoy` para los tests automáticos.

## 1. Tests automatizados (rápido)

```bash
# Backend: contrato del informe de cierre, incluye los casos nuevos de emisión anticipada de Q1
node --test tests/contract/web-api-informe-cierre.test.js

# Backend: unit del helper de dominio
node --test tests/unit

# Frontend: acción del informe en "Resumen del Período" (modo anticipado)
cd frontend && npx vitest run src/components/AccionInformeCierre.test.jsx src/components/PaginaResumenPeriodo.test.jsx
```

**Esperado**: verde. Los casos 19–31 de `contracts/web-api.md` cubren la
emisión anticipada de Q1 sobre período abierto, `409 QUINCENA_EN_CURSO`,
`409 PERIODO_ABIERTO` para tramos no elegibles, la marca `anticipado`, el
cuadre contra "Resumen del Período", el reemplazo al cerrar y que emitir el
anticipado no bloquea correcciones.

## 2. Validación manual por API (modo QUINCENAL)

Levantar el servicio: `npm run web` (usa `.env`).

```bash
BASE=http://localhost:3000/api
PER=202607          # mes con calendario generado, período ABIERTO, Q1 ya terminada

# 2.1 Emitir el informe de la primera quincena (rol editor) SIN cerrar el mes
curl -s -X POST "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" \
  -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"autor":"ana"}' | npx --yes json -e 'this.sello.tramo, this.sello.anticipado, this.sello.modo'
#   → "Q1"  true  "manual"

# 2.2 Leer la copia anticipada
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" | \
  npx --yes json -e 'this.sello.anticipado, this.obsoleto, this.resumen.encabezado.rangoFechas'
#   → true  false  { desde: "2026-07-01", hasta: "2026-07-15" }

# 2.3 Cuadre contra "Resumen del Período" (misma quincena, mismo momento)
curl -s "$BASE/resumen-periodo?periodo=$PER-Q1" > /tmp/rp-q1.json
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" > /tmp/inf-q1.json
# Verificar: para cada legajo, horasTrabajadas y cada contador de inf-q1
# coinciden con la fila del mismo legajo en rp-q1.

# 2.4 La primera quincena aún NO terminó → no se puede emitir anticipado
#     (probar con un PER cuyo mes sea el de hoy y hoy <= día 15)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$BASE/calendarios/<PER_Q1_EN_CURSO>/informe-cierre?tramo=Q1" -H 'x-apex-rol: editor'   # → 409 (QUINCENA_EN_CURSO)

# 2.5 Q2 anticipada NO existe
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$BASE/calendarios/$PER/informe-cierre?tramo=Q2" -H 'x-apex-rol: editor'   # → 409 (PERIODO_ABIERTO)

# 2.6 Rol lector NO puede emitir; sí puede leer una copia ya emitida
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" -H 'x-apex-rol: lector'   # → 403
curl -s -o /dev/null -w '%{http_code}\n' \
  "$BASE/calendarios/$PER/informe-cierre?tramo=Q1"                           # → 200

# 2.7 Emitir el anticipado NO bloquea correcciones sobre los días 1–15
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/correcciones" \
  -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"periodo":"'"$PER"'","legajo":123,"fecha":"2026-07-08","entrada":"08:00","salida":"16:00","autor":"ana"}'   # → 200/201

# 2.8 Cerrar el mes → la copia de Q1 pasa a ser la de cierre (anticipado=false)
curl -s -X POST "$BASE/calendarios/$PER/cerrar" -H 'x-apex-rol: editor' -d '{"autor":"ana"}'
curl -s "$BASE/calendarios/$PER/informe-cierre?tramo=Q1" | \
  npx --yes json -e 'this.sello.anticipado, this.sello.modo'   # → false  "automatico"
```

## 3. Validación manual por UI

1. `cd frontend && npm run dev`; abrir la app y entrar a **Resumen del
   Período**.
2. Elegir un período **Q1** de un mes cuyo período **no** esté cerrado y cuya
   primera quincena **aún no terminó** → **no** aparece la acción de emisión
   anticipada (US2 escenario 1).
3. Elegir un período **Q1** de un mes abierto cuya primera quincena **ya
   terminó** → aparece el botón **"Emitir informe de la primera quincena"**
   (US2 escenario 2). Con rol editor, activarlo.
4. Tras emitir: aparecen **"Ver informe"**, **"Descargar PDF"** y
   **"Re-emitir"**, más un aviso persistente de **emisión anticipada** (el mes
   sigue abierto; las cifras pueden cambiar hasta el cierre) — US1 escenario 1,
   US3 escenario 1.
5. **Ver informe** → modal/documento con el sello (mes, tramo primera quincena,
   emisión, responsable), la marca visible "EMISIÓN ANTICIPADA", el resumen por
   empleado de los días 1–15, el detalle día por día y los pendientes
   (US1 escenarios 2 y 3, FR-008/FR-009).
6. Cargar una corrección sobre un día 1–15 (no se bloquea) y **Re-emitir** → la
   copia anticipada refleja el ajuste (US3 escenario 2, FR-011).
7. Elegir el mismo período en **Q2** o un período **mensual** (instalación
   MENSUAL) → la acción anticipada no aparece (US1 escenario 5, edge cases).
8. Con rol editor, **Cerrar período** → el informe de Q1 deja de mostrarse como
   emisión anticipada; a partir de ahí se obtiene por el flujo de cierre
   (US3 escenario 3, FR-012).

## 4. Criterios de aceptación cubiertos

| Escenario | Dónde se valida |
|-----------|-----------------|
| US1 — emitir/ver/descargar Q1 sin esperar al cierre | §2.1–2.2, §3 pasos 3–5; contract test 19–20; `AccionInformeCierre.test.jsx` |
| US1 — cifras == "Resumen del Período" para Q1 | §2.3; contract test 26 |
| US1 — modo MENSUAL: la acción no se ofrece | §3 paso 7; contract test 24 |
| US2 — Q1 debe haber terminado | §2.4, §3 paso 2; contract test 21; unit test 31 |
| US2 — período cerrado ⇒ flujo de cierre, no anticipado | §2.8, §3 paso 8; contract test 27 |
| US3 — marca visible de emisión anticipada | §3 pasos 4–5; `InformeCierreContenido` / `AccionInformeCierre` tests |
| US3 — re-emisión a demanda con el mes abierto | §2.7, §3 paso 6; contract test 28, 30 |
| US3 — al cerrar, la copia anticipada se reemplaza | §2.8; contract test 27 |
| US3 — lector no emite, sí ve | §2.6; contract test 25 |
| FR-011 — emitir no bloquea correcciones sobre Q1 | §2.7, §3 paso 6; contract test 30 |
| SC-002 / SC-003 — cuadres de horas | §2.3; contract test 26 |
| SC-006 — visibilidad de la acción según ventana | §3 pasos 2, 3, 7; contract test 29; `PaginaResumenPeriodo.test.jsx` |
