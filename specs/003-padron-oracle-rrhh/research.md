# Research: Padrón Real de Empleados Activos desde Oracle/RRHH

**Feature**: `003-padron-oracle-rrhh` | **Fase**: 0 | **Fecha**: 2026-07-08

Resuelve las decisiones técnicas del plan. No quedan NEEDS CLARIFICATION
pendientes (las cuatro decisiones de producto se cerraron en
`/speckit-clarify`, ver spec.md Clarifications).

## §1 — Driver de acceso a Oracle: `node-oracledb` en modo thin

**Decision**: Usar `node-oracledb` versión 6.x en **modo thin** como
única dependencia de runtime nueva del proyecto.

**Rationale**:
- Es el driver oficial mantenido por Oracle para Node.js.
- Desde la versión 6, el modo thin está implementado en JavaScript puro:
  no requiere instalar Oracle Instant Client ni binarios nativos en el
  host, lo que mantiene el despliegue tan simple como el actual (solo
  Node 20+). Esto importa porque el servicio corre en el mismo host
  Windows/Linux que ya sondea el reloj.
- Soporta `connectTimeout` y `callTimeout` por conexión, que es
  exactamente lo que FR-009 exige (tiempo máximo de espera configurable
  sin bloquear el ciclo de sondeo).
- El proyecto no tenía dependencias externas de runtime hasta ahora; la
  política implícita (features 001/002) es no sumar ninguna sin
  justificación. La justificación aquí es categórica: el protocolo de red
  de Oracle (TNS) no es implementable razonablemente con `node:net`, a
  diferencia del protocolo RS956 que sí se implementó a mano.

**Alternatives considered**:
- **Implementar TNS a mano sobre `node:net`**: rechazado — protocolo
  propietario enorme; el costo/riesgo no se compara con las ~300 líneas
  del RS956.
- **Puente ODBC (`odbc` npm) + driver ODBC de Oracle**: rechazado — suma
  una dependencia npm *y* un driver nativo del sistema operativo;
  estrictamente peor que el modo thin en simplicidad de despliegue.
- **Servicio REST intermedio de RRHH**: no existe hoy en la empresa; si
  existiera, bastaría escribir otro `ActiveEmployeesProvider` detrás del
  mismo contrato (el diseño lo permite sin tocar nada más).
- **Exportación periódica a archivo (cron del lado RRHH) + adapter local
  existente**: rechazado como solución definitiva — reintroduce el
  mantenimiento manual/externo que la spec quiere eliminar (SC-001),
  aunque el adapter local sigue disponible para desarrollo (FR-013).

## §2 — Capa de repositorio y Principio II

**Decision**: Todo el SQL del proyecto vive en un único archivo:
`src/db/oracle-roster-repository.js`. El repositorio expone
`fetchLegajosActivos() -> Promise<number[]>` y nada más. La consulta es
un único `SELECT <columna> FROM <vista>` sobre la vista provista por
RRHH/DBA (Clarifications Q1). Los nombres de vista y columna llegan por
configuración y se validan contra un patrón estricto de identificador
SQL (`^[A-Za-z][A-Za-z0-9_$#]*(\.[A-Za-z][A-Za-z0-9_$#]*)?$`) antes de
interpolarse — nunca se interpola input sin validar, y no hay ningún otro
punto de construcción de SQL.

