import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runQuerySession } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import { buildHandshakeCommand } from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-edge-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Edge case de spec.md: "¿Qué pasa si la conexión TCP se cae o da timeout a
// mitad de la secuencia (por ejemplo, después del handshake pero antes de
// recibir el detalle)?" — reproducido acá contra la secuencia reducida por
// defecto (FR-002): el mock responde el handshake y despues cierra el
// socket sin responder a 0xB4.
test('runQuerySession: la conexion se cae despues del handshake y antes de la respuesta a 0xB4 -> sesion termina en error, sin colgarse (Edge Case, FR-009)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      let handshakeAcked = false;
      socket.on('data', (chunk) => {
        if (handshakeAcked) return;
        received = Buffer.concat([received, chunk]);
        const handshakeCmd = buildHandshakeCommand(1);
        if (received.length >= handshakeCmd.length) {
          handshakeAcked = true;
          socket.write(ackFor(1));
          // Simula la conexion cayendose a mitad de secuencia: nunca llega
          // una respuesta a 0xB4, el socket simplemente se cierra.
          socket.end();
        }
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'edge-drop-reduced', logDir });

    const { session } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'edge-drop-reduced',
      logger,
    });

    assert.equal(session.status, 'error');
    assert.ok(session.errorReason, 'debe reportar un motivo de error claro, no quedar indefinido');
    assert.ok(session.endedAt, 'la sesion debe quedar marcada como finalizada, no colgada');

    server.close();
  });
});

// Misma idea que el test anterior pero para el modo --full-handshake: la
// conexion se cae entre el ACK de 0x80 y la respuesta al primer 0x13
// (mencion explicita en tasks.md T031).
test('runQuerySession (fullHandshake): la conexion se cae entre el 0x80 y el primer 0x13 -> sesion termina en error, sin colgarse (Edge Case, FR-009)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      let handshakeAcked = false;
      socket.on('data', (chunk) => {
        if (handshakeAcked) return;
        received = Buffer.concat([received, chunk]);
        const handshakeCmd = buildHandshakeCommand(1);
        if (received.length >= handshakeCmd.length) {
          handshakeAcked = true;
          socket.write(ackFor(1));
          // El cliente va a mandar el primer 0x13 a continuacion; el mock
          // corta la conexion antes de contestarlo.
          socket.end();
        }
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'edge-drop-full', logDir });

    const { session } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'edge-drop-full',
      logger,
      fullHandshake: true,
    });

    assert.equal(session.status, 'error');
    assert.ok(session.errorReason, 'debe reportar un motivo de error claro, no quedar indefinido');
    assert.ok(session.endedAt, 'la sesion debe quedar marcada como finalizada, no colgada');

    server.close();
  });
});

// Edge case: la conexion se cae despues de declarar pendientes por 0xB4
// pero antes de completar la respuesta de detalle de 0xA4 (a mitad del
// payload de registros).
test('runQuerySession: la conexion se cae a mitad del payload de 0xA4 (menos bytes de los declarados por 0xB4) -> error, no discrepancia distinguible (FR-009, ver spec Edge Cases)', async () => {
  await withTempLogDir(async (logDir) => {
    const declaredPendingCount = 2;
    const server = createServer((socket) => {
      let stepIndex = 0;
      let received = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (stepIndex === 0) {
          const handshakeCmd = buildHandshakeCommand(1);
          if (received.length >= handshakeCmd.length) {
            received = received.subarray(handshakeCmd.length);
            socket.write(ackFor(1));
            stepIndex = 1;
          }
        } else if (stepIndex === 1) {
          // Cualquier envio en este punto es el 0xB4; respondemos declarando
          // 2 pendientes y despues cortamos antes de mandar el 0xA4 completo.
          if (received.length > 0) {
            const buffer = ackFor(2);
            buffer.writeUInt32LE(declaredPendingCount, 4);
            socket.write(buffer);
            stepIndex = 2;
            received = Buffer.alloc(0);
          }
        } else if (stepIndex === 2) {
          // El cliente ya mando el 0xA4; respondemos con el ACK y el
          // marcador de payload, pero cerramos antes de mandar los 40 bytes
          // de registros completos (solo mandamos 10, simulando un corte).
          if (received.length > 0) {
            socket.write(Buffer.concat([ackFor(3), Buffer.from([0x55, 0xaa]), Buffer.from('01000000', 'hex')]));
            socket.write(Buffer.alloc(10));
            socket.end();
            stepIndex = 3;
          }
        }
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'edge-drop-detail', logDir });

    const { session } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 500,
      sessionId: 'edge-drop-detail',
      logger,
    });

    assert.equal(session.status, 'error');
    assert.ok(session.errorReason);
    // FR-014/research.md §5: el deficit de bytes no tiene manejo especifico
    // propio, se manifiesta como error de lectura generico (timeout o
    // socket cerrado), no como un mensaje de "discrepancia" distinguible.
    assert.doesNotMatch(session.errorReason, /Discrepancia/);

    server.close();
  });
});
