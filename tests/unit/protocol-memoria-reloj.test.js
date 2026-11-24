import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { runCountSession, runClearSession } from '../../src/protocol/client.js';
import { buildClearCommand, buildOpenOperationCommand } from '../../src/protocol/commands.js';

// issue #39 — Sesiones de conteo y borrado contra un "reloj" TCP falso que
// responde con ACKs de 10 bytes (ver framing.js).

const noop = { log() {} };

test('builders: bytes de 0xA8 y 0x81 apertura según research.md §6.5', () => {
  assert.equal(buildClearCommand(6).toString('hex'), '55aa01a8000000000000ffff00000600');
  assert.equal(buildOpenOperationCommand(5).toString('hex'), '55aa0181000000000000ffff00000500');
});

async function relojFalso(pendientes) {
  const comandos = [];
  const server = createServer((socket) => {
    socket.on('data', (buf) => {
      comandos.push(buf[3]);
      // ACK de 10 bytes: AA 55 <id> 01 <flags LE32> <seq LE16> (framing.js)
      const ack = Buffer.alloc(10);
      ack[0] = 0xaa; ack[1] = 0x55; ack[2] = 0x01; ack[3] = 0x01;
      if (buf[3] === 0xb4) ack.writeUInt32LE(pendientes, 4);
      ack.writeUInt16LE(buf.readUInt16LE(14), 8);
      socket.write(ack);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, comandos, port: server.address().port };
}

test('runClearSession envía 0x80, 0x81, 0xA8, 0x81 en ese orden', async () => {
  const { server, comandos, port } = await relojFalso(0);
  try {
    const r = await runClearSession({ host: '127.0.0.1', port, timeoutMs: 1000, logger: noop });
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(comandos, [0x80, 0x81, 0xa8, 0x81]);
  } finally {
    server.close();
  }
});

test('runClearSession sin reloj → { ok: false, motivo } sin lanzar', async () => {
  const r = await runClearSession({ host: '127.0.0.1', port: 1, timeoutMs: 300, logger: noop });
  assert.equal(r.ok, false);
  assert.ok(r.motivo);
});

test('runCountSession devuelve la cantidad y NO envía 0xA8 ni 0xA4', async () => {
  const { server, comandos, port } = await relojFalso(9);
  try {
    const r = await runCountSession({ host: '127.0.0.1', port, timeoutMs: 1000, logger: noop });
    assert.equal(r.ok, true, r.motivo);
    assert.equal(r.pendientes, 9);
    assert.deepEqual(comandos, [0x80, 0xb4, 0x81]);
  } finally {
    server.close();
  }
});
