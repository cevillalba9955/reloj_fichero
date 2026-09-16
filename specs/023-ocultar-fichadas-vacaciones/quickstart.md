# Quickstart: Ocultar Fichadas de Vacaciones en Informes Generados

**Feature**: 023-ocultar-fichadas-vacaciones | **Date**: 2026-09-16

Guía de validación end-to-end. Asume el repo ya clonado y las dependencias
instaladas (`npm install` en la raíz).

## Prerrequisitos

- Node.js ≥ 20.12.
- Un legajo con una Asignación de Vacaciones vigente (feature 015) que cubra
  al menos un día del período a informar, y con al menos una fichada de
  entrada/salida registrada por el reloj ese mismo día (caso excepcional,
  feature 015 FR-017). Los fixtures de `tests/` construyen este escenario sin
  reloj real.

## 1. Tests automatizados (rápido)

```bash
# Unit del dominio del informe: casos de ocultamiento en días de vacaciones
node --test tests/unit/presentismo-informe-cierre.test.js

# Regresión: la pantalla interactiva no cambia (features 010/011)
node --test tests/unit/presentismo-resumen-periodo.test.js

# Integración: emisión real del informe de cierre con el escenario excepcional
node --test tests/integration/informe-cierre.integration.test.js
```

**Esperado**: verde. Los casos nuevos de `presentismo-informe-cierre.test.js`
cubren: día de vacaciones con fichadas completas (oculto), con sólo entrada
(oculto), sin fichadas (sin cambios, sirve de referencia de paridad) y un día
NO vacaciones con `requiereJustificacionRevision: true` (sigue mostrando
entrada/salida, confirma que el ocultamiento es específico de vacaciones).

## 2. Validación manual por API

Levantar el servicio: `npm run web` (usa `.env`).

```bash
BASE=http://localhost:3000/api
PER=202607   # mes con calendario generado y cerrado (o abierto, para 022 con ?tramo=Q1)
LEGAJO=123   # legajo con Asignación de Vacaciones vigente y una fichada excepcional ese mes

# 2.1 Confirmar en "Resumen del Período" que la fichada excepcional sigue visible
#     (comportamiento SIN cambios de esta feature, feature 011)
curl -s "$BASE/resumen-periodo?periodo=$PER" | \
  npx --yes json -e 'this.filas.find(f => f.legajo === '"$LEGAJO"').detalle' \
  | grep -A2 '"requiereJustificacionRevision": true'

# 2.2 Emitir (o re-emitir) el informe de cierre del mismo período
curl -s -X POST "$BASE/calendarios/$PER/informe-cierre" \
  -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"autor":"ana"}' > /dev/null

# 2.3 Leer el informe y verificar que el día de vacaciones NO muestra la fichada
curl -s "$BASE/calendarios/$PER/informe-cierre" | \
  npx --yes json -e 'this.detalle.secciones.find(s => s.legajo === '"$LEGAJO"').dias' \
  | grep -B2 -A2 '"vacaciones-anual"'
#   → entrada: null, salida: null, pausas: [], requiereJustificacionRevision: false

# 2.4 Confirmar que los contadores del resumen no cambiaron
curl -s "$BASE/calendarios/$PER/informe-cierre" | \
  npx --yes json -e 'this.resumen.filas.find(f => f.legajo === '"$LEGAJO"')'
#   → misma columna `vacaciones` y `horasTrabajadas` que antes de esta feature
```

## 3. Validación manual por UI

1. `cd frontend && npm run dev`; abrir la app.
2. Ir a **Fichadas de Hoy** (o navegar al día excepcional) y a **Resumen del
   Período** → detalle del legajo: en ambas, el día de vacaciones con la
   fichada excepcional sigue mostrando la hora fichada y la señal de revisión,
   igual que antes de esta feature (Historia 2).
3. Ir a **Resumen del Período**, emitir (o re-emitir) el informe de cierre del
   período que contiene ese día → **Ver informe**: el renglón del día en el
   detalle muestra clasificación/estado de vacaciones normal, con las columnas
   Entrada/Salida/Pausas vacías y sin el badge "⚠ revisar" (Historia 1).
4. **Descargar PDF** del mismo informe → el documento descargado presenta el
   mismo renglón vacío (mismo componente que el paso 3).

## 4. Criterios de aceptación cubiertos

| Escenario | Dónde se valida |
|-----------|-----------------|
| US1 — día de vacaciones con fichadas: informe sin entrada/salida/pausas | §1 unit tests; §2.3; §3 paso 3 |
| US1 — entrada sin salida: igual que sin fichadas | §1 unit test "sólo entrada" |
| US1 — día de vacaciones sin fichadas: sin cambios (paridad) | §1 unit test de referencia |
| US1 — contadores del resumen sin cambios | §2.4; §1 unit tests de `filaResumenDe` |
| US2 — pantallas interactivas sin cambios | §1 `presentismo-resumen-periodo.test.js`; §2.1; §3 paso 2 |
| FR-007 — asignación ya no vigente: reglas normales | §1 unit test "sin justificación vacaciones" |
