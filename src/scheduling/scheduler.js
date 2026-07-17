import { runQuerySession } from '../protocol/client.js';
import { parseFichadaRecord } from '../protocol/records.js';
import { createSessionLogger } from '../logging/session-logger.js';
import { createServiceCycleLogger } from '../logging/service-cycle-logger.js';

// research.md §2/§3: temporizador de 5 minutos, single-flight (nunca dos
// sesiones TCP simultaneas contra el mismo reloj), y evaluacion de
// apertura/cierre de checkpoints en cada tick. `computeCompletitud` es un
// predicado inyectable por checkpointId (async, ya que en US2 consulta el
// padron de empleados activos); por defecto siempre `false`, para que en
// Foundational/US1 los checkpoints solo cierren por vencimiento de la
// ventana (FR-004, mitad "a" de la condicion queda deshabilitada hasta que
// se integre el padron).
export function createScheduler({
  host,
  port = 5005,
  checkpoints,
  store,
  computeCompletitud = async () => false,
  logDir,
  serviceId = 'servicio-fichadas',
  now = () => new Date(),
  timeoutMs = 5000,
  tickIntervalMs = 5 * 60 * 1000,
  fullHandshake = false,
  // spec 005: sink opcional de persistencia durable. Recibe las fichadas ya
  // parseadas del ciclo. Se inyecta desde el composition root (el scheduler no
  // conoce el dominio de presentismo). Sin sink, el servicio no persiste.
  persistirFichadas = null,
}) {
  const cycleLogger = createServiceCycleLogger({ serviceId, logDir, now });

  let consultaEnCurso = false;
  let timerId = null;
  let ultimoCiclo = null;
  let cicloContador = 0;

  async function evaluarCheckpoints(instante) {
    for (const checkpoint of checkpoints) {
      // eslint-disable-next-line no-await-in-loop
      const completo = await computeCompletitud(checkpoint.id);
      checkpoint.evaluar(instante, completo);
    }
  }

  function registrar({ resultado, fichadasNuevas, duracionMs, detail }) {
    ultimoCiclo = cycleLogger.logCiclo({ resultado, fichadasNuevas, duracionMs, detail });
    return ultimoCiclo;
  }

  // research.md §3: single-flight — si ya hay una consulta en curso, el
  // tick no dispara nada nuevo y se registra como "omitido"
  // (contracts/service-contract.md). El chequeo y la adquisicion del
  // "lock" (`consultaEnCurso`) DEBEN quedar sincronicos, antes de cualquier
  // `await`: si se hiciera despues de awaitear la evaluacion de checkpoints,
  // dos ticks solapados podrian pasar ambos el chequeo antes de que
  // cualquiera de los dos marque `consultaEnCurso = true` (race condition).
  //
  // feature 010: `forzarConsulta` saltea el chequeo de ventana abierta (la
  // consulta manual del administrador puede dispararse en cualquier momento)
  // pero respeta EXACTAMENTE el mismo single-flight — nunca dos sesiones TCP
  // concurrentes. El temporizador interno sigue llamando tick() sin opciones.
  async function tick({ forzarConsulta = false } = {}) {
    if (consultaEnCurso) {
      registrar({ resultado: 'omitido', fichadasNuevas: 0, duracionMs: 0, detail: 'consulta ya en curso' });
      return;
    }
    consultaEnCurso = true;
    const inicio = now();

    try {
      await evaluarCheckpoints(inicio);

      const hayCheckpointAbierto = checkpoints.some((cp) => cp.estaAbierto());
      if (!hayCheckpointAbierto && !forzarConsulta) {
        registrar({ resultado: 'omitido', fichadasNuevas: 0, duracionMs: 0 });
        return;
      }

      cicloContador += 1;
      const sessionId = `${serviceId}-ciclo-${cicloContador}`;
      const sessionLogger = createSessionLogger({ sessionId, logDir, now });

      const { session, rawRecords } = await runQuerySession({
        host,
        port,
        timeoutMs,
        sessionId,
        logger: sessionLogger,
        fullHandshake,
      });

      if (session.status === 'error') {
        const duracionMs = now().getTime() - inicio.getTime();
        registrar({ resultado: 'error', fichadasNuevas: 0, duracionMs, detail: session.errorReason });
        return;
      }

      let fichadasNuevas = 0;
      const fichadasDelCiclo = [];
      for (const raw of rawRecords) {
        const fichadaParseada = parseFichadaRecord(raw);
        fichadasDelCiclo.push(fichadaParseada);
        const { agregada } = store.addFichada(fichadaParseada, { checkpoints, now: inicio });
        if (agregada) fichadasNuevas += 1;
      }

      // spec 005: persistencia durable. Se persisten TODAS las fichadas
      // parseadas del ciclo (no solo las nuevas del store): la dedup por rawHex
      // del archivo hace el reintento idempotente ante un fallo transitorio, de
      // modo que ninguna fichada se pierda (FR-004/FR-006). Un fallo de
      // persistencia se registra como ciclo `error` y se reintenta el proximo
      // ciclo (el reloj sigue reportando las pendientes). Nunca se loguea rawHex.
      if (persistirFichadas && fichadasDelCiclo.length > 0) {
        try {
          await persistirFichadas(fichadasDelCiclo);
        } catch (errPersist) {
          const duracionMs = now().getTime() - inicio.getTime();
          registrar({
            resultado: 'error',
            fichadasNuevas,
            duracionMs,
            detail: `persistencia de fichadas fallida: ${errPersist.message}`,
          });
          return;
        }
      }

      // Una fichada recien agregada puede completar un checkpoint dentro
      // del mismo ciclo; se re-evaluan antes de cerrar el ciclo.
      await evaluarCheckpoints(now());

      const duracionMs = now().getTime() - inicio.getTime();
      registrar({ resultado: 'success', fichadasNuevas, duracionMs });
    } catch (err) {
      const duracionMs = now().getTime() - inicio.getTime();
      registrar({ resultado: 'error', fichadasNuevas: 0, duracionMs, detail: err.message });
    } finally {
      consultaEnCurso = false;
    }
  }

  function start() {
    // Corre un primer ciclo de inmediato (Edge Case: el servicio arranca a
    // mitad de una ventana ya abierta, no hay que esperar el primer tick).
    tick();
    timerId = setInterval(tick, tickIntervalMs);
  }

  function stop() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function getUltimoCiclo() {
    return ultimoCiclo;
  }

  return { start, stop, tick, getUltimoCiclo };
}
