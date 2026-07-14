import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectSocket, BufferedSocketReader, queryPendingFichadas } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import { loadStream10 } from '../helpers/stream10-fixture.js';
import { startDeviceReplay } from '../helpers/scripted-device.js';

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-a4contract-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Contrato de paginacion 0xA4 (feature 006): los comandos que arma el driver
// para un lote de 123 fichadas deben coincidir campo por campo con los del
// software oficial capturados en research/fichada.pcapng.
test('comandos 0xA4: count y byteLen por pagina identicos al software oficial', async () => {
  await withTempLogDir(async (logDir) => {
    const fx = loadStream10();
    const responses = [fx.b4Ack, ...fx.a4Responses];
    const { server, received, port } = await startDeviceReplay(responses);

    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-a4c', logDir });

    await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 1 });

    const a4Sent = received.filter((c) => c[3] === 0xa4);
    assert.equal(a4Sent.length, 3, 'tres comandos 0xA4');

    const sentFields = a4Sent.map((c) => ({ count: c.readUInt32LE(8), byteLen: c.readUInt16LE(12) }));

    // Valores del software oficial (de la captura): count 0x7B / 1<<16 / 2<<16; byteLen 1024/1024/412.
    assert.deepEqual(fx.a4Fields, [
      { count: 0x7b, byteLen: 1024 },
      { count: 1 << 16, byteLen: 1024 },
      { count: 2 << 16, byteLen: 412 },
    ], 'fixture: campos esperados del oficial');

    assert.deepEqual(sentFields, fx.a4Fields, 'driver vs oficial: count y byteLen por pagina');

    socket.destroy();
    server.close();
  });
});
