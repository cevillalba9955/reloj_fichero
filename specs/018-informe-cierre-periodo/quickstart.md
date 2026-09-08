# Quickstart: Informe al Cierre del Período

**Feature**: 018-informe-cierre-periodo | **Date**: 2026-09-08

Guía de validación end-to-end. Asume el repo en la rama
`018-informe-cierre-periodo` y la feature implementada. Formas de datos:
[data-model.md](data-model.md). Contrato: [contracts/web-api.md](contracts/web-api.md).

---

## Prerrequisitos

- Node.js ≥20. `.env` con `PRESENTISMO_REPO_DIR=./data`.
- Un período con calendario, padrón y fichadas cargadas. Para estos pasos:
  `202607` (ya tiene `data/P202607/{calendario,padron,fichadas}.json`).
- Backend: `npm run web` (server en el puerto de `.env`).
- Frontend build servido por el backend, o `npm --prefix frontend run dev`.

---

## Escenario 1 — El cierre emite y guarda ambos informes (US1 AS7)

Modo `MENSUAL` (`PRESENTISMO_RESUMEN_PERIODO=MENSUAL` o sin la variable):

```bash
curl -s -X POST -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"autor":"cevillalba"}' \
  http://localhost:PORT/api/calendarios/202607/cerrar | jq .cerrado   # true
```

**Esperado**:
- `data/P202607/informe-cierre.json` existe y tiene la clave `Mes` con
  `sello.modo === "automatico"`, `resumen`, `detalle`, `pendientes`,
  `obsoleto: false`.
- Log con `evento: "informe_cierre_emitido"`, `tramo: "Mes"`, `modo: "automatico"`.

---

## Escenario 2 — Leer la copia guardada y verificar el cuadre (US2 AS5, SC-002)

```bash
curl -s -H 'x-apex-rol: lector' \
  http://localhost:PORT/api/calendarios/202607/informe-cierre > informe.json

jq '.resumen.encabezado.totalHoras' informe.json
jq '[.resumen.filas[].horasTrabajadas] | add' informe.json          # == totalHoras

# cuadre resumen ↔ detalle por empleado:
jq -e '
  .detalle.secciones as $s |
  .resumen.filas | all(.anomalia != null or
    (.horasTrabajadas == ($s[] | select(.legajo == .legajo) | .subtotalHoras)))
' informe.json
```

**Esperado**: `totalHoras` == suma de filas; cada `subtotalHoras` del detalle ==
`horasTrabajadas` de la fila del mismo legajo.

---

## Escenario 3 — Coherencia con la pantalla "Resumen del Período" (SC-008)

```bash
curl -s -H 'x-apex-rol: lector' \
  'http://localhost:PORT/api/resumen-periodo?periodo=202607' > resumen-vivo.json

# Mismas filas (legajo, horasTrabajadas y contadores) que informe.json .resumen.filas
jq -S '[.filas[] | {legajo,horasTrabajadas,ausencias,llegadasTarde,incompletas}]' resumen-vivo.json
jq -S '[.resumen.filas[] | {legajo,horasTrabajadas,ausencias,llegadasTarde,incompletas}]' informe.json
```

**Esperado**: los dos listados coinciden.

---

## Escenario 4 — Período abierto: no se puede emitir (US1 AS5, FR-002)

```bash
curl -s -X POST -H 'x-apex-rol: editor' \
  http://localhost:PORT/api/calendarios/202608/informe-cierre -w '\n%{http_code}\n'
```

**Esperado**: `409` con `codigo: "PERIODO_ABIERTO"` (202608 no está cerrado).

---

## Escenario 5 — Control de acceso (FR-012, SC-005)

```bash
curl -s -X POST -H 'x-apex-rol: lector' \
  http://localhost:PORT/api/calendarios/202607/informe-cierre -w '\n%{http_code}\n'
```

**Esperado**: `403` con `codigo: "ACCESO_DENEGADO"`.

---

