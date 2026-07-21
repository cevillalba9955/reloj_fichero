import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { startService } from '../service/consulta-programada-service.js';
import { createLocalFileActiveEmployeesProvider } from '../roster/local-file-active-employees-provider.js';
import { readOracleRosterConfig, ConfiguracionPadronInvalidaError } from '../db/oracle-roster-config.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { createOracleActiveEmployeesProvider } from '../roster/oracle-active-employees-provider.js';
import { createDailyCachedActiveEmployeesProvider } from '../roster/daily-cached-active-employees-provider.js';
import { createRosterFetchLogger } from '../logging/roster-fetch-logger.js';
import { registrarFichadas } from '../presentismo/adapters/file-fichadas-archive.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createPresentismoLogger } from '../presentismo/logging/presentismo-logger.js';

export class InvalidArgsError extends Error {}

const PADRON_MODES = new Set(['archivo', 'oracle']);

// Precedencia de configuración: argumento CLI explícito > variable de entorno
// FICHADAS_* > default. Así, quien ya invoca por línea de comandos no cambia
// nada, y el .env (cargado con `npm run servicio`, que usa
// --env-file-if-exists) solo aporta lo que no se pase por CLI.
function pick(cliValue, envValue, def) {
  if (cliValue !== undefined) return cliValue;
  if (envValue !== undefined && envValue !== '') return envValue;
  return def;
}

function parseEntero(nombre, valor) {
  const n = Number(valor);
  if (!Number.isInteger(n)) {
    throw new InvalidArgsError(`${nombre} invalido: "${valor}" (se espera un entero)`);
  }
  return n;
}

function parseBooleano(envValue) {
  return envValue === 'true' || envValue === '1';
}

