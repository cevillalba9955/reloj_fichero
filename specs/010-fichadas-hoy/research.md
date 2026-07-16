# Research: Página "Fichadas de Hoy"

## §1. Vocabulario de "situación" (ESPERANDO/PRESENTE/TARDE/AUSENTE/…)

**Decisión**: nueva función pura `calcularSituacionHoy({ clasificacion, auto, ajustado,
ahora, params })` en `src/presentismo/domain/situacion-dia.js`, que deriva un valor de
`SituacionDia` a partir del resultado de jornada de 004 (`calcularJornadaAuto` +
`aplicarAjustes`) y la hora actual del servidor (minutos-del-día). No reemplaza
`EstadoJornada` (que sigue siendo el estado retrospectivo de cierre de día, usado por
el resumen de período); es una proyección adicional, específica de "hoy", que solo
tiene sentido mientras el día está en curso.

Reglas (derivadas de spec.md Acceptance Scenarios, User Story 1):

- `AUSENTE`: día `Laborable`, sin fichada de entrada, y `ahora` ya pasó
  `ventanaEntrada.hasta` (o el cierre oficial, si no hay ventana configurada). Antes de
  ese punto, sin entrada todavía → `ESPERANDO`.
- `ESPERANDO`: día `Laborable`, sin fichada de entrada, `ahora` dentro de la ventana de
  entrada.
- `TARDE`: hay fichada de entrada pero fuera del margen de tolerancia de apertura
  (`horaEfectivaEntrada(entrada.hora, params) !== entrada.hora`, i.e. la entrada real
  quedó fuera de `[aperturaOficial, aperturaOficial+margenApertura]`).
- `PRESENTE`: hay fichada de entrada dentro de margen, todavía sin salida y sin retiro
  anticipado registrado.
- Jornada completa (`estado: 'Completa'` de 004, mapeado a una etiqueta de situación
  distinta, ej. `'Completa'`): hay entrada y salida (o corrección vigente) dentro de lo
  esperado.
- `RETIRO_ANTICIPADO`: hay una pausa vigente con `tipo: 'retiro_anticipado'` para el
  día — prevalece sobre `PRESENTE`/`Completa` como etiqueta visible, aunque el cálculo
  de horas siga las mismas reglas de descuento de pausa.
- `ANOMALIA`: el empleado no tiene categoría configurada (mismo caso que 004
  `sinCalculo: true`) — se muestra distinguido, sin intentar una situación normal
  (FR-014 del spec).
- Día `No Laborable` o `Feriado`: no se calcula `ESPERANDO`/`AUSENTE`; se usa una
  etiqueta que refleja el estado de 004 (`Feriado cumplido` o `No aplica`) para no
  penalizar al empleado (edge case del spec).

**Alternativas consideradas**:
- *Guardar la situación como campo persistido, recalculado en cada corrección*:
  rechazada — la situación depende de la hora actual (`ahora`), no es un dato estable;
  persistirla la volvería inconsistente apenas pasa un minuto. Se mantiene como
  proyección calculada al servir la vista (igual criterio que `EstadoJornada`,
  determinista y derivado, research §6 de 004).
- *Reutilizar `EstadoJornada` tal cual, sin nuevo vocabulario*: rechazada — `Completa`/
  `Incompleta`/`Sin fichadas` son estados de cierre de día (evalúan si YA se cerró la
  jornada); no distinguen "todavía dentro de la ventana de entrada" (`ESPERANDO`) de
  "ya venció la ventana" (`AUSENTE`), que es exactamente lo que pide el spec para un
  día en curso.

## §2. Retiro anticipado como Pausa con `tipo`

**Decisión**: extender la entidad `Pausa` (ya persistida por 004 vía
`repo.guardarPausa`/`listarPausas`) con un campo opcional `tipo: 'intermedia' |
'retiro_anticipado'` (default `'intermedia'` si se omite, retrocompatible con pausas ya
guardadas sin el campo). Un retiro anticipado se modela como una pausa cuyo intervalo
va desde la hora de retiro (`desde`) hasta el cierre oficial de la jornada (`hasta =
params.cierreOficial`), con motivo y autor obligatorios (mismas reglas que 004 FR-040).
`descuentoPausas` no cambia: sigue sumando el solape con `[entradaEfectiva,
salidaEfectiva]` sin distinguir tipo — el descuento de horas de un retiro anticipado es,
matemáticamente, el mismo cálculo que una pausa que llega hasta el cierre.

`calcularSituacionHoy` sí distingue por `tipo` para la etiqueta visible (RETIRO_ANTICIPADO
vs. situación normal), y la vista/API exponen el campo para que la UI pueda listar
retiros por separado de pausas intermedias (spec, Key Entities).

