# Research: Servicio de Consulta Programada de Fichadas

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Este documento resuelve las decisiones técnicas necesarias para pasar de la
especificación (WHAT) al diseño (HOW), dado que la spec no fija stack,
patrones de implementación, ni mecanismo concreto de scheduling.

## 1. Reutilización del cliente RS596 existente

**Decisión**: El servicio consume `runQuerySession` de
`src/protocol/client.js` (feature 001) como caja negra, importándolo tal
cual. Ningún código nuevo de esta feature construye o interpreta bytes
crudos del protocolo.

**Rationale**: Constitución, Principio III (protocolo aislado) — ya
implementado y probado en feature 001; reimplementarlo o tocarlo violaría
el principio y duplicaría trabajo ya validado contra hardware real.

**Alternatives considered**: Ninguna — está impuesto por la spec (FR-001)
y por la constitución.

## 2. Mecanismo de scheduling (checkpoint "entrada")

**Decisión**: Un temporizador nativo de Node.js (`setInterval` de 5
minutos, sin librerías de cron) evalúa en cada tick el estado del único
checkpoint configurado ("entrada"): si el checkpoint está abierto
(dentro de su ventana de aceptación de un solo lado `[horaEsperada,
horaEsperada + duracionMinutos]` y con empleados activos aún incompletos
para él) y no hay ya una consulta en curso, dispara una `runQuerySession`.
El reloj de pared se abstrae detrás de una función `now()` inyectable
(mismo patrón que `session-logger.js` de feature 001), para poder testear
el comportamiento de apertura/cierre del checkpoint sin esperar tiempo
real.

**Rationale**: El dominio no necesita expresividad de cron (solo un
horario configurable por día con su ventana de 30 min); agregar una
librería de terceros sería complejidad no justificada para este alcance
(mismo criterio que feature 001 con `node:util.parseArgs`). Un `now()`
inyectable es imprescindible para poder escribir tests deterministas de
"se abre/cierra el checkpoint a la hora Y" sin usar temporizadores reales
de horas.

**Alternatives considered**:
- `node-cron` / `node-schedule`: rechazadas — resuelven expresiones cron
  arbitrarias, que este dominio no necesita (un solo horario/día con
  ventana de 30 min), y suman una dependencia de runtime evitable.
- Un *scheduler* basado en fechas absolutas calculadas una vez al arrancar
  el proceso (en vez de polling cada 5 min): rechazada — no reacciona bien
  a que el servicio arranque a mitad del checkpoint ya abierto (Edge
  Case de la spec), y complica el caso de reinicio a mitad de jornada.

## 3. Prevención de solapamiento de consultas (single-flight)

**Decisión**: Un flag booleano en memoria (`consultaEnCurso`) impide que
el tick de 5 minutos dispare una nueva `runQuerySession` si la anterior
todavía no terminó; el tick que encuentra el flag en `true` simplemente no
hace nada y se registra como "ciclo omitido" en el log estructurado.

**Rationale**: FR-011 (spec) y Principio III/Assumptions de feature 001
(el protocolo RS956 no está validado para sesiones TCP concurrentes). Es
el mecanismo más simple que garantiza la invariante sin necesitar una cola
de tareas.

**Alternatives considered**: Cola de consultas pendientes — rechazada,
sobre-ingeniería para un caso donde "omitir y reintentar en el próximo
tick" ya cumple la spec (FR-003/FR-012) sin perder datos (el reloj sigue
acumulando fichadas pendientes hasta la próxima consulta exitosa).

## 4. Fuente de "empleados activos" (RRHH/Oracle)

**Decisión**: Se define una interfaz `ActiveEmployeesProvider` (un solo
método async, p. ej. `getActiveEmployees(): Promise<Empleado[]>`) detrás
de la cual vive la fuente real. Para esta feature, dado que la integración
con RRHH/Oracle todavía no existe en el proyecto (spec, Assumptions), se
implementa **un único adapter placeholder** que lee un archivo de
configuración local (JSON) con la lista de legajos activos, versionado
junto al código. El adapter placeholder queda claramente marcado como
temporal en su propio código y en este documento.