// contracts/service-contract.md (feature 002) + contracts/roster-provider-contract.md:
// --host obligatorio (o FICHADAS_HOST). El resto toma los defaults de FR-002
// (único checkpoint "entrada" 07:00 con ventana de un solo lado de 30 min,
// sondeo cada 5min) salvo que se sobreescriban por CLI o por variables de
// entorno FICHADAS_*.
export function parseCliArgs(argv, env = process.env) {
  let values;
  try {
    // Sin `default` en parseArgs: un valor no provisto queda `undefined`, para
    // poder distinguir "no lo pasaron por CLI" y caer al env/default (pick()).
    ({ values } = parseArgs({
      args: argv,
      options: {
        host: { type: 'string' },
        port: { type: 'string' },
        padron: { type: 'string' },
        'roster-config': { type: 'string' },
        'log-dir': { type: 'string' },
        'timeout-ms': { type: 'string' },
        'tick-interval-ms': { type: 'string' },
        'status-interval-ms': { type: 'string' },
        'entrada-hora': { type: 'string' },
        'entrada-duracion': { type: 'string' },
        'repo-dir': { type: 'string' },
        'control-port': { type: 'string' },
        'full-handshake': { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    throw new InvalidArgsError(err.message);
  }

  const host = pick(values.host, env.FICHADAS_HOST, undefined);
  if (!host) {
    throw new InvalidArgsError(
      'Falta la IP del reloj RS596: pasala por --host <ip> o por la variable de entorno FICHADAS_HOST. ' +
      'Uso: --host <ip> [--port 5005] [--padron archivo|oracle] ' +
      '[--roster-config ./config/active-employees.json] [--log-dir ./logs] [--timeout-ms 5000] ' +
      '[--tick-interval-ms 300000] [--status-interval-ms 60000] ' +
      '[--entrada-hora 07:00] [--entrada-duracion 30] ' +
      '[--full-handshake]. Cualquiera de estos tambien se puede fijar por FICHADAS_* en el .env.'
    );
  }

  const padron = pick(values.padron, env.FICHADAS_PADRON, 'archivo');
  if (!PADRON_MODES.has(padron)) {
    throw new InvalidArgsError(
      `padron invalido: "${padron}". Valores validos: archivo | oracle (FR-013). ` +
      'Se fija por --padron o FICHADAS_PADRON.'
    );
  }

  const port = parseEntero('--port / FICHADAS_PORT', pick(values.port, env.FICHADAS_PORT, '5005'));
  if (port <= 0) throw new InvalidArgsError(`--port / FICHADAS_PORT invalido: "${port}" (debe ser > 0)`);

  const timeoutMs = parseEntero('--timeout-ms / FICHADAS_TIMEOUT_MS', pick(values['timeout-ms'], env.FICHADAS_TIMEOUT_MS, '5000'));
  if (timeoutMs <= 0) throw new InvalidArgsError(`--timeout-ms / FICHADAS_TIMEOUT_MS invalido: "${timeoutMs}" (debe ser > 0)`);

  const tickIntervalMs = parseEntero(
    '--tick-interval-ms / FICHADAS_TICK_INTERVAL_MS',
    pick(values['tick-interval-ms'], env.FICHADAS_TICK_INTERVAL_MS, String(5 * 60 * 1000))
  );
  if (tickIntervalMs <= 0) throw new InvalidArgsError(`--tick-interval-ms / FICHADAS_TICK_INTERVAL_MS invalido: "${tickIntervalMs}" (debe ser > 0)`);

  const statusIntervalMs = parseEntero(
    '--status-interval-ms / FICHADAS_STATUS_INTERVAL_MS',
    pick(values['status-interval-ms'], env.FICHADAS_STATUS_INTERVAL_MS, String(60 * 1000))
  );
  if (statusIntervalMs <= 0) throw new InvalidArgsError(`--status-interval-ms / FICHADAS_STATUS_INTERVAL_MS invalido: "${statusIntervalMs}" (debe ser > 0)`);

  const entradaDuracion = parseEntero('--entrada-duracion / FICHADAS_ENTRADA_DURACION', pick(values['entrada-duracion'], env.FICHADAS_ENTRADA_DURACION, '30'));
  if (entradaDuracion < 0) throw new InvalidArgsError(`--entrada-duracion / FICHADAS_ENTRADA_DURACION invalido: "${entradaDuracion}" (debe ser >= 0)`);

  // feature 010 (US4): puerto del servidor de control HTTP local (127.0.0.1).
  // OPT-IN: sin --control-port ni FICHADAS_CONTROL_PORT, el servidor de control
  // no se levanta (una instalacion sin la pagina web no cambia su superficie de
  // red, contracts/control-api.md).
  const controlPortRaw = pick(values['control-port'], env.FICHADAS_CONTROL_PORT, undefined);
  let controlPort = null;
  if (controlPortRaw !== undefined) {
    controlPort = parseEntero('--control-port / FICHADAS_CONTROL_PORT', controlPortRaw);
    if (controlPort <= 0) {
      throw new InvalidArgsError(`--control-port / FICHADAS_CONTROL_PORT invalido: "${controlPort}" (debe ser > 0)`);
    }
  }

  return {
    host,
    port,
    padron,
    rosterConfigPath: pick(values['roster-config'], env.FICHADAS_ROSTER_CONFIG, './config/active-employees.json'),
    logDir: pick(values['log-dir'], env.FICHADAS_LOG_DIR, './logs'),
    // spec 005 + 013-reestructurar-data-periodos: destino de la persistencia
    // durable de fichadas; la MISMA raíz que consume `calcular`
    // (PRESENTISMO_REPO_DIR), resuelta por período (P<periodo>/fichadas.json).
    repoDir: pick(values['repo-dir'], env.PRESENTISMO_REPO_DIR, './data/presentismo'),
    timeoutMs,
    tickIntervalMs,
    statusIntervalMs,
    controlPort,
    fullHandshake: values['full-handshake'] || parseBooleano(env.FICHADAS_FULL_HANDSHAKE),
    checkpoints: {
      entrada: {
        horaEsperada: pick(values['entrada-hora'], env.FICHADAS_ENTRADA_HORA, '07:00'),
        duracionMinutos: entradaDuracion,
      },
    },
  };
}

// FR-013: la selección del origen del padrón (archivo local o RRHH/Oracle) es
// una decisión de configuración, no de código. Con `oracle`, valida la
// configuración de entorno de forma fail-fast (FR-004/FR-005) ANTES de armar
// la cadena repositorio → provider Oracle → decorator diario; una config
// inválida lanza ConfiguracionPadronInvalidaError (el CLI aborta el arranque).
export function createRosterProvider(
  options,
  { env = process.env, serviceId = 'servicio-fichadas' } = {}
) {
  if (options.padron === 'oracle') {
    const config = readOracleRosterConfig(env); // fail-fast: nombra faltantes, sin exponer valores
    const rosterLogger = createRosterFetchLogger({ serviceId, logDir: options.logDir });
    const repository = createOracleRosterRepository({ config });
    const inner = createOracleActiveEmployeesProvider({ repository, logger: rosterLogger });
    return createDailyCachedActiveEmployeesProvider({ inner, logger: rosterLogger });
  }
  return createLocalFileActiveEmployeesProvider({ filePath: options.rosterConfigPath });
}

// spec 005 (composition root): arma el sink de persistencia durable. Es el
// ÚNICO punto que acopla el servicio (feature 002) con el archivo de fichadas
// de presentismo (feature 004). Agrupa las fichadas parseadas por período
// (`fecha`→`YYYYMM`; sin fecha → período de la fecha de recolección, igual que
// el store en memoria) y hace upsert deduplicado por rawHex en el archivo del
// período. El rawHex se guarda en el archivo (trazabilidad), nunca en logs.
function periodoDeFichada(fichada, now) {
  if (typeof fichada.fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fichada.fecha)) {
    return fichada.fecha.slice(0, 4) + fichada.fecha.slice(5, 7);
  }
  const d = now();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 013-reestructurar-data-periodos (FR-006, research.md §4): este sink NO pasa
// por el servicio, así que repite la misma guarda de `exigirPeriodoAbierto`
// antes de escribir. A diferencia de un endpoint HTTP, no hay un llamador
// esperando una respuesta 409: un período cerrado simplemente se omite (no se
// escribe, no se pierde — las fichadas del reloj se re-reportan como
// pendientes en el próximo ciclo), y se deja constancia en el logger si se
// provee uno.
export function createFichadasSink({ repoDir, now = () => new Date(), logger = null }) {
  const repo = createFilePresentismoRepository({ repoDir });
  return async function persistirFichadas(fichadas) {
    const porPeriodo = new Map();
    for (const f of fichadas) {
      const periodo = periodoDeFichada(f, now);
      if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, []);
      porPeriodo.get(periodo).push(f);
    }
    for (const [periodo, grupo] of porPeriodo) {
      const calendario = await repo.cargarCalendario(periodo);
      if (calendario?.cerrado === true) {
        logger?.evento('fichadas_rechazadas_periodo_cerrado', { periodo, omitidas: grupo.length });
        continue;
      }
      registrarFichadas({ repoDir, periodo, fichadas: grupo, now });
    }
  };
}

// feature 010 (US4, research.md §4): servidor de control HTTP local del
// servicio de fichadas. Atado EXCLUSIVAMENTE a 127.0.0.1 (nunca a una interfaz
// externa): es el canal por el que el proceso web (rs956-web.service) pide un
// ciclo fuera de horario al UNICO dueño de la conexion al reloj (Principio
// III). Una sola ruta: POST /tick → { resultado: "ok"|"omitido"|"error",
// fichadasNuevas, detail } (contracts/control-api.md). Un ciclo con error del
// reloj sigue siendo HTTP 200: el POST /tick en si se ejecuto; la API web es
// la que lo traduce a 502 hacia el frontend.
export function crearServidorControl({ tick, port, host = '127.0.0.1' }) {
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method !== 'POST' || pathname !== '/tick') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'Solo POST /tick' } }));
      return;
    }
    try {
      const ciclo = await tick();
      const body = {
        resultado: ciclo?.resultado === 'success' ? 'ok' : ciclo?.resultado ?? 'error',
        fichadasNuevas: ciclo?.fichadasNuevas ?? 0,
        detail: ciclo?.detail ?? null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ resultado: 'error', fichadasNuevas: 0, detail: err.message }));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

