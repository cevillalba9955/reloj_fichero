# Research: Servicio de Fichadas — Persistencia y Despliegue en Linux

**Feature**: 005-servicio-despliegue-linux | **Date**: 2026-07-13

Las decisiones ya se acotaron con el usuario durante la exploración. No quedan
`NEEDS CLARIFICATION`. Este documento consolida cada decisión con su racional y las
alternativas descartadas.

## §1 — Persistencia: reutilizar el archivo acumulativo por período (feature 004)

- **Decision**: el servicio persiste las fichadas obtenidas en el mismo
  `data/presentismo/fichadas/<periodo>.json` que consume `calcular`, vía
  `registrarFichadas` de [file-fichadas-archive.js](../../src/presentismo/adapters/file-fichadas-archive.js).
  El servicio se vuelve el **productor en vivo**; `calcular` (archive-fichadas-provider) el
  consumidor. Deduplica por `rawHex`, conserva `rawHex`.
- **Rationale**: es exactamente la fuente que el cálculo ya lee; evita un paso manual de
  `importar-fichadas` y unifica productor/consumidor en un solo almacén. Reusa lógica ya
  probada (dedup por `rawHex`, formato por período).
- **Alternativas descartadas**:
  - *Escribir `output/fichadas-*.json` (exports de sesión) + `importar-fichadas`*: mantiene
    el pipeline existente pero deja un paso manual/programado entre recolección y cálculo;
    el usuario pidió que el servicio persista lo que el cálculo consume, directo.
  - *Persistir el store en memoria completo*: mezcla estado de checkpoints con datos
    durables; el archivo por período es más simple y ya es el contrato del cálculo.

## §2 — Escritura atómica del archivo de fichadas

- **Decision**: cambiar `registrarFichadas` a escritura **atómica temp+rename**
  (`writeFileSync(tmp)` + `renameSync(tmp, final)`), y **saltar la escritura** cuando no hubo
  altas (todas duplicadas) y el archivo ya existe.
- **Rationale**: ahora hay un escritor de larga duración (el servicio) y un lector en otro
  proceso (`calcular`); un `writeFileSync` no atómico podría exponer un archivo truncado. El
  rename es atómico en el mismo filesystem. Saltar-sin-altas evita reescrituras inútiles en
  los ciclos que solo ven duplicados (el reloj re-reporta pendientes). Mismo patrón que
  [file-presentismo-repository.js](../../src/presentismo/adapters/file-presentismo-repository.js).
- **Alternativas descartadas**:
  - *Formato append NDJSON*: evitaría reescribir todo, pero rompe el formato JSON que
    `archive-fichadas-provider` ya lee y complica la dedup persistente. A la escala actual la
    reescritura es despreciable; se documenta como posible evolución futura.
  - *Lock de archivo*: innecesario — el servicio es single-flight (un ciclo por vez) y el
    rename atómico ya protege al lector.

## §3 — Robustez de la persistencia (no perder fichadas)

- **Decision**: el scheduler persiste **todas** las fichadas parseadas del ciclo (no solo las
  nuevas del store en memoria), confiando en la dedup persistente del archivo. Ante fallo de
  persistencia, el ciclo se registra como `error` y se **reintenta** en el próximo ciclo (el
  reloj sigue reportando las pendientes).
- **Rationale**: si se persistieran solo las "nuevas del store", un fallo transitorio las
  dejaría marcadas como vistas en memoria y nunca se reintentarían (se perderían del archivo
  hasta un reinicio). Persistir todas + dedup en disco hace el reintento idempotente y seguro
  (FR-004/FR-006).
- **Alternativas descartadas**: *persistir solo las nuevas del store* (frágil ante fallos,
  ver arriba).

## §4 — Padrón: aceptar el snapshot 004 en el lector por archivo

- **Decision**: extender `createLocalFileActiveEmployeesProvider` para aceptar **dos
  esquemas**: legacy `{ legajosActivos: [...] }` y snapshot 004 `{ empleados: [{legajo}] }`,
  detectando por forma. Normalizar con una regla única `interpretarLegajo` (entero ≥ 1,
  dedup, descarta inválidos), extraída a `src/roster/legajo.js` y compartida con el provider
  Oracle. Se usa con `--padron archivo` + `FICHADAS_ROSTER_CONFIG=./data/presentismo/padron.json`.
