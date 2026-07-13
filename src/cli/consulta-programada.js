import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { startService } from '../service/consulta-programada-service.js';
import { createLocalFileActiveEmployeesProvider } from '../roster/local-file-active-employees-provider.js';
import { readOracleRosterConfig, ConfiguracionPadronInvalidaError } from '../db/oracle-roster-config.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { createOracleActiveEmployeesProvider } from '../roster/oracle-active-employees-provider.js';
import { createDailyCachedActiveEmployeesProvider } from '../roster/daily-cached-active-employees-provider.js';
import { createRosterFetchLogger } from '../logging/roster-fetch-logger.js';
import { registrarFichadas } from '../presentismo/adapters/file-fichadas-archive.js';

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
// (checkpoints entrada/salida 07:00/16:00 ± 30min, sondeo cada 5min) salvo que
// se sobreescriban por CLI o por variables de entorno FICHADAS_*.
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
        'entrada-margen': { type: 'string' },
        'salida-hora': { type: 'string' },
        'salida-margen': { type: 'string' },
        'fichadas-archive-dir': { type: 'string' },
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
      '[--entrada-hora 07:00] [--entrada-margen 30] [--salida-hora 16:00] [--salida-margen 30] ' +
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

  const entradaMargen = parseEntero('--entrada-margen / FICHADAS_ENTRADA_MARGEN', pick(values['entrada-margen'], env.FICHADAS_ENTRADA_MARGEN, '30'));
  if (entradaMargen < 0) throw new InvalidArgsError(`--entrada-margen / FICHADAS_ENTRADA_MARGEN invalido: "${entradaMargen}" (debe ser >= 0)`);

  const salidaMargen = parseEntero('--salida-margen / FICHADAS_SALIDA_MARGEN', pick(values['salida-margen'], env.FICHADAS_SALIDA_MARGEN, '30'));
  if (salidaMargen < 0) throw new InvalidArgsError(`--salida-margen / FICHADAS_SALIDA_MARGEN invalido: "${salidaMargen}" (debe ser >= 0)`);

  return {
    host,
    port,
    padron,
    rosterConfigPath: pick(values['roster-config'], env.FICHADAS_ROSTER_CONFIG, './config/active-employees.json'),
    logDir: pick(values['log-dir'], env.FICHADAS_LOG_DIR, './logs'),
    // spec 005: destino de la persistencia durable de fichadas; la MISMA ruta
    // que consume `calcular` (PRESENTISMO_FICHADAS_DIR).
    fichadasArchiveDir: pick(values['fichadas-archive-dir'], env.PRESENTISMO_FICHADAS_DIR, './data/presentismo/fichadas'),
    timeoutMs,
    tickIntervalMs,
    statusIntervalMs,
    fullHandshake: values['full-handshake'] || parseBooleano(env.FICHADAS_FULL_HANDSHAKE),
    checkpoints: {
      entrada: {
        horaEsperada: pick(values['entrada-hora'], env.FICHADAS_ENTRADA_HORA, '07:00'),
        margenMinutos: entradaMargen,
      },
      salida: {
        horaEsperada: pick(values['salida-hora'], env.FICHADAS_SALIDA_HORA, '16:00'),
        margenMinutos: salidaMargen,
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

export function createFichadasSink({ archiveDir, now = () => new Date() }) {
  return function persistirFichadas(fichadas) {
    const porPeriodo = new Map();
    for (const f of fichadas) {
      const periodo = periodoDeFichada(f, now);
      if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, []);
      porPeriodo.get(periodo).push(f);
    }
    for (const [periodo, grupo] of porPeriodo) {
      registrarFichadas({ archiveDir, periodo, fichadas: grupo, now });
    }
  };
}

function formatEstadoResumen(state) {
  const lineas = [`Fecha del servicio: ${state.fechaServicio}`];
  for (const cp of state.checkpoints) {
    lineas.push(`  Checkpoint "${cp.id}" (${cp.horaEsperada} +/-${cp.margenMinutos}min): ${cp.estado}`);
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
  // período (fuente de `calcular`). Inyectable para tests.
  const sink = persistirFichadas ?? createFichadasSink({ archiveDir: options.fichadasArchiveDir });

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

  const origenPadron = options.padron === 'oracle'
    ? 'RRHH/Oracle (variables RRHH_ORACLE_*)'
    : options.rosterConfigPath;
  print(`Servicio de consulta programada iniciado contra ${options.host}:${options.port}`);
  print(`Padron de empleados activos: ${origenPadron}`);
  print(`Sondeo cada ${options.tickIntervalMs}ms; timeout por consulta ${options.timeoutMs}ms`);
  print(`Log de ciclos: ${options.logDir}`);
  print(`Fichadas persistidas en: ${options.fichadasArchiveDir}`);
  print(formatEstadoResumen(handle.getState()));

  const statusTimer = setInterval(() => {
    print('---');
    print(formatEstadoResumen(handle.getState()));
  }, statusIntervalMs);
  statusTimer.unref?.();

  function shutdown(signal) {
    print(`\nRecibida ${signal}: deteniendo el servicio...`);
    clearInterval(statusTimer);
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
