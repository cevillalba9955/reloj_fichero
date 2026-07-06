import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runQuerySession } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import * as commands from '../../src/protocol/commands.js';
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

// Registro real de fichada3.pcapng stream 19 (ver client-session.integration.test.js).
const REGISTRO_REAL = Buffer.from('0100002df9712279000000010000004074030000', 'hex');

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-no-delete-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('commands.js no expone ningun builder relacionado a 0xA8/borrado (FR-007)', () => {
  const exportNames = Object.keys(commands);
  const sospechosos = exportNames.filter((name) => /delete|borra|0xa8/i.test(name));
  assert.deepEqual(sospechosos, [], `no debe existir ningun export de borrado en commands.js: ${sospechosos.join(', ')}`);
});

test('runQuerySession: el flujo de consulta simple nunca envia el codigo de comando 0xA8 al reloj (FR-007, US3)', async () => {
  await withTempLogDir(async (logDir) => {
    const declaredPendingCount = 2;
    const bytesRecibidosPorElMock = [];

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
        {
          expect: buildPendingDetailCommand(3, declaredPendingCount),
          respond: Buffer.concat([
            ackFor(3),
            Buffer.from([0x55, 0xaa]),
            Buffer.from('01000000', 'hex'),
            ...Array(declaredPendingCount).fill(REGISTRO_REAL),
          ]),
        },
        { expect: buildCloseOperationCommand(4), respond: ackFor(4) },
      ];
      socket.on('data', (chunk) => {
        bytesRecibidosPorElMock.push(chunk);
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

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'no-delete-test', logDir });

    const { session } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'no-delete-test',
      logger,
    });

    assert.equal(session.status, 'success');

    // Todo comando real tiene el formato "55 AA 01 <CMD>" (research.md §2);
    // se recorre el stream completo recibido por el mock buscando ese
    // marcador y verificando que el byte de comando nunca sea 0xA8.
    const streamCompleto = Buffer.concat(bytesRecibidosPorElMock);
    let comandosVistos = 0;
    for (let offset = 0; offset + 4 <= streamCompleto.length; offset += 1) {
      if (streamCompleto[offset] === 0x55 && streamCompleto[offset + 1] === 0xaa && streamCompleto[offset + 2] === 0x01) {
        comandosVistos += 1;
        assert.notEqual(
          streamCompleto[offset + 3],
          0xa8,
          'el cliente no debe enviar jamas el comando 0xA8 (borrado) durante la consulta simple (FR-007)'
        );
      }
    }
    // Sanity check: nos aseguramos de haber inspeccionado comandos reales
    // (handshake, 0xB4, 0xA4, 0x81), no un stream vacio por error del mock.
    assert.ok(comandosVistos >= 4, `se esperaban al menos 4 comandos con marcador 55 AA 01, se vieron ${comandosVistos}`);

    server.close();
  });
});
