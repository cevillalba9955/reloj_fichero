import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAndReport } from '../../src/cli/consultar-fichadas.js';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

// Dos registros reales distintos (dos-registros-pendientes.json via
// client-session.integration.test.js usa uno solo repetido; acá se arman a
// mano para no depender de un fixture JSON compuesto).
const REGISTRO_1 = Buffer.from('0100002df9712279000000010000004074030000', 'hex');
const REGISTRO_2 = Buffer.from('0200002df9712279000000010000004074020000', 'hex');

function withTempDirs(fn) {
  const outputDir = mkdtempSync(join(tmpdir(), 'rs596-nodedup-out-'));
  const logDir = mkdtempSync(join(tmpdir(), 'rs596-nodedup-log-'));
  try {
    return fn({ outputDir, logDir });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
    rmSync(logDir, { recursive: true, force: true });
  }
}

// Servidor mock que, por cada conexion TCP nueva, repite exactamente la
// misma respuesta (mismo conteo declarado y mismos registros): simula un
// reloj cuyas fichadas siguen "pendientes" porque nunca se borraron entre
// ejecuciones (FR-007), y por lo tanto el mismo lote se vuelve a reportar
// completo en cada consulta.
function startRepeatableServer(declaredPendingCount) {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let seqBase = 1;
      let stepIndex = 0;
      let received = Buffer.alloc(0);
      const steps = [
        { expect: buildHandshakeCommand(seqBase), respond: ackFor(seqBase) },
        {
          expect: buildPendingCountCommand(seqBase + 1),
          respond: (() => {
            const buffer = ackFor(seqBase + 1);
            buffer.writeUInt32LE(declaredPendingCount, 4);
            return buffer;
          })(),
        },
        {
          expect: buildPendingDetailCommand(seqBase + 2, declaredPendingCount),
          respond: Buffer.concat([
            ackFor(seqBase + 2),
            Buffer.from([0x55, 0xaa]),
            Buffer.from('01000000', 'hex'),
            REGISTRO_1,
            REGISTRO_2,
          ]),
        },
        { expect: buildCloseOperationCommand(seqBase + 3), respond: ackFor(seqBase + 3) },
      ];
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        const step = steps[stepIndex];
        if (!step) return;
        if (received.length >= step.expect.length) {
          const actual = received.subarray(0, step.expect.length);
          received = received.subarray(step.expect.length);
          assert.deepEqual(actual, step.expect, `paso ${stepIndex}: bytes recibidos no coinciden con el guion`);
          socket.write(step.respond);
          stepIndex += 1;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// FR-013: "El script DEBE exportar todas las fichadas pendientes reportadas
// por el reloj en cada ejecución, sin intentar deduplicar contra
// ejecuciones anteriores". Se ejecuta el flujo completo dos veces seguidas
// contra el mismo estado de pendientes (nada se borro entre medio) y se
// verifica que ambas exportaciones contienen los mismos registros completos
// -- ninguna corrida "recuerda" a la anterior para filtrar nada.
test('runAndReport ejecutado dos veces contra el mismo estado de pendientes exporta los mismos registros completos ambas veces, sin deduplicar (FR-013)', async () => {
  await withTempDirs(async ({ outputDir, logDir }) => {
    const declaredPendingCount = 2;

    const server1 = await startRepeatableServer(declaredPendingCount);
    const options1 = { host: '127.0.0.1', port: server1.address().port, outputDir, logDir, timeoutMs: 2000 };
    const exitCode1 = await runAndReport(options1);
    server1.close();

    const server2 = await startRepeatableServer(declaredPendingCount);
    const options2 = { host: '127.0.0.1', port: server2.address().port, outputDir, logDir, timeoutMs: 2000 };
    const exitCode2 = await runAndReport(options2);
    server2.close();

    assert.equal(exitCode1, 0);
    assert.equal(exitCode2, 0);

    const archivosGenerados = readdirSync(outputDir).filter((name) => name.endsWith('.json')).sort();
    assert.equal(archivosGenerados.length, 2, 'cada ejecucion debe generar su propio archivo JSON, ninguno debe pisar al otro');

    const [documento1, documento2] = archivosGenerados.map((name) =>
      JSON.parse(readFileSync(join(outputDir, name), 'utf8'))
    );

    assert.equal(documento1.declaredPendingCount, declaredPendingCount);
    assert.equal(documento2.declaredPendingCount, declaredPendingCount);
    assert.equal(documento1.records.length, declaredPendingCount);
    assert.equal(documento2.records.length, declaredPendingCount);

    // Mismos registros (mismo rawHex) en ambas corridas: nada se filtro por
    // "ya visto antes".
    const rawHex1 = documento1.records.map((r) => r.rawHex).sort();
    const rawHex2 = documento2.records.map((r) => r.rawHex).sort();
    assert.deepEqual(rawHex1, rawHex2, 'ambas corridas deben exportar los mismos registros, sin deduplicar (FR-013)');
  });
});