**Alternativas consideradas**:
- *Entidad nueva "Retiro Anticipado" con su propio método de repositorio
  (`guardarRetiro`/`listarRetiros`)*: rechazada por ahora — duplicaría persistencia,
  validación de motivo y logging que ya existen para pausas, sin ganancia funcional
  (el spec no pide que retiros y pausas se administren con reglas distintas, solo que se
  puedan reportar por separado, lo que el campo `tipo` ya resuelve). Si en el futuro
  un retiro anticipado necesita reglas propias (p. ej. aprobación en dos pasos), se
  puede separar entonces sin romper el archivo ya persistido (el campo `tipo` queda
  como discriminador).

## §3. Corrección de entrada/salida (no solo total de horas)

**Decisión**: extender `crearCorreccion` para aceptar, además del `valorCorregido`
(total, comportamiento actual de 004), un par opcional `entradaCorregida`/
`salidaCorregida` (minutos-del-día). Cuando están presentes, `aplicarAjustes` (en
`jornada.js`) las usa para recalcular `entradaEfectiva`/`salidaEfectiva` con las mismas
funciones ya existentes (`horaEfectivaEntrada`/`horaEfectivaSalida`) y deriva el total
en vez de exigir que quien corrige calcule el total a mano. `camposCorregidos` pasa a
incluir `'entrada'`/`'salida'` según corresponda (reemplaza el default `['horas']`
cuando se corrige un horario puntual). El campo `valorCorregido` (total) se mantiene
como override directo para el caso en que un administrador solo quiere ajustar el
total sin declarar una hora puntual (compatibilidad con 004).

**Alternativas consideradas**:
- *Mantener corrección solo a nivel de total de horas, y que la UI "adivine" cómo
  mostrar una hora de entrada/salida corregida*: rechazada — el spec (FR-001, Historia
  2) exige que la lista muestre la hora de entrada/salida corregida, no solo el total;
  inventar una hora en la UI sin que quede en el registro de auditoría violaría el
  Principio V (trazabilidad) y FR-005 del spec (registro con valor anterior/nuevo).
- *Reemplazar `calcularJornadaAuto` para que ya contemple correcciones*: rechazada —
  rompería la separación ya establecida en 004 entre cálculo automático (determinista,
  FR-023 de 004) y ajustes manuales (`aplicarAjustes`), que es justamente lo que permite
  auditar qué fue automático y qué fue corregido.

## §4. Consulta manual al reloj ("consultar nuevas fichadas")

**Decisión**: la API web dispara `scheduler.tick()` (ya existente, feature 002,
single-flight vía `consultaEnCurso`) sobre una instancia de scheduler cableada en el
contexto web (`crearContextoWeb`, hoy sin scheduler). Tras el `tick`, si hubo fichadas
nuevas en el store en memoria, se reutiliza la lógica de importación que hoy solo
expone el subcomando CLI `importar-fichadas` (factorizada como función de servicio
`importarFichadasDesdeMemoria(periodo)` en `src/presentismo/adapters/
file-fichadas-archive.js`, invocable tanto desde el CLI como desde el nuevo handler
web) para que esas fichadas queden en el archivo acumulativo del período y
`calcularEmpleado`/`calcularHoy` las vean de inmediato. El endpoint
`POST /api/fichadas-hoy/consultar-reloj` no introduce un segundo lock: delega el
single-flight al scheduler y devuelve `{ resultado: 'ok'|'omitido'|'error',
fichadasNuevas, detail }` (misma forma que `getUltimoCiclo()`).

**Alternativas consideradas**:
- *Nuevo mecanismo de sincronización independiente del scheduler (una consulta HTTP
  directa al reloj)*: rechazada — duplicaría el driver del protocolo fuera de su
  módulo aislado (violaría Principio III) y el single-flight ya resuelto en 002.
- *Importar automáticamente en cada `GET /api/fichadas-hoy`*: rechazada — acoplaría
  lectura con escritura de red hacia el dispositivo en cada refresco de pantalla,
  contra el requisito del spec de que la consulta al reloj sea un disparo explícito
  (FR-008, Historia 4) y contra el principio de que el reloj se consulta bajo demanda o
  por el ciclo programado, no en cada GET.

## §5. Roster/nombre del empleado en el wiring web

**Decisión**: `crearContextoWeb` (hoy solo arma `repo`/`service`/`categoriasConfig`/
`logger`) se extiende para construir también un `ActiveEmployeesProvider` (adapter
`local-file-active-employees-provider.js` ya existente, sobre el snapshot del padrón de
004) y pasarlo al servicio como fuente de legajo+nombre de los "empleados esperados
hoy". No se agrega una dependencia nueva a Oracle desde la capa web: se sigue leyendo
el snapshot local, igual que hace el CLI de 004.

**Alternativas consideradas**:
- *Consultar Oracle directo desde el handler web para el nombre*: rechazada — violaría
  Principio II (todo acceso a Oracle pasa por `src/db/`) y duplicaría el snapshot ya
  mantenido por 004; el snapshot ya se sincroniza vía `sincronizar-padron` (CLI de 004).
