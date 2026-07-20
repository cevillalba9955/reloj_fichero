# Quickstart: Reestructurar Almacenamiento por Período

Valida end-to-end las 3 historias del spec sobre el entorno local ya usado por
004/010/012 (repo file-based, sin Oracle ni reloj real).

## Prerrequisitos

- Node.js ≥20, dependencias instaladas (`npm install` en la raíz y en `frontend/`).
- Un directorio de trabajo temporal para `PRESENTISMO_REPO_DIR` (no reutilizar datos
  del layout anterior: la migración queda fuera de alcance, spec Assumptions).
- Snapshot Oracle no requerido: se puede usar `--padron archivo` con un padrón
  provisto a mano, o mockear la fuente en los tests de integración.

## Escenario 1 — Un período vive en su propia carpeta (US1)

1. `node src/cli/calcular-presentismo.js generar-calendario --periodo 202608`.
2. **Esperado**: se crea `<repo-dir>/P202608/calendario.json`; no existe ningún
   `<repo-dir>/202608.json` ni `<repo-dir>/fichadas/` (layout anterior).
3. Importar fichadas de ese período (`importar-fichadas --periodo 202608`).
4. **Esperado**: quedan en `<repo-dir>/P202608/fichadas.json`.
5. Generar también el calendario de `202607`.
6. **Esperado**: existe `<repo-dir>/P202607/` en paralelo, sin que ninguna
   operación sobre `202608` haya tocado sus archivos (ni al revés).

## Escenario 2 — El padrón es por período y se actualiza sobre el mes en curso (US2)

1. Generar el calendario del período `202608` (mes en curso en el entorno de
   prueba). **Esperado**: se crea `P202608/padron.json` con la nómina vigente en
   ese momento.
2. Generar también el calendario de `202607` (mes pasado). **Esperado**: se crea
   `P202607/padron.json`, con su propia copia de la nómina.
3. `sincronizar-padron` (o el flujo equivalente). **Esperado**: se actualiza
   `P202608/padron.json` (el mes en curso); `P202607/padron.json` no cambia (hash o
   contenido idéntico antes/después).
4. Repetir el paso 3 simulando que "ahora" avanzó a `202609` (reloj inyectado en el
   test). **Esperado**: la sincronización crea/actualiza `P202609/padron.json`, no
   toca `P202608/` ni `P202607/`.

## Escenario 3 — Un período cerrado queda protegido (US3)

1. Con `202607` ya generado y con datos, `POST /api/calendarios/202607/cerrar`
   (o `cerrar-periodo --periodo 202607` por CLI).
2. **Esperado**: **200**, la vista del calendario refleja `cerrado: true`.
3. Intentar, sobre `202607`: reclasificar un día, cargar una corrección, una pausa,
   una Justificación, e importar fichadas nuevas.
4. **Esperado**: los cinco intentos responden **409** `PERIODO_CERRADO` (o su
   equivalente en el CLI), y ninguno de los archivos de `P202607/` cambió.
5. Consultar sobre `202607`: calcular presentismo, el resumen del período, el
   detalle de un empleado, listar el padrón.
6. **Esperado**: las cuatro consultas responden con normalidad, igual que antes de
   cerrar (FR-007).
7. Reabrir el período (`POST /api/calendarios/202607/reabrir` o
   `reabrir-periodo`). **Esperado**: **200**, `cerrado: false`; repetir el paso 3
   ahora tiene éxito.

## Verificación transversal — reorganización sin efecto en los resultados (SC-004)

1. Calcular el presentismo de un legajo en un período con datos, antes de cerrar el
   período.
2. Cerrar el período y volver a calcular el mismo legajo (misma fecha de corte,
   `hoy` inyectado).
3. **Esperado**: el resultado (horas trabajadas, horas esperadas, saldo, conteos)
   es idéntico en ambas corridas — cerrar no cambia ningún cálculo, solo bloquea
   escrituras futuras.

## Verificación de rendimiento

- Generar y operar sobre 12 períodos en paralelo (un año) no debe degradar el
  tiempo de una operación individual respecto del layout anterior: cada operación
  sigue tocando un único archivo dentro de una única carpeta, nunca escanea las
  carpetas de otros períodos (salvo `listarPeriodos()`, que ya escaneaba el
  directorio completo antes de esta feature).