**Rationale**: Constitución, Principio II exige que todo acceso a Oracle
pase por una capa de repositorio dedicada — como esta feature no conecta
a Oracle todavía (no hay credenciales, driver, ni tabla acordada), no hay
ninguna violación posible: simplemente no se toca Oracle. Definir la
interfaz ahora (en vez de hardcodear la lista dentro del scheduler) es lo
que permite reemplazar el adapter por uno real de Oracle en una feature
futura sin tocar el resto del servicio (mismo patrón de aislamiento que el
Principio III aplica al protocolo RS956).

**Alternatives considered**:
- Bloquear esta feature hasta que exista integración real con
  Oracle/RRHH: rechazada — el usuario ya resolvió explícitamente (sesión
  de clarificación) que la fuente es externa, pero no exigió que esta
  feature construya esa integración; bloquear le quita todo el valor al
  resto del servicio (scheduling, store en memoria) que sí se puede
  construir y probar hoy.
- Derivar el padrón dinámicamente de las fichadas ya vistas (opción
  descartada explícitamente en la sesión de clarificación de spec.md).

## 5. Asociación de una Fichada a un Período (año-mes)

**Decisión**: El Período de cada Fichada se calcula a partir del campo
`fecha` que ya devuelve `parseFichadaRecord` (decodificado por completo,
ver `research/protocolo_prosoft_rs596.md` §5.16 de feature 001). Si
`fecha` viniera `null` para un registro puntual (caso hoy no observado
pero contemplado por el cliente existente), se usa como respaldo la fecha
de recolección (`now()` del servicio en el momento en que se descargó esa
fichada), marcando internamente que ese período es una aproximación.

**Rationale**: spec.md, Assumptions (actualizado 2026-07-07) — ya no hay
razón para usar la fecha de recolección como fuente primaria, dado que el
protocolo decodifica la fecha real del evento con 100% de coincidencia
confirmada.

**Alternatives considered**: Ninguna — es una corrección directa de una
suposición que quedó obsoleta durante esta misma sesión de planificación.

## 6. Asociación de una Fichada al checkpoint "entrada"

**Decisión**: Dado el `hora` decodificado de una Fichada, se la asocia al
checkpoint "entrada" si esa hora cae dentro de su ventana de aceptación
de un solo lado (`[horaEsperada, horaEsperada + duracionMinutos]`). El
respaldo de asociarla al checkpoint que estaba abierto al momento de la
descarga aplica **únicamente cuando `hora` es `null`** (registro que no
se pudo decodificar, FR-006). Una fichada con **hora válida pero fuera de
la ventana** (por ejemplo, una salida de un día previo que el reloj recién
reporta a la mañana siguiente, ya dentro de la ventana de entrada de hoy)
NO se taguea a "entrada": queda con `checkpointId: null`. En cualquier
caso la fichada se guarda igual en el store, asociada al Empleado/Período
correspondiente — nunca se pierde.

Además, la **completitud se acota al día de servicio en curso**: un legajo
solo cuenta como completo para la entrada de hoy si tiene una fichada
válida (tageada "entrada") cuya `fecha` es la de hoy (para el respaldo de
`hora`/`fecha` nulas, se usa el día local de recolección). Como el store
agrupa por período mensual y conserva fichadas de días anteriores, sin
este acotamiento una entrada de ayer marcaría a un empleado como completo
hoy — cerrando el checkpoint por completitud sin que nadie fiche.

**Rationale**: FR-006/FR-008 de la spec fijan este comportamiento. La
restricción del respaldo a solo `hora === null` y el acotamiento diario de
la completitud resuelven la interacción entre "el reloj no borra fichadas"
(las de la tarde llegan al día siguiente) y "el store agrupa por mes"
(conserva días previos): sin ambos, una salida de ayer podría quedar
tageada "entrada" y/o falsear la completitud de hoy.

**Alternatives considered**:
- Descartar la fichada si no calza en la ventana de entrada — rechazada,
  viola el espíritu de FR-008 (nunca rechazar una fichada real) y el
  principio de protección de datos de la constitución.
- Mantener el respaldo "checkpoint abierto al descargar" también para
  horas válidas fuera de ventana (comportamiento previo) — rechazado: es
  justamente lo que tageaba una salida de ayer como entrada de hoy.

## 7. Forma del estado en memoria expuesto (FR-014)

