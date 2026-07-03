import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runQuerySession } from '../protocol/client.js';
import { parseFichadaRecord } from '../protocol/records.js';
import { exportSessionToJson } from '../output/json-exporter.js';
import { createSessionLogger } from '../logging/session-logger.js';

export class InvalidArgsError extends Error {}

// contracts/cli-contract.md: --host obligatorio, resto con default.
export function parseCliArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        host: { type: 'string' },
        port: { type: 'string', default: '5005' },
        'output-dir': { type: 'string', default: './output' },
        'log-dir': { type: 'string', default: './logs' },
        'timeout-ms': { type: 'string', default: '5000' },
        'full-handshake': { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    throw new InvalidArgsError(err.message);
  }

  if (!values.host) {
    throw new InvalidArgsError('Falta --host (IP del reloj RS596). Uso: --host <ip> [--port 5005] [--output-dir ./output] [--log-dir ./logs] [--timeout-ms 5000]');
  }

  const port = Number(values.port);
  const timeoutMs = Number(values['timeout-ms']);
  if (!Number.isInteger(port) || port <= 0) {
    throw new InvalidArgsError(`--port invalido: "${values.port}"`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new InvalidArgsError(`--timeout-ms invalido: "${values['timeout-ms']}"`);
  }

  return {
    host: values.host,
    port,
    outputDir: values['output-dir'],
    logDir: values['log-dir'],
    timeoutMs,
    fullHandshake: values['full-handshake'],
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
  const conCamposNoConfirmados = records.filter((r) => r.verificationMethodLabel.unconfirmed || r.anomaly);
  if (conCamposNoConfirmados.length > 0) {
    print(
      `Advertencia: ${conCamposNoConfirmados.length} fichada(s) exportada(s) con campos no confirmados por el protocolo ` +
      '(ver "unresolvedFields" y "verificationMethodLabel.unconfirmed" en el JSON exportado).'
    );
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