**Rationale**: El Principio II exige una capa DAO dedicada sin SQL fuera
de ella. Concentrar la única sentencia en un archivo hace trivial la
revisión que exige la constitución ("verificar que no haya SQL fuera de
esa capa"). La validación de identificadores elimina la inyección aun
cuando el nombre de la vista es configurable.

**Alternatives considered**:
- Vista con nombre fijo hardcodeado: rechazado — el nombre real lo define
  RRHH/DBA y puede diferir entre entornos (test/prod).
- Consulta parametrizable libre por configuración: rechazado — permitiría
  SQL arbitrario por variable de entorno, imposible de auditar y contrario
  al espíritu del Principio II.
- Pool de conexiones: rechazado — con una consulta por día (FR-014), se
  abre una conexión por obtención y se cierra siempre (try/finally);
  un pool sería complejidad muerta.

## §3 — Configuración por variables de entorno (FR-004/FR-005)

**Decision**: Módulo `src/db/oracle-roster-config.js` con
`readOracleRosterConfig(env)` que lee:

| Variable | Requerida | Default | Notas |
|---|---|---|---|
| `RRHH_ORACLE_USER` | Sí | — | usuario de solo lectura (mínimo privilegio) |
| `RRHH_ORACLE_PASSWORD` | Sí | — | nunca se loguea ni se incluye en mensajes de error |
| `RRHH_ORACLE_CONNECT_STRING` | Sí | — | forma `host:puerto/servicio` |
| `RRHH_ORACLE_VISTA_PADRON` | Sí | — | identificador validado (§2) |
| `RRHH_ORACLE_COLUMNA_LEGAJO` | No | `LEGAJO` | identificador validado (§2) |
| `RRHH_ORACLE_TIMEOUT_MS` | No | `10000` | entero > 0; aplica a connect + call (FR-009) |

Ante una variable requerida ausente o inválida lanza
`ConfiguracionPadronInvalidaError` **nombrando la(s) variable(s)
faltante(s)** pero nunca el valor de ninguna otra (FR-005). El CLI valida
la configuración al arranque, antes de `startService()` (fail-fast).

**Rationale**: Cumple FR-004 (nada en argv: las credenciales no viajan
por línea de comandos, solo el selector `--padron oracle`) y FR-005
(mensaje accionable al arranque). Separar la lectura/validación del
repositorio permite testearla sin tocar Oracle.

**Alternatives considered**: archivo de configuración con credenciales —
rechazado (riesgo de versionarlo; la constitución exige env vars o gestor
de secretos); flags CLI para credenciales — rechazado (quedan visibles en
la lista de procesos e historial de shell).

## §4 — Decorator de cache diario (FR-008 / FR-011 / FR-014)

**Decision**: `DailyCachedActiveEmployeesProvider` envuelve al provider
Oracle e implementa toda la política temporal, manteniendo intacto el
contrato `getActiveEmployees() -> Promise<Empleado[]>`:

- **Una consulta por día de servicio** (FR-014): la primera llamada de un
  día (según `now()` inyectable, mismo patrón que la feature 002) consulta
  la fuente; las siguientes del mismo día devuelven el snapshot del día
  sin tocar Oracle.
- **Reintentos**: si la obtención del día falló (error o vacío), la
  próxima llamada vuelve a intentar contra la fuente — el "una vez por
  día" es una vez *con éxito* por día.
- **Respaldo** (FR-008): ante fallo, si existe un último padrón válido
  (de hoy o de días previos — Clarifications Q2), se devuelve ese,
  registrando en el log `origen: 'respaldo'` y su `obtenidoEn`.
- **Padrón vacío** (FR-011): una respuesta exitosa con 0 legajos se trata
  igual que un fallo a efectos de completitud (respaldo o
  `RosterNoDisponibleError`), se registra como `padron_vacio`, y no
  consume el "éxito del día" (se reintenta).
- **Sin padrón previo** (FR-007): rechaza con `RosterNoDisponibleError` —
  el scheduler existente ya registra el ciclo como `error` sin asumir
  padrón vacío (comportamiento heredado de 002, verificado en
  `consulta-programada-service.js`).

**Rationale**: El scheduler de la feature 002 llama
`getActiveEmployees()` en cada evaluación de checkpoint de cada tick
(~2+ llamadas cada 5 minutos). Poner la política en un decorator deja al
scheduler, al servicio y al contrato intactos (FR-001: drop-in), y hace
la política testeable en aislamiento con un `now()` falso. La nota del
contrato de la feature 002 ("cachear queda como optimización futura")
queda formalmente superseded por FR-014 — se documenta en
contracts/daily-roster-cache-contract.md.

**Alternatives considered**: implementar la política dentro del provider
Oracle (rechazado: mezcla acceso a datos con reglas temporales y no sería
reutilizable si mañana la fuente es un REST); modificar el scheduler para
consultar el padrón una vez al día (rechazado: rompe el objetivo drop-in
y toca código estable de 002).

## §5 — Normalización del padrón (FR-012)

**Decision**: `OracleActiveEmployeesProvider` transforma el resultado del
repositorio en `Empleado[]` (`{ legajo, activo: true }`), aplicando:
deduplicación por legajo (Set), descarte de valores no interpretables
como entero positivo (registrando cada descarte con su motivo en el log
de obtención, sin incluir el valor crudo completo si no es interpretable),
y preservación del resto (un registro defectuoso aislado no invalida el
padrón).

**Rationale**: FR-012 explícito; además el dominio del legajo debe
coincidir con el entero que decodifica el cliente RS956 (contrato de la
feature 002).

## §6 — Timeout y no-bloqueo del ciclo (FR-009)

**Decision**: `RRHH_ORACLE_TIMEOUT_MS` (default 10000) se aplica como
`connectTimeout` de la conexión y `callTimeout` de la ejecución en
node-oracledb. Un timeout se traduce a `RosterNoDisponibleError` (vía la
cadena provider → decorator), nunca a una espera indefinida. 10s default
<< 5 minutos de ciclo y > el objetivo de 5s de SC-004 (deja margen para
condiciones degradadas sin abortar consultas apenas lentas).

## §7 — Observabilidad (FR-010, Principio V)

**Decision**: `src/logging/roster-fetch-logger.js`, mismo patrón NDJSON
que `session-logger.js`/`service-cycle-logger.js`. Un evento por
obtención (o intento): `{ evento: 'padron_fresco' | 'padron_respaldo' |
'padron_vacio' | 'padron_error' | 'legajo_descartado', cantidadLegajos,
duracionMs, obtenidoEn (del snapshot usado), detail }`. Prohibido por
test dedicado (mismo criterio que los loggers existentes): password,
connect string completo, y cualquier campo que no sea el legajo. El log
permite auditar SC-002/SC-003.

## §8 — Testabilidad sin Oracle real (Principio IV)

**Decision**: El repositorio recibe una **fábrica de conexiones
inyectable** (default: `node-oracledb` real; en tests: fake en memoria
que registra el SQL recibido y devuelve filas simuladas). Con eso:

- Unit tests del repositorio: SQL generado (vista/columna validadas),
  mapeo de filas, `close()` garantizado incluso ante error, timeouts
  aplicados — todo sin red.
- Unit tests de config, provider (normalización) y decorator (política
  temporal con `now()` falso).
- Integration test del servicio completo: mock TCP del reloj (reutilizado
  de 002) + repositorio fake — demuestra el drop-in de punta a punta.
- Smoke test contra Oracle real: **manual**, documentado en
  quickstart.md, condicionado a que las `RRHH_ORACLE_*` estén presentes;
  no corre en la suite (`npm test` no depende de infraestructura).

**Rationale**: El Principio IV exige test-first en la capa de datos; la
fábrica inyectable es la costura mínima que lo permite sin depender de
una base disponible en CI/desarrollo.

## §9 — Selección del origen del padrón (FR-013)

**Decision**: Flag CLI `--padron archivo|oracle` (default `archivo`).
Con `archivo`, el comportamiento actual no cambia en nada
(`LocalFileActiveEmployeesProvider` + `--roster-config`). Con `oracle`,
el CLI valida la configuración de entorno (fail-fast, §3) y arma la
cadena repositorio → provider Oracle → decorator diario antes de
`startService()`. La selección es explícita: la presencia de variables
`RRHH_ORACLE_*` **no** activa Oracle por sí sola (evita sorpresas de
entorno).

**Alternatives considered**: autodetección por presencia de env vars —
rechazada (un entorno con variables residuales cambiaría silenciosamente
el origen del padrón); variable `ROSTER_SOURCE` en vez de flag — se
acepta como *override* de conveniencia solo si el flag no se pasa
(decisión menor, se define en tasks; el flag manda).
