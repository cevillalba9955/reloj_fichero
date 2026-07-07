import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { startService } from '../service/consulta-programada-service.js';
import { createLocalFileActiveEmployeesProvider } from '../roster/local-file-active-employees-provider.js';

export class InvalidArgsError extends Error {}

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
      '[--roster-config ./config/active-employees.json] [--log-dir ./logs] [--timeout-ms 5000] ' +
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

  return {
    host: values.host,
    port,
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
  const rosterProvider = createLocalFileActiveEmployeesProvider({ filePath: options.rosterConfigPath });

  const handle = startService({
    host: options.host,
    port: options.port,
    logDir: options.logDir,
    timeoutMs: options.timeoutMs,
    fullHandshake: options.fullHandshake,
    checkpoints: options.checkpoints,
    rosterProvider,
  });

  print(`Servicio de consulta programada iniciado contra ${options.host}:${options.port}`);
  print(`Padron de empleados activos: ${options.rosterConfigPath}`);
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
  runService(options, { onShutdown: () => process.exit(0) });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
