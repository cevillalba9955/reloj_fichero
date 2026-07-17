import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runQuerySession } from '../protocol/client.js';
import { parseFichadaRecord } from '../protocol/records.js';
import { exportSessionToJson } from '../output/json-exporter.js';
import { createSessionLogger } from '../logging/session-logger.js';

export class InvalidArgsError extends Error {}

// Precedencia de configuración: argumento CLI explícito > variable de entorno
// FICHADAS_* > default. Mismo helper que src/cli/consulta-programada.js, para
// que el `.env` (cargado con `npm start`, que usa --env-file-if-exists) le
// sirva a este CLI igual que al servicio programado.
function pick(cliValue, envValue, def) {
  if (cliValue !== undefined) return cliValue;
  if (envValue !== undefined && envValue !== '') return envValue;
  return def;
}

function parseBooleano(envValue) {
  return envValue === 'true' || envValue === '1';
}

// contracts/cli-contract.md: --host obligatorio (o FICHADAS_HOST), resto con
// default o su variable FICHADAS_* equivalente.
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
        'output-dir': { type: 'string' },
        'log-dir': { type: 'string' },
        'timeout-ms': { type: 'string' },
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
      'Uso: --host <ip> [--port 5005] [--output-dir ./output] [--log-dir ./logs] [--timeout-ms 5000]. ' +
      'Cualquiera de estos tambien se puede fijar por FICHADAS_* en el .env.'
    );
  }

  const portRaw = pick(values.port, env.FICHADAS_PORT, '5005');
  const timeoutMsRaw = pick(values['timeout-ms'], env.FICHADAS_TIMEOUT_MS, '5000');
  const port = Number(portRaw);
  const timeoutMs = Number(timeoutMsRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new InvalidArgsError(`--port / FICHADAS_PORT invalido: "${portRaw}"`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidArgsError(`--timeout-ms / FICHADAS_TIMEOUT_MS invalido: "${timeoutMsRaw}"`);
  }

  return {
    host,
    port,
    outputDir: pick(values['output-dir'], env.FICHADAS_OUTPUT_DIR, './output'),
    logDir: pick(values['log-dir'], env.FICHADAS_LOG_DIR, './logs'),
    timeoutMs,
    fullHandshake: values['full-handshake'] || parseBooleano(env.FICHADAS_FULL_HANDSHAKE),
  };
}

function makeSessionId(host, now = new Date()) {
  return `${host}-${now.toISOString().replace(/[:.]/g, '-')}`;
}

// contracts/cli-contract.md: codigos de salida 0/1/2. Recibe runSession y
// exportFn inyectables para poder probar el resumen de consola y el export
// sin depender de que el handshake real ya este implementado (ver
// research.md §2-bis).
export async function runAndReport(
  options,
  { runSession = runQuerySession, exportFn = exportSessionToJson, print = console.log, printError = console.error } = {}
) {
  const sessionId = makeSessionId(options.host);
  const logger = createSessionLogger({ sessionId, logDir: options.logDir });

  const { session, rawRecords } = await runSession({
    host: options.host,
    port: options.port,
    timeoutMs: options.timeoutMs,
    sessionId,
    logger,
    fullHandshake: options.fullHandshake,
  });

  if (session.status === 'error') {
    printError(`Error de sesion RS596 (etapa: ${session.errorStage}): ${session.errorReason}`);
    printError(`Log de la sesion: ${logger.logFilePath}`);
    return session.errorStage === 'connecting' ? 1 : 2;
  }

  const records = rawRecords.map(parseFichadaRecord);
  const outputFilePath = exportFn({ session, records, outputDir: options.outputDir });

  print(`Host consultado: ${session.deviceHost}:${session.devicePort}`);
  print(`Fichadas pendientes declaradas (0xB4): ${session.declaredPendingCount}`);
  print(`Fichadas exportadas: ${records.length}`);
  // FR-005/FR-015: fecha/hora/legajo/metodo son valores directos (null si
  // no se pudo resolver, o si se sabe que no es confiable para ese caso
  // puntual); avisar por campo en vez de un mensaje generico "no
  // confirmado" (research.md §5.11).
  if (records.length > 0) {
    const sinFecha = records.filter((r) => r.fecha === null).length;
    if (sinFecha > 0) {
      print(`Advertencia: ${sinFecha} fichada(s) sin fecha resuelta (bytes fuera del formato esperado, ver research.md §5.16).`);
    }
    const sinHora = records.filter((r) => r.hora === null).length;
    if (sinHora > 0) {
      print(`Advertencia: ${sinHora} fichada(s) sin hora resuelta (bytes fuera del formato esperado, ver research.md §5.16).`);
    }
    const sinLegajo = records.filter((r) => r.legajo === null).length;
    if (sinLegajo > 0) {
      print(`Advertencia: ${sinLegajo} fichada(s) sin legajo resuelto (metodo tarjeta o codigo de metodo desconocido, ver research.md §5.9).`);
    }
    const sinMetodo = records.filter((r) => r.metodo === null).length;
    if (sinMetodo > 0) {
      print(`Advertencia: ${sinMetodo} fichada(s) con metodo de verificacion no reconocido (ver "verificationMethodCode" en el JSON exportado).`);
    }
    const conAnomalia = records.filter((r) => r.anomaly).length;
    if (conAnomalia > 0) {
      print(`Advertencia: ${conAnomalia} fichada(s) con recordTypeConstant distinto del valor esperado (ver log de sesion).`);
    }
  }
  print(`JSON exportado: ${outputFilePath}`);
  print(`Log de la sesion: ${logger.logFilePath}`);
  return 0;
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 3;
    return;
  }
  process.exitCode = await runAndReport(options);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
