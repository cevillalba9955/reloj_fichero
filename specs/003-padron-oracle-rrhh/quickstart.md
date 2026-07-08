# Quickstart: Padrón Real de Empleados Activos desde Oracle/RRHH

**Feature**: `003-padron-oracle-rrhh` | Guía de validación end-to-end.

## Prerrequisitos

- Node.js 20+; `npm install` ejecutado (esta feature introduce
  `node-oracledb`, primera dependencia de runtime del proyecto —
  research.md §1).
- La suite completa corre sin Oracle real: `npm test` (los escenarios 1-5
  usan repositorio fake y mock TCP del reloj).
- Solo el escenario 6 (smoke manual) necesita una base Oracle accesible y
  las variables `RRHH_ORACLE_*` (ver
  [contracts/env-config-contract.md](./contracts/env-config-contract.md)).

## Escenario 1 — Fail-fast por configuración incompleta (FR-005 / SC-006)

1. Sin definir ninguna variable `RRHH_ORACLE_*`, ejecutar el CLI con
   `--padron oracle`:
   `node src/cli/consulta-programada.js --host 127.0.0.1 --padron oracle`
2. **Esperado**: el proceso termina con exit ≠ 0 ANTES de programar
   ciclos, listando por nombre todas las variables faltantes; ninguna
   línea de salida contiene valores de credenciales.

## Escenario 2 — Drop-in: completitud contra el padrón Oracle (US1 / FR-001)

1. Arrancar el servicio (vía test de integración) con mock TCP del reloj
   (fichadas de los legajos 101 y 102) y repositorio fake que devuelve
   `[101, 102]`.
2. **Esperado**: el checkpoint abierto cierra por `cerrado_completo` igual
   que en la feature 002; `getState().empleados[]` refleja los dos
   legajos; ni scheduler ni store fueron modificados.

## Escenario 3 — Respaldo con el último padrón válido (US2 / FR-008)

1. Con `now()` simulado: día 1, el repositorio fake responde `[101, 102]`
   (snapshot fijado). Día 2, el fake pasa a rechazar.
2. **Esperado**: el servicio sigue evaluando completitud con `[101, 102]`;
   el log NDJSON de padrón registra `padron_error` + `padron_respaldo`
   con `obtenidoEn` del día 1 (SC-003). Cuando el fake vuelve a responder,
   se retoma el padrón fresco (`padron_fresco`).

## Escenario 4 — Padrón vacío no cierra nada (FR-011)

1. Repositorio fake responde `[]` (respuesta exitosa vacía), sin snapshot
   previo.
2. **Esperado**: el ciclo se registra como `error`
   (`RosterNoDisponibleError`); ningún checkpoint cierra por completitud;
   el log registra `padron_vacio`; en la llamada siguiente se REINTENTA
   la fuente (el vacío no consumió el éxito del día — FR-014).

## Escenario 5 — Una consulta a la fuente por día (FR-014)

1. Con `now()` simulado dentro de un mismo día: provocar N ticks del
   scheduler (cada tick evalúa ≥2 checkpoints → ≥2N llamadas a
   `getActiveEmployees()`).
2. **Esperado**: el repositorio fake registra **exactamente 1** consulta;
   al avanzar `now()` al día siguiente, la primera llamada del nuevo día
   vuelve a consultar (total 2).

## Escenario 6 — Smoke manual contra Oracle real (opcional, fuera de la suite)

1. Definir las 4 variables requeridas (`RRHH_ORACLE_USER`, `_PASSWORD`,
   `_CONNECT_STRING`, `_VISTA_PADRON`) apuntando a la vista provista por
   RRHH/DBA (usuario de SOLO lectura — Principio II).
2. **Forma repetible (recomendada)** — script de smoke dedicado, que ejerce
   solo el camino del padrón Oracle (sin reloj RS956) y verifica de una vez
   conectividad, cantidad, latencia y FR-014:
   `npm run smoke:oracle`
   **Esperado**: imprime `cantidadLegajos` > 0, `duracionMs` < 5000 (SC-004),
   una muestra de legajos reales y `FR-014 OK: una sola consulta a la fuente`;
   exit 0. Con configuración incompleta termina con exit 4 nombrando las
   variables faltantes; ante fuente caída/credenciales inválidas, exit 1 con
   la categoría (`conexion` / `autenticacion` / `timeout` / `consulta`), sin
   exponer la credencial.
3. **Forma end-to-end (con reloj)** — arrancar el servicio completo:
   `node src/cli/consulta-programada.js --host <ip-reloj> --padron oracle`
   **Esperado**: el resumen de estado del CLI muestra `empleados[]` con los
   legajos reales del padrón; el log de padrón registra `padron_fresco` con
   `cantidadLegajos` > 0 y `duracionMs` < 5000 (SC-004); una segunda
   evaluación del mismo día no genera nueva consulta en la base (verificable
   con el DBA o `padron_fresco` único en el log).
4. Auditoría (SC-002): `git grep` de la password y del connect string en
   el repo y en `./logs/*.ndjson` → 0 ocurrencias.

## Regresión — El modo archivo sigue intacto (FR-013 / SC-005)

- `node src/cli/consulta-programada.js --host <ip> ` (sin `--padron` o con
  `--padron archivo`) se comporta exactamente igual que en la feature 002
  (adapter de archivo local); la suite existente de 002 pasa sin cambios.