function formatEstadoResumen(state) {
  const lineas = [`Fecha del servicio: ${state.fechaServicio}`];
  for (const cp of state.checkpoints) {
    lineas.push(`  Checkpoint "${cp.id}" (ventana ${cp.horaEsperada} +${cp.duracionMinutos}min): ${cp.estado}`);
  }
  if (state.empleados) {
    const completos = state.empleados.filter((e) => Object.values(e.checkpoints).every((c) => c.completo)).length;
    lineas.push(`  Empleados activos: ${state.empleados.length} (completos en todos los checkpoints: ${completos})`);
  }
  const totalFichadas = state.periodos.reduce((acc, p) => acc + p.fichadas.length, 0);
  lineas.push(`  Fichadas acumuladas: ${totalFichadas} (en ${state.periodos.length} periodo(s))`);
  if (state.ultimoCiclo) {
    lineas.push(
      `  Ultimo ciclo: ${state.ultimoCiclo.resultado} ` +
      `(${state.ultimoCiclo.fichadasNuevas} nueva(s), ${state.ultimoCiclo.duracionMs}ms) ` +
      `a las ${state.ultimoCiclo.ejecutadoEn}`
    );
  }
  return lineas.join('\n');
}

// Arranca el servicio como proceso de larga duración: imprime un resumen
// del estado al iniciar y cada `statusIntervalMs`, y se detiene de forma
// prolija ante SIGINT/SIGTERM (contracts/service-contract.md: stop() no
// fuerza el cierre de una sesion en curso).
export function runService(
  options,
  { print = console.log, statusIntervalMs = options.statusIntervalMs ?? 60 * 1000, onShutdown, persistirFichadas } = {}
) {
  // Fail-fast: si `--padron oracle` tiene configuración inválida, esto lanza
  // ConfiguracionPadronInvalidaError ANTES de programar ningún ciclo (FR-005).
  const rosterProvider = createRosterProvider(options);

  // spec 005: por defecto el servicio persiste las fichadas en el archivo por
  // período (fuente de `calcular`). Inyectable para tests. El logger de
  // presentismo (013-reestructurar-data-periodos) deja constancia si algún
  // grupo se omite por período cerrado (FR-006).
  const sink =
    persistirFichadas ??
    createFichadasSink({ repoDir: options.repoDir, logger: createPresentismoLogger({ logDir: options.logDir }) });

  const handle = startService({
    host: options.host,
    port: options.port,
    logDir: options.logDir,
    timeoutMs: options.timeoutMs,
    tickIntervalMs: options.tickIntervalMs,
    fullHandshake: options.fullHandshake,
    checkpoints: options.checkpoints,
    rosterProvider,
    persistirFichadas: sink,
  });

  // feature 010 (US4): control local opcional (solo si se configuro el puerto).
  let controlServer = null;
  if (options.controlPort) {
    crearServidorControl({ tick: handle.tick, port: options.controlPort }).then((srv) => {
      controlServer = srv;
      print(`Control local del servicio (POST /tick) en http://127.0.0.1:${options.controlPort}`);
    });
  }

  const origenPadron = options.padron === 'oracle'
    ? 'RRHH/Oracle (variables RRHH_ORACLE_*)'
    : options.rosterConfigPath;
  print(`Servicio de consulta programada iniciado contra ${options.host}:${options.port}`);
  print(`Padron de empleados activos: ${origenPadron}`);
  print(`Sondeo cada ${options.tickIntervalMs}ms; timeout por consulta ${options.timeoutMs}ms`);
  print(`Log de ciclos: ${options.logDir}`);
  print(`Fichadas persistidas en: ${options.repoDir} (P<periodo>/fichadas.json)`);
  print(formatEstadoResumen(handle.getState()));

  const statusTimer = setInterval(() => {
    print('---');
    print(formatEstadoResumen(handle.getState()));
  }, statusIntervalMs);
  statusTimer.unref?.();

  function shutdown(signal) {
    print(`\nRecibida ${signal}: deteniendo el servicio...`);
    clearInterval(statusTimer);
    controlServer?.close();
    handle.stop();
    print('Servicio detenido (una sesion en curso, si la hubiera, termina por si sola).');
    onShutdown?.();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return handle;
}

function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 3;
    return;
  }
  try {
    runService(options, { onShutdown: () => process.exit(0) });
  } catch (err) {
    // FR-005: configuración del padrón Oracle inválida → abortar el arranque
    // con un mensaje accionable, antes de programar ciclos.
    if (err instanceof ConfiguracionPadronInvalidaError) {
      console.error(err.message);
      process.exitCode = 4;
      return;
    }
    throw err;
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
