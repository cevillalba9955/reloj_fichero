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

1. Con un scheduler de prueba (fake del cliente de protocolo, mismo patrón que los
   tests de 002) que devuelve 2 fichadas nuevas al hacer `tick()`, `POST
   /api/fichadas-hoy/consultar-reloj`.
2. **Esperado**: **200**, `resultado: "ok"`, `fichadasNuevas: 2`, y la vista devuelta
   ya refleja esas fichadas.
3. Disparar dos `POST /api/fichadas-hoy/consultar-reloj` en paralelo (sin esperar la
   primera respuesta).
4. **Esperado**: una responde `"ok"` (o `"omitido"` si ya terminó y no había nada
   nuevo) y la otra `"omitido"` — nunca dos sesiones TCP concurrentes contra el reloj.
5. Con el scheduler de prueba forzado a fallar (timeout simulado), repetir el `POST`.
6. **Esperado**: **502** `ERROR_CONSULTANDO_RELOJ`, `GET /api/fichadas-hoy`
   inmediatamente después sigue devolviendo los datos previos sin corromperse.

## Verificación de auditoría (transversal a US2/US3)

- Tras los escenarios 2 y 3, inspeccionar el archivo del período
  (`data/presentismo/<periodo>.json`) y confirmar que cada corrección/pausa/retiro
  tiene `autor`, `motivo`, `fechaHora` y (para correcciones) el valor anterior y
  nuevo — sin excepciones sin justificación (SC-005 del spec).
