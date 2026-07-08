import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { startService } from '../service/consulta-programada-service.js';
import { createLocalFileActiveEmployeesProvider } from '../roster/local-file-active-employees-provider.js';
import { readOracleRosterConfig, ConfiguracionPadronInvalidaError } from '../db/oracle-roster-config.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { createOracleActiveEmployeesProvider } from '../roster/oracle-active-employees-provider.js';
import { createDailyCachedActiveEmployeesProvider } from '../roster/daily-cached-active-employees-provider.js';
import { createRosterFetchLogger } from '../logging/roster-fetch-logger.js';

export class InvalidArgsError extends Error {}

const PADRON_MODES = new Set(['archivo', 'oracle']);

// contracts/service-contract.md + contracts/roster-provider-contract.md:
// --host obligatorio, resto con los defaults de FR-002 (checkpoints
// entrada/salida 07:00/16:00 ± 30min) y del adapter placeholder del padrón
// de empleados activos.
export function parseCliArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        host: { type: 'string' },
        port: { type: 'string', default: '5005' },
        padron: { type: 'string', default: 'archivo' },
        'roster-config': { type: 'string', default: './config/active-employees.json' },
        'log-dir': { type: 'string', default: './logs' },
        'timeout-ms': { type: 'string', default: '5000' },
        'entrada-hora': { type: 'string', default: '07:00' },
        'entrada-margen': { type: 'string', default: '30' },
        'salida-hora': { type: 'string', default: '16:00' },
        'salida-margen': { type: 'string', default: '30' },
        'full-handshake': { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    throw new InvalidArgsError(err.message);
  }

  if (!values.host) {
    throw new InvalidArgsError(
      'Falta --host (IP del reloj RS596). Uso: --host <ip> [--port 5005] ' +
      '[--padron archivo|oracle] [--roster-config ./config/active-employees.json] ' +
      '[--log-dir ./logs] [--timeout-ms 5000] ' +
      '[--entrada-hora 07:00] [--entrada-margen 30] [--salida-hora 16:00] [--salida-margen 30]'
    );
  }

  const port = Number(values.port);
  const timeoutMs = Number(values['timeout-ms']);
  const entradaMargen = Number(values['entrada-margen']);
  const salidaMargen = Number(values['salida-margen']);
  if (!Number.isInteger(port) || port <= 0) {
    throw new InvalidArgsError(`--port invalido: "${values.port}"`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidArgsError(`--timeout-ms invalido: "${values['timeout-ms']}"`);
  }
  if (!Number.isInteger(entradaMargen) || entradaMargen < 0) {
    throw new InvalidArgsError(`--entrada-margen invalido: "${values['entrada-margen']}"`);
  }
  if (!Number.isInteger(salidaMargen) || salidaMargen < 0) {
    throw new InvalidArgsError(`--salida-margen invalido: "${values['salida-margen']}"`);
  }
  if (!PADRON_MODES.has(values.padron)) {
    throw new InvalidArgsError(
      `--padron invalido: "${values.padron}". Valores validos: archivo | oracle (FR-013).`
    );
  }

  return {
    host: values.host,
    port,
    padron: values.padron,
    rosterConfigPath: values['roster-config'],
    logDir: values['log-dir'],
    timeoutMs,
    fullHandshake: values['full-handshake'],
    checkpoints: {
      entrada: { horaEsperada: values['entrada-hora'], margenMinutos: entradaMargen },
      salida: { horaEsperada: values['salida-hora'], margenMinutos: salidaMargen },
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
  { print = console.log, statusIntervalMs = 60 * 1000, onShutdown } = {}
) {
  // Fail-fast: si `--padron oracle` tiene configuración inválida, esto lanza
  // ConfiguracionPadronInvalidaError ANTES de programar ningún ciclo (FR-005).
  const rosterProvider = createRosterProvider(options);

  const handle = startService({
    host: options.host,
    port: options.port,
    logDir: options.logDir,
    timeoutMs: options.timeoutMs,
    fullHandshake: options.fullHandshake,
    checkpoints: options.checkpoints,
    rosterProvider,
  });

  const origenPadron = options.padron === 'oracle'
    ? 'RRHH/Oracle (variables RRHH_ORACLE_*)'
    : options.rosterConfigPath;
  print(`Servicio de consulta programada iniciado contra ${options.host}:${options.port}`);
  print(`Padron de empleados activos: ${origenPadron}`);
  print(`Log de ciclos: ${options.logDir}`);
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
