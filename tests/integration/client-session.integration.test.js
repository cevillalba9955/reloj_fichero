import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectSocket, ConexionRechazadaError, runQuerySession } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import {
  buildHandshakeCommand,
  buildParamsCommand,
  buildIdentificationCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';
import { ACK_SIZE, PARAMS_RESPONSE_SIZE, IDENTIFICATION_RESPONSE_SIZE } from '../../src/protocol/framing.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

// Registro real de fichada3.pcapng stream 19 (1 registro pendiente), usado
// solo para completar el guion del mock server; el parseo de registros ya
// se prueba a fondo en tests/integration/query-pending-fichadas.
const REGISTRO_REAL = Buffer.from('0100002df9712279000000010000004074030000', 'hex');

// Servidor mock guionado generico: recibe una lista de pasos [{expect,
// respond}] y responde en orden, verificando que los bytes recibidos
// coincidan exactamente con lo esperado en cada paso.
function startScriptedServer(steps) {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let stepIndex = 0;
      let received = Buffer.alloc(0);
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

function pendingCountStep(seq, declaredPendingCount) {
  return {
    expect: buildPendingCountCommand(seq),
    respond: (() => {
      const buffer = ackFor(seq);
      buffer.writeUInt32LE(declaredPendingCount, 4);
      return buffer;
    })(),
  };
}

function pendingDetailStep(seq, declaredPendingCount) {
  return {
    expect: buildPendingDetailCommand(seq, declaredPendingCount),
    respond: Buffer.concat([
      ackFor(seq),
      Buffer.from([0x55, 0xaa]),
      Buffer.from('01000000', 'hex'),
      ...Array(declaredPendingCount).fill(REGISTRO_REAL),
    ]),
  };
}

// research.md §6.6 (2026-07-03, 13/13 corridas reales): la secuencia
// reducida (solo 0x80, sin ningun 0x13) es el comportamiento por defecto
// desde que se confirmo que el reloj no requiere los 0x13 para 0xB4/0xA4.
function startReducedSessionServer({ declaredPendingCount = 0 } = {}) {
  const steps = [
    { expect: buildHandshakeCommand(1), respond: ackFor(1) },
    pendingCountStep(2, declaredPendingCount),
  ];
  if (declaredPendingCount > 0) {
    steps.push(pendingDetailStep(3, declaredPendingCount));
  }
  const closeSeq = declaredPendingCount > 0 ? 4 : 3;
  steps.push({ expect: buildCloseOperationCommand(closeSeq), respond: ackFor(closeSeq) });
  return startScriptedServer(steps);
}

// Reproduce la secuencia completa confirmada en research.md §6.4
// (handshake -> 0x13 parametros -> 0x13 identificacion -> 0x13 parametros de
// nuevo -> 0xB4 -> [0xA4] -> 0x81 cierre), disponible via fullHandshake:true
// (FR-002) para equipos/firmwares donde la secuencia reducida no alcance.
function startFullSessionServer({ declaredPendingCount = 0 } = {}) {
  const steps = [
    { expect: buildHandshakeCommand(1), respond: ackFor(1) },
    { expect: buildParamsCommand(2), respond: Buffer.concat([ackFor(2), Buffer.alloc(PARAMS_RESPONSE_SIZE - ACK_SIZE)]) },
    { expect: buildIdentificationCommand(3), respond: Buffer.concat([ackFor(3), Buffer.alloc(IDENTIFICATION_RESPONSE_SIZE - ACK_SIZE)]) },
    { expect: buildParamsCommand(4), respond: Buffer.concat([ackFor(4), Buffer.alloc(PARAMS_RESPONSE_SIZE - ACK_SIZE)]) },
    pendingCountStep(5, declaredPendingCount),
  ];
  if (declaredPendingCount > 0) {
    steps.push(pendingDetailStep(6, declaredPendingCount));
  }
  const closeSeq = declaredPendingCount > 0 ? 7 : 6;
  steps.push({ expect: buildCloseOperationCommand(closeSeq), respond: ackFor(closeSeq) });
  return startScriptedServer(steps);
}

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-client-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function startMockServer(onConnection) {
  return new Promise((resolve) => {
    const server = createServer((socket) => onConnection?.(socket));
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('client: connectSocket se conecta a un servidor real que acepta la conexion', async () => {
  const server = await startMockServer();
  const { port } = server.address();
  const socket = await connectSocket('127.0.0.1', port, 2000);
  assert.ok(socket.readyState === 'open');
  socket.destroy();
  server.close();
});

test('client: connectSocket falla rapido (sin reintentos) cuando el puerto rechaza la conexion (FR-011)', async () => {
  const server = await startMockServer();
  const { port } = server.address();
  server.close();
  await new Promise((resolve) => server.once('close', resolve));

  const start = Date.now();
  await assert.rejects(() => connectSocket('127.0.0.1', port, 2000), ConexionRechazadaError);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `deberia fallar mucho antes del timeout de 2000ms (tardo ${elapsed}ms)`);
});

test('client: runQuerySession completa el flujo reducido por defecto (handshake, sin 0x13, 0xB4 sin pendientes, cierre) y cierra el socket (FR-002/FR-008)', async () => {
  await withTempLogDir(async (logDir) => {
    let serverSawClose = false;
    const server = await startReducedSessionServer({ declaredPendingCount: 0 });
    server.on('connection', (socket) => socket.on('close', () => { serverSawClose = true; }));
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'test-session', logDir });

    const { session, rawRecords } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'test-session',
      logger,
    });

    assert.equal(session.status, 'success');
    assert.equal(session.declaredPendingCount, 0);
    assert.deepEqual(rawRecords, []);

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(serverSawClose, true, 'el socket debe cerrarse del lado del cliente al terminar la sesion');

    const logLines = readFileSync(logger.logFilePath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const events = logLines.map((l) => l.event);
    assert.ok(events.includes('session_closed'));
    assert.ok(!events.includes('error'));

    server.close();
  });
});

test('client: runQuerySession completa el flujo reducido con fichadas pendientes (0xB4 + 0xA4, sin 0x13)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startReducedSessionServer({ declaredPendingCount: 1 });
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'test-session-detail', logDir });

    const { session, rawRecords } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'test-session-detail',
      logger,
    });

    assert.equal(session.status, 'success');
    assert.equal(session.declaredPendingCount, 1);
    assert.equal(rawRecords.length, 1);

    server.close();
  });
});

test('client: runQuerySession con fullHandshake:true reproduce la secuencia completa (0x13 x3) para compatibilidad con otros equipos (FR-002)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startFullSessionServer({ declaredPendingCount: 1 });
    const { port } = server.address();
    const logger = createSessionLogger({ sessionId: 'test-session-full', logDir });

    const { session, rawRecords } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'test-session-full',
      logger,
      fullHandshake: true,
    });

    assert.equal(session.status, 'success');
    assert.equal(session.declaredPendingCount, 1);
    assert.equal(rawRecords.length, 1);

    server.close();
  });
});

test('client: runQuerySession reporta error de conexion claro y distinguible si el host es inalcanzable (FR-009)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startMockServer();
    const { port } = server.address();
    server.close();
    await new Promise((resolve) => server.once('close', resolve));

    const logger = createSessionLogger({ sessionId: 'test-session-2', logDir });
    const { session } = await runQuerySession({
      host: '127.0.0.1',
      port,
      timeoutMs: 2000,
      sessionId: 'test-session-2',
      logger,
    });

    assert.equal(session.status, 'error');
    assert.ok(session.errorReason);
    assert.doesNotMatch(session.errorReason, /handshake/);
  });
});