- **Rationale**: honra el pedido ("archivo, pero el de `data/presentismo/padron.json`") con el
  menor cambio y sin tocar `createRosterProvider`. Compartir `interpretarLegajo` evita duplicar
  la regla del dominio del legajo (ya validada en la feature 003).
- **Alternativas descartadas**:
  - *Nuevo modo `--padron snapshot`*: agrega superficie de configuración; la detección por
    forma sobre `--padron archivo` es más transparente para el operador.
  - *Convertir el snapshot a `active-employees.json` en un paso aparte*: duplica el padrón en
    disco y suma un paso; leer el snapshot directo es más simple.

## §5 — Continuidad multi-día: reinicio diario vs. cablear el reset

- **Decision**: resolver la continuidad con un **reinicio diario** programado por systemd
  timer (~06:00, antes de la ventana de entrada), sin tocar el código del scheduler.
- **Rationale**: el rollover de checkpoints (`Checkpoint.reiniciar()`) no está cableado; el
  proceso está pensado para reiniciarse por día. Con la persistencia ya resuelta, un reinicio
  no pierde fichadas (están en disco), así que el reinicio diario es seguro y simple, y no
  arriesga regresiones en la máquina de estados de checkpoints.
- **Alternativas descartadas**:
  - *Cablear `reiniciar()` en el scheduler al detectar cambio de fecha*: arregla la causa raíz
    pero es un cambio de lógica en la capa crítica de la feature 002, con más superficie de
    test; se puede hacer en una feature futura. Se documenta como alternativa.
  - *Aceptar single-day + reinicio manual*: descartado por el usuario (riesgo de que nadie
    reinicie y el servicio deje de consultar en silencio).

## §6 — Supervisión: systemd

- **Decision**: correr el servicio como **unit de systemd** (`Type=simple`), con arranque al
  boot (`WantedBy=multi-user.target`), `Restart=on-failure`, `TimeoutStopSec` holgado para el
  apagado limpio (SIGTERM ya soportado, exit 0), `WorkingDirectory` en la raíz de la instalación
  (los paths por defecto son relativos), y endurecimiento básico. El reinicio diario es un
  segundo unit (oneshot) disparado por un timer.
- **Rationale**: es el gestor de servicios estándar de Linux, sin dependencias extra; el
  servicio ya maneja SIGINT/SIGTERM de forma limpia, encajando naturalmente. El timer nativo
  cubre el rollover diario alineado a la hora.
- **Alternativas descartadas**:
  - *Docker/contenedor*: agrega una capa de contenedor y mapeos de red/volúmenes/.env sin
    beneficio claro para un único proceso Node en un servidor dedicado.
  - *pm2*: suma una dependencia global y su propia configuración; menos estándar que systemd
    para un daemon y sin ventajas aquí.
  - *cron para el reinicio*: válido, pero el timer de systemd queda cohesionado con el unit y
    con mejor observabilidad (`systemctl list-timers`, journal).

## §7 — Node ≥ 20.12 y oracledb thin

- **Decision**: fijar `engines.node` en `>=20.12` y documentar Node 20.12+ como prerrequisito.
  `oracledb` corre en **modo thin** (sin Oracle Instant Client) y solo se usa en el paso
  `sincronizar-padron`, no en el runtime del servicio.
- **Rationale**: los scripts usan `--env-file-if-exists` (Node ≥ 20.12); el `>=20` declarado
  es demasiado bajo y haría fallar el arranque en 20.0–20.11. El modo thin evita instalar
  binarios nativos de Oracle en el servidor.
- **Alternativas descartadas**: *modo thick de oracledb* (requeriría Instant Client en el
  host, innecesario).

## §8 — Composition root para el acoplamiento 002↔004

- **Decision**: el scheduler recibe un callback `persistirFichadas(fichadas)` opcional; NO
  importa nada de `src/presentismo/`. El sink concreto (que agrupa por período y llama a
  `registrarFichadas`) se construye en `src/cli/consulta-programada.js`, único punto que
  conoce ambas features.
- **Rationale**: mantiene el scheduler (feature 002) desacoplado del dominio de presentismo
  (feature 004); el acoplamiento vive en el composition root, que es su lugar natural. Si no
  se inyecta sink, el servicio se comporta como hoy (sin persistir) — útil para tests y para
  no romper el contrato existente.
- **Alternativas descartadas**: *importar `file-fichadas-archive` directo en el scheduler*
  (acopla capas y ensucia la unidad más crítica de la feature 002).