**Decisión**: El servicio expone una función síncrona `getState()` que
devuelve una foto (snapshot) inmutable del estado acumulado: lista de
Empleados activos con su estado de completitud por checkpoint, y las
Fichadas acumuladas agrupadas por Empleado y Período. No hay API HTTP en
esta feature (spec, Assumptions) — es una interfaz de consulta en proceso
para quien importe el módulo del servicio.

**Rationale**: FR-014 exige poder consultar el estado "en cualquier
momento"; una función síncrona sobre una estructura en memoria ya
mantenida por el scheduler cumple esto sin necesitar IPC ni un servidor
HTTP adicional, que la spec explícitamente no pide.

**Alternatives considered**: Exponer un servidor HTTP mínimo con un
endpoint de estado — rechazada por ahora (fuera de alcance explícito de
esta feature, ver spec Assumptions); queda como posible feature futura si
se necesita acceso fuera de proceso.

## 8. Testing

**Decisión**: `node:test` + `node:assert` (igual que feature 001), sin
frameworks nuevos. Toda lógica dependiente del reloj de pared (apertura y
cierre de checkpoints) recibe un `now()` inyectable para poder simular el
paso de las horas del día en los tests sin esperar tiempo real. El cliente
RS596 se mockea con un servidor TCP de prueba igual que en
`tests/integration/` de feature 001 (reutilizando el mismo patrón de mock
scripted server).

**Rationale**: Consistencia con el resto del repo (Constitución, Principio
IV) y con las herramientas ya validadas en feature 001.

**Alternatives considered**: Ninguna — no hay motivo para desviarse del
patrón ya establecido.

## 9. Deduplicación de fichadas repetidas entre ciclos (FR-017, 2026-07-07)

**Decisión**: `FichadasMemoryStore` mantiene, además de las estructuras de
`Empleado`/`Fichada`/`Período`, un `Set<rawHex>` de todas las fichadas ya
recolectadas. Antes de agregar una fichada recién parseada, el store
comprueba si su `rawHex` ya está en ese `Set`; si es así, la descarta sin
ningún efecto (no se agrega a `periodos[]`, no cuenta para la
completitud de ningún checkpoint, no dispara log de "fichada nueva"). Si
no está, se agrega normalmente y su `rawHex` se suma al `Set`. Esta
verificación reemplaza la suposición original de esta feature (§ninguna
dedup, documentada como fuera de alcance antes de la sesión de
clarificación 2026-07-07).

**Rationale**: El reloj no borra fichadas (FR-007 heredado de feature
001) y las vuelve a reportar como pendientes en cada ciclo de sondeo de 5
minutos hasta que se borren explícitamente (operación fuera de alcance).
Sin deduplicación, el mismo evento físico se contaría una vez por cada
ciclo transcurrido desde que ocurrió — inflando arbitrariamente
`periodos[]` y rompiendo cualquier uso posterior de esos datos (por
ejemplo, para nómina). Comparar por `rawHex` es barato (un `Set` en
memoria) y suficientemente preciso: dos fichadas distintas necesitarían
coincidir en legajo, fecha, hora exacta con segundos y método de
verificación para colisionar, algo prácticamente imposible en la
práctica.

**Alcance del `Set` de deduplicación**: vive en el mismo store en memoria
que las fichadas — es decir, dura mientras el proceso esté vivo (no hay
persistencia entre reinicios, igual que el resto del estado, spec
Assumptions) y no se reinicia diariamente junto con los checkpoints (los
`Período` sí acumulan fichadas a través de varios días dentro del mismo
mes, así que la deduplicación debe cubrir esa misma ventana de tiempo).

**Alternatives considered**:
- Deduplicar por `legajo + fecha + hora` en vez de `rawHex` completo —
  rechazada: `rawHex` ya contiene esos campos y es lo que el cliente
  existente expone de forma más directa; usar un subconjunto de campos
  agrega complejidad sin ganar precisión.
- Delegar la deduplicación a una capa futura fuera de esta feature (la
  suposición original) — rechazada explícitamente por el usuario en la
  sesión de clarificación 2026-07-07: sin este control, el propio
  `getState()` de esta feature (US3) ya mostraría datos incorrectos
  (fichadas contadas múltiples veces), no es algo que se pueda diferir sin
  romper el valor de US1/US3.
