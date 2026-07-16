import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runQuerySession } from '../../src/protocol/client.js';
import { parseFichadaRecord } from '../../src/protocol/records.js';
import { exportSessionToJson } from '../../src/output/json-exporter.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildPendingDetailContinuationCommand,
  buildCloseOperationCommand,
  MAX_PAGE_BYTES,
} from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';
import { RECORD_SIZE } from '../../src/protocol/records.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

// Registro real de fichada3.pcapng stream 19 (ver client-session.integration.test.js).
const REGISTRO_REAL = Buffer.from('0100002df9712279000000010000004074030000', 'hex');

function withTempOutputDir(fn) {
  const outputDir = mkdtempSync(join(tmpdir(), 'rs596-perf-out-'));
  const logDir = mkdtempSync(join(tmpdir(), 'rs596-perf-log-'));
  try {
    return fn({ outputDir, logDir });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
    rmSync(logDir, { recursive: true, force: true });
  }
}

// Reproduce la paginacion real de 0xA4 (research.md §5.19): el stream
// continuo de registros mide declaredPendingCount*20 y se entrega en paginas
// de a lo sumo MAX_PAGE_BYTES, sin alinear las fronteras a registros; cada
// respuesta trae ademas 4 bytes de cierre que no son parte del stream. Este
// guion arma esa misma secuencia dinamicamente para que el mock siga
// sincronizado con src/protocol/client.js sin importar cuantas fichadas se
// simulen.
function startReducedSessionServer(declaredPendingCount) {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let stepIndex = 0;
      let received = Buffer.alloc(0);
      const steps = [
        { expect: buildHandshakeCommand(1), respond: ackFor(1) },
        {
          expect: buildPendingCountCommand(2),
          respond: (() => {
            const buffer = ackFor(2);
            buffer.writeUInt32LE(declaredPendingCount, 4);
            return buffer;
          })(),
        },
      ];

      // Stream continuo re-encuadrado (research.md §5.9/§5.19): arranca con
      // el legajo del primer registro (el viejo "header") y mide exactamente
      // declaredPendingCount*20. REGISTRO_REAL viene en el encuadre viejo
      // (termina con el legajo del registro siguiente), asi que anteponer un
      // legajo y truncar al total da un stream valido de N fichadas.
      const streamCompleto = Buffer.concat([
        Buffer.from('01000000', 'hex'),
        ...Array(declaredPendingCount).fill(REGISTRO_REAL),
      ]).subarray(0, declaredPendingCount * RECORD_SIZE);
      const BLOQUE_CIERRE = Buffer.from('ba910000', 'hex');

      let seq = 3;
      let deliveredBytes = 0;
      let pageIndex = 0;
      while (deliveredBytes < streamCompleto.length) {
        const isFirstPage = pageIndex === 0;
        // research.md §5.19: byteLen = min(bytesRestantes, MAX_PAGE_BYTES),
        // sin alinear a registros; la respuesta trae byteLen + 4 bytes de
        // cierre (que no son parte del stream). Ver src/protocol/client.js.
        const byteLen = Math.min(streamCompleto.length - deliveredBytes, MAX_PAGE_BYTES);
        const detailCmd = isFirstPage
          ? buildPendingDetailCommand(seq, declaredPendingCount, byteLen)
          : buildPendingDetailContinuationCommand(seq, pageIndex, byteLen);
        const respondParts = [
          ackFor(seq),
          Buffer.from([0x55, 0xaa]),
          streamCompleto.subarray(deliveredBytes, deliveredBytes + byteLen),
          BLOQUE_CIERRE,
        ];
        steps.push({ expect: detailCmd, respond: Buffer.concat(respondParts) });

        deliveredBytes += byteLen;
        pageIndex += 1;
        seq += 1;
      }
      steps.push({ expect: buildCloseOperationCommand(seq), respond: ackFor(seq) });

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

// SC-001: "Un operador obtiene la lista de fichadas pendientes del reloj en
// menos de 10 segundos ... para lotes de hasta 100 fichadas pendientes".
// Este test mide el flujo completo (sesion TCP + parseo + export a JSON)
// contra un mock local con 100 registros, como smoke test de regresion de
// performance -- no reemplaza una medicion contra hardware real, donde la
// latencia de red domina el tiempo total.
test('flujo completo (sesion + parseo + export) con 100 fichadas pendientes termina en menos de 10s (SC-001)', async () => {
  await withTempOutputDir(async ({ outputDir, logDir }) => {
    const declaredPendingCount = 100;
    const server = await startReducedSessionServer(declaredPendingCount);
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'perf-test', logDir });

    const start = Date.now();
    const { session, rawRecords } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 5000,
      sessionId: 'perf-test',
      logger,
    });

    assert.equal(session.status, 'success');
    assert.equal(rawRecords.length, declaredPendingCount);

    const records = rawRecords.map(parseFichadaRecord);
    exportSessionToJson({ session, records, outputDir });

    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 10000, `el flujo completo con 100 fichadas tardo ${elapsedMs}ms, se esperaba menos de 10000ms (SC-001)`);

    server.close();
  });
});
