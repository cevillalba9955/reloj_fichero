# Quickstart: Página "Fichadas de Hoy"

Valida end-to-end las 4 historias del spec sobre el entorno local ya usado por
007/008 (repo file-based, sin Oracle ni reloj real).

## Prerrequisitos

- Node.js ≥20, dependencias instaladas (`npm install` en la raíz y en `frontend/`).
- Calendario del mes actual ya generado (feature 007/008):
  `POST /api/calendarios/<periodo-actual>/generar`.
- Snapshot local del padrón con al menos 2-3 legajos y categoría configurada
  (`config/categorias.json` + `data/presentismo/padron.json`, mismo setup que 004).
- Variables de entorno igual que 007/008 (`PRESENTISMO_REPO_DIR`,
  `PRESENTISMO_CATEGORIAS_CONFIG`, etc.), más las que agregue el wiring del scheduler
  (research.md §4/§5; documentar en `.env.example` al implementar).

## Escenario 1 — Ver el estado de asistencia del día (US1)

1. Cargar en el archivo de fichadas del período actual una fichada de entrada dentro
   de margen para el legajo A, y ninguna fichada para el legajo B.
2. `GET /api/fichadas-hoy`.
3. **Esperado**: legajo A con `situacion: "PRESENTE"`, hora de entrada visible, sin
   salida; legajo B con `situacion: "ESPERANDO"` (si `ahora` está dentro de la ventana
   de entrada) o `"AUSENTE"` (si ya venció).

## Escenario 2 — Corregir manualmente un horario (US2)

1. `POST /api/fichadas-hoy/correcciones` para el legajo A con `entrada: "08:15"` y
   `motivo` no vacío.
2. **Esperado**: **200**, la fila del legajo A refleja la nueva hora de entrada y
   recalcula horas trabajadas/situación.
3. Repetir el mismo `POST` sin `motivo`.
4. **Esperado**: **400** `CORRECCION_INVALIDA`, nada se persiste.
5. Insertar una fichada real nueva del reloj para el mismo campo corregido (simular
   vía el archivo acumulativo).
6. `GET /api/fichadas-hoy` de nuevo.
7. **Esperado**: la corrección manual sigue prevaleciendo (no se sobrescribe).

## Escenario 3 — Pausa intermedia y retiro anticipado (US3)

1. Con el legajo A ya con entrada y salida determinadas, `POST
   /api/fichadas-hoy/pausas` con `desde: "12:00"`, `hasta: "13:00"`, motivo.
2. **Esperado**: **200**, horas trabajadas del legajo A bajan en la porción de la
   pausa dentro de la jornada efectiva.
3. `POST /api/fichadas-hoy/retiros-anticipados` para el legajo B con `hora: "14:30"`
   (antes del cierre oficial) y motivo.
4. **Esperado**: **200**, `situacion: "RETIRO_ANTICIPADO"` para el legajo B.
5. Repetir el paso 3 sin `motivo`.
6. **Esperado**: **400** `RETIRO_INVALIDO`.

## Escenario 4 — Consultar nuevas fichadas al reloj (US4)

Requiere los dos procesos levantados localmente (research.md §4): el servicio de
fichadas (`node src/cli/consulta-programada.js --host <fake-o-real> ...`, con
`FICHADAS_CONTROL_PORT` seteado) y el servidor web (`FICHADAS_CONTROL_URL` apuntando a
`http://127.0.0.1:<FICHADAS_CONTROL_PORT>`). En tests automatizados, un servidor HTTP
de prueba en el puerto de control reemplaza al proceso real (ver
`contracts/control-api.md`).

1. Con el proceso de fichadas usando un scheduler de prueba (fake del cliente de
   protocolo, mismo patrón que los tests de 002) que devuelve 2 fichadas nuevas al
   hacer `tick()`, `POST /api/fichadas-hoy/consultar-reloj` contra el servidor web.
2. **Esperado**: **200**, `resultado: "ok"`, `fichadasNuevas: 2`, y la vista devuelta
   ya refleja esas fichadas (el web hizo `POST /tick` local y luego recalculó).
3. Disparar dos `POST /api/fichadas-hoy/consultar-reloj` en paralelo (sin esperar la
   primera respuesta).
4. **Esperado**: una responde `"ok"` (o `"omitido"` si ya terminó y no había nada
   nuevo) y la otra `"omitido"` — nunca dos sesiones TCP concurrentes contra el reloj
   (el single-flight vive en el proceso de fichadas, no en el web).
5. Con el proceso de fichadas caído (o el `FICHADAS_CONTROL_URL` apuntando a un puerto
   sin nada escuchando), repetir el `POST` contra el web.