## Escenario 6 — Reabrir invalida; re-emitir actualiza (US "Edge", FR-013, SC-006)

```bash
# 1. Reabrir
curl -s -X POST -H 'x-apex-rol: editor' -d '{"autor":"cevillalba"}' \
  http://localhost:PORT/api/calendarios/202607/reabrir >/dev/null

# 2. La copia guardada quedó obsoleta
curl -s -H 'x-apex-rol: lector' \
  http://localhost:PORT/api/calendarios/202607/informe-cierre | jq .obsoleto   # true

# 3. Ajustar una jornada (corrección) y volver a cerrar
curl -s -X POST -H 'x-apex-rol: editor' -H 'content-type: application/json' \
  -d '{"legajo":4021,"fecha":"2026-07-06","valorCorregido":8,"autor":"cevillalba"}' \
  http://localhost:PORT/api/correcciones >/dev/null   # endpoint de corrección existente
curl -s -X POST -H 'x-apex-rol: editor' -d '{"autor":"cevillalba"}' \
  http://localhost:PORT/api/calendarios/202607/cerrar >/dev/null

# 4. Nueva copia, no obsoleta, cifras nuevas
curl -s -H 'x-apex-rol: lector' \
  http://localhost:PORT/api/calendarios/202607/informe-cierre | jq '{obsoleto, total: .resumen.encabezado.totalHoras}'
```

**Esperado**: paso 2 → `obsoleto: true`; paso 4 → `obsoleto: false` y el total de
horas refleja la corrección.

---

## Escenario 7 — Modo QUINCENAL: dos tramos (US1 AS2, FR-004)

Con `PRESENTISMO_RESUMEN_PERIODO=QUINCENAL` y el backend reiniciado:

```bash
curl -s -X POST -H 'x-apex-rol: editor' -d '{"autor":"cevillalba"}' \
  http://localhost:PORT/api/calendarios/202607/cerrar >/dev/null

jq 'keys' data/P202607/informe-cierre.json                    # ["Q1","Q2"]

curl -s -H 'x-apex-rol: lector' \
  'http://localhost:PORT/api/calendarios/202607/informe-cierre?tramo=Q1' \
  | jq '[.detalle.secciones[0].dias[].fecha] | (min, max)'    # 2026-07-01 .. 2026-07-15
```

**Esperado**: el archivo tiene `Q1` y `Q2`; el detalle de `Q1` sólo abarca los
días 1–15 para todos los empleados.

---

## Escenario 8 — Pendientes antes de liquidar (US3 AS1/AS3)

```bash
jq '.pendientes | {hayPendientes, incompletas: (.jornadasIncompletas|length), anomalias: (.anomalias|length)}' informe.json
```

**Esperado**: si el período tiene jornadas incompletas o empleados sin categoría,
aparecen listados con legajo y fechas; si no hay ninguno, `hayPendientes: false`.

---

## Escenario 9 — Documento imprimible (FR-011)

1. En la app, abrir **Resumen del Período**, elegir `202607` (cerrado).
2. Acción **"Emitir / ver informe de cierre"** → se abre `InformeCierrePrintable`
   con el encabezado (período, tramo, sello), el resumen por empleado, el detalle
   por empleado y el bloque de pendientes.
3. Botón **"Imprimir"** → diálogo de impresión del navegador; "Guardar como PDF"
   produce el documento archivable.

**Esperado**: la vista de impresión no muestra la navegación de la app
(`@media print`), cada empleado del detalle no se parte a mitad de página cuando
es evitable, y el sello de emisión es legible en la primera página.

---

## Chequeo de regresión

```bash
npm test                          # node:test — unit + contract + integration
npm --prefix frontend run test    # Vitest — componentes
```

**Esperado**: verde. En particular
`tests/unit/presentismo-informe-cierre.test.js`,
`tests/contract/web-api-informe-cierre.test.js`,
`tests/integration/informe-cierre.integration.test.js`, y los tests existentes de
`resumen-periodo` y `periodo-cerrado` sin cambios de comportamiento.
