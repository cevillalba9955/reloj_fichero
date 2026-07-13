import { createDefaultCheckpoints } from '../scheduling/checkpoint.js';
import { createScheduler } from '../scheduling/scheduler.js';
import { createFichadasMemoryStore } from '../store/fichadas-memory-store.js';
import { assertActiveEmployeesProvider } from '../roster/active-employees-provider.js';

function formatFecha(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// contracts/service-contract.md: startService(options) -> ServiceHandle.
// Orquesta el store en memoria, los checkpoints y el scheduler; reutiliza
// el cliente RS956 de 001-consulta-fichadas-rs596 (via scheduler.js), sin
// tocar protocolo.
export function startService(options) {
  const {
    host,
    port = 5005,
    checkpoints: checkpointsConfig,
    logDir,
    serviceId = 'servicio-fichadas',
    now = () => new Date(),
    timeoutMs = 5000,
    tickIntervalMs = 5 * 60 * 1000,
    fullHandshake = false,
    // FR-005: opcional — sin el, los checkpoints solo cierran por margen
    // agotado (mitad "a" de FR-004 deshabilitada) y getState() no expone
    // `empleados[]` (US1). Con el, se integra el padron de empleados
    // activos como predicado de completitud real (US2).
    rosterProvider = null,
    // spec 005: sink opcional de persistencia durable de fichadas; se pasa tal
    // cual al scheduler. Sin el, el servicio no persiste (comportamiento previo).
    persistirFichadas = null,
  } = options;

  if (rosterProvider) {
    assertActiveEmployeesProvider(rosterProvider);
  }

  const store = createFichadasMemoryStore();
  const checkpoints = createDefaultCheckpoints(checkpointsConfig);

  // FR-006/FR-013: predicado de completitud real cuando hay rosterProvider
  // ("todos los empleados activos tienen fichada" — vacuamente true si el
  // padron esta vacio, gracias a Array.prototype.every). Si getActiveEmployees()
  // rechaza, el error se propaga tal cual hasta el catch generico del
  // scheduler (se registra como ciclo "error", sin asumir un padron vacio).
  // Se recuerda el ultimo padron obtenido con exito para que getState()
  // (sincrono) pueda exponer `empleados[]` sin volver a await-ear.
  let ultimoRosterConocido = [];

  async function computeCompletitud(checkpointId) {
    if (!rosterProvider) return false;
    const empleadosActivos = await rosterProvider.getActiveEmployees();
    ultimoRosterConocido = empleadosActivos;
    return empleadosActivos.every((empleado) =>
      store.tieneFichadaValidaParaCheckpoint(empleado.legajo, checkpointId)
    );
  }

  const scheduler = createScheduler({
    host,
    port,
    checkpoints,
    store,
    computeCompletitud,
    logDir,
    serviceId,
    now,
    timeoutMs,
    tickIntervalMs,
    fullHandshake,
    persistirFichadas,
  });

  scheduler.start();

  function buildEmpleadoCheckpoints(legajo) {
    const fichadasDelLegajo = store.getFichadasPorLegajo(legajo);
    const resultado = {};
    for (const checkpoint of checkpoints) {
      const fichadaQueLoCompleta = fichadasDelLegajo.find((f) => f.checkpointId === checkpoint.id);
      resultado[checkpoint.id] = {
        completo: Boolean(fichadaQueLoCompleta),
        fichadaRawHex: fichadaQueLoCompleta?.rawHex ?? null,
      };
    }
    return resultado;
  }

  // FR-014: snapshot sincrono del estado acumulado (contracts/state-schema.json).
  // `empleados[]` solo se expone cuando hay un rosterProvider configurado
  // (US2); sin el, queda `undefined` (US1).
  function getState() {
    return {
      fechaServicio: formatFecha(now()),
      checkpoints: checkpoints.map((cp) => ({
        id: cp.id,
        horaEsperada: cp.horaEsperada,
        margenMinutos: cp.margenMinutos,
        estado: cp.estado,
      })),
      empleados: rosterProvider
        ? ultimoRosterConocido.map((empleado) => ({
            legajo: empleado.legajo,
            activo: true,
            checkpoints: buildEmpleadoCheckpoints(empleado.legajo),
          }))
        : undefined,
      periodos: store.getPeriodos(),
      ultimoCiclo: scheduler.getUltimoCiclo(),
    };
  }

  function stop() {
    scheduler.stop();
  }

  return { getState, stop };
}