6. **Esperado**: **502** `ERROR_CONSULTANDO_RELOJ`, `GET /api/fichadas-hoy`
   inmediatamente después sigue devolviendo los datos previos sin corromperse.

## Escenario 5 — Navegar a días previos y editar (US5, iteración 2)

Requiere calendario generado para el mes actual y (para el paso 4) que exista al
menos un mes anterior **sin** calendario generado.

1. `GET /api/fichadas-hoy` → **Esperado**: la vista incluye
   `navegacion: { anterior, siguiente, esHoy: true }`, con `siguiente: null` (no se
   navega a futuro) y `anterior` apuntando al día previo navegable.
2. `GET /api/fichadas-hoy?fecha=<navegacion.anterior>` → **Esperado**: **200**, vista
   de ese día con `esHoy: false`; en la UI, el botón «Consultar reloj» no se muestra.
3. `POST /api/fichadas-hoy/correcciones` con esa fecha previa, `entrada` y `motivo` →
   **Esperado**: **200**, la fila refleja la corrección; el registro de auditoría
   queda con la fecha del día corregido.
4. `GET /api/fichadas-hoy?fecha=<día de un período sin calendario>` y
   `GET /api/fichadas-hoy?fecha=<mañana>` → **Esperado**: **400**
   `FECHA_FUERA_DE_RANGO` en ambos; ídem el `POST` de corrección con esas fechas.

## Escenario 6 — Columnas de pausa y modales (iteración 2, UI)

1. Con el legajo A con una pausa intermedia cargada (Escenario 3), abrir la página →
   **Esperado**: la tabla muestra las columnas «Inicio pausa» / «Fin pausa» con esa
   pausa; filas sin pausa muestran `—`.
2. Agregar una segunda pausa intermedia al legajo A → **Esperado**: las columnas
   siguen mostrando la primera pausa por `desde`, con indicador `+1`; las horas
   trabajadas descuentan ambas.
3. Registrar un retiro anticipado al legajo B → **Esperado**: las columnas de pausa
   del legajo B no lo muestran (la situación `RETIRO_ANTICIPADO` ya lo refleja).
4. Click en «Corregir» y en «Pausa / Retiro» → **Esperado**: cada formulario se abre
   como diálogo modal (backdrop, `role="dialog"`, foco dentro); Escape o click en el
   backdrop lo cierra sin efecto alguno (equivale a Cancelar).

## Verificación de auditoría (transversal a US2/US3)

- Tras los escenarios 2 y 3, inspeccionar el archivo del período
  (`data/presentismo/<periodo>.json`) y confirmar que cada corrección/pausa/retiro
  tiene `autor`, `motivo`, `fechaHora` y (para correcciones) el valor anterior y
  nuevo — sin excepciones sin justificación (SC-005 del spec).

## Resultado de ejecución (T053 — 2026-07-16)

Ejecutado de punta a punta el 2026-07-16 (período 202607) sobre el servidor web
real (`crearApp`), el servicio de fichadas real (`startService` +
`crearServidorControl`, `POST /tick` en loopback) y un mock del reloj RS956 a
nivel de protocolo (guion de handshake/0xB4/0xA4/0x81 con payload desfasado,
mismo patrón que los tests de la feature 002). **11/11 pasos PASS**:

| Escenario | Resultado |
|-----------|-----------|
| 1 — Ver estado del día (PRESENTE / ESPERANDO-AUSENTE) | PASS |
| 2 — Corrección con motivo → 200 y fila recalculada | PASS |
| 2 — Corrección sin motivo → 400, nada persiste | PASS |
| 2 — Fichada real posterior no pisa la corrección | PASS |
| 3 — Pausa descuenta dentro de la jornada efectiva | PASS |
| 3 — Retiro anticipado → `RETIRO_ANTICIPADO` | PASS |
| 3 — Retiro sin motivo → 400 | PASS |
| 4 — Consulta manual trae 2 fichadas y la vista las refleja | PASS |
| 4 — Dos consultas en paralelo → single-flight | PASS |
| 4 — Servicio caído → 502, datos previos intactos | PASS |
| Auditoría transversal (autor/motivo/fechaHora/valores) | PASS |

Nota operativa: la consulta manual usa `scheduler.tick({ forzarConsulta: true })`
y abre sesión contra el reloj **en cualquier momento**, aunque ninguna ventana de
checkpoint esté abierta (el chequeo de ventana solo aplica al ciclo programado).
Reejecutado el guion completo con el servicio a las 15:00 (fuera de la ventana
07:00–07:30): 11/11 PASS, incluida la entrega de las 2 fichadas nuevas por la
consulta manual.
