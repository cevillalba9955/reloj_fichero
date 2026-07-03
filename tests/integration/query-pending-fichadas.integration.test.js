import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hexToBuffer } from '../helpers/hex.js';
import { connectSocket, BufferedSocketReader, queryPendingFichadas, RespuestaInesperadaError } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import { parseFichadaRecord } from '../../src/protocol/records.js';

function loadFixture(name) {
  const url = new URL(`../contract/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-query-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Servidor mock que responde byte a byte segun un guion fijo: espera un
// buffer exacto y contesta con otro. Reproduce lo que el reloj real hizo en
// las capturas de research/protocolo_prosoft_rs596.md §6.
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

test('queryPendingFichadas: 0 fichadas pendientes -> declaredPendingCount 0, sin pedir detalle', async () => {
  await withTempLogDir(async (logDir) => {
    const steps = [
      {
        expect: hexToBuffer('55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 01 00'),
        respond: hexToBuffer('AA 55 01 01 00 00 00 00 01 00'),
      },
    ];
    const server = await startScriptedServer(steps);
    const { port } = server.address();
    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-0', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 1 });

    assert.equal(result.declaredPendingCount, 0);
    assert.deepEqual(result.rawRecords, []);
    socket.destroy();
    server.close();
  });
});

test('queryPendingFichadas: un registro pendiente (captura real #6.1) se parsea correctamente', async () => {
  await withTempLogDir(async (logDir) => {
    const fixture = loadFixture('un-registro-pendiente.json');
    const steps = [
      { expect: hexToBuffer(fixture.comandoB4), respond: hexToBuffer(fixture.respuestaB4) },
      {
        expect: hexToBuffer(fixture.comandoA4),
        respond: hexToBuffer(fixture.respuestaA4Completa),
      },
    ];
    const server = await startScriptedServer(steps);
    const { port } = server.address();
    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-1', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 5 });

    assert.equal(result.declaredPendingCount, 1);
    assert.equal(result.rawRecords.length, 1);
    const record = parseFichadaRecord(result.rawRecords[0]);
    assert.equal(record.verificationMethodCode, '00000010');
    socket.destroy();
    server.close();
  });
});

test('queryPendingFichadas: dos registros pendientes (captura real #6.2) se parsean con distinto metodo de verificacion', async () => {
  await withTempLogDir(async (logDir) => {
    const dosRegistros = loadFixture('dos-registros-pendientes.json');

    const respuestaA4Completa = [
      dosRegistros.respuestaA4Ack,
      dosRegistros.respuestaA4PayloadMarker,
      dosRegistros.respuestaA4Header,
      ...dosRegistros.registros,
    ].join(' ');

    const steps = [
      { expect: hexToBuffer(dosRegistros.comandoB4), respond: hexToBuffer(dosRegistros.respuestaB4) },
      {
        expect: hexToBuffer(dosRegistros.comandoA4),
        respond: hexToBuffer(respuestaA4Completa),
      },
    ];
    const server = await startScriptedServer(steps);
    const { port } = server.address();
    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-2', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 5 });

    assert.equal(result.declaredPendingCount, 2);
    assert.equal(result.rawRecords.length, 2);
    const [r1, r2] = result.rawRecords.map(parseFichadaRecord);
    assert.equal(r1.verificationMethodCode, '00000010');
    assert.equal(r2.verificationMethodCode, '00000040');
    socket.destroy();
    server.close();
  });
});

test('queryPendingFichadas: re-encuadra el header de 4 bytes como legajo del primer registro, no lo descarta (research.md §5.9)', async () => {
  await withTempLogDir(async (logDir) => {
    const fixture = loadFixture('un-registro-pendiente.json');
    const steps = [
      { expect: hexToBuffer(fixture.comandoB4), respond: hexToBuffer(fixture.respuestaB4) },
      {
        expect: hexToBuffer(fixture.comandoA4),
        respond: hexToBuffer(fixture.respuestaA4Completa),
      },
    ];
    const server = await startScriptedServer(steps);
    const { port } = server.address();
    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-legajo', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 5 });

    assert.equal(result.rawRecords.length, 1);
    // El header real de esta captura es "01 00 00 00" (research.md §6.1) =
    // legajo 1 = Cesar Villalba, confirmado. Antes de la correccion de
    // encuadre este byte se descartaba sin loguear y se perdia.
    const record = parseFichadaRecord(result.rawRecords[0]);
    assert.deepEqual(record.legajoHipotesis, { value: 1, unconfirmed: true });
    socket.destroy();
    server.close();
  });
});

test('queryPendingFichadas: discrepancia entre 0xB4 declarado y bytes extra recibidos en 0xA4 (FR-014) se reporta como error', async () => {
  await withTempLogDir(async (logDir) => {
    const unRegistro = loadFixture('un-registro-pendiente.json');
    const dosRegistros = loadFixture('dos-registros-pendientes.json');

    // El reloj "declara" 1 pendiente por 0xB4 pero en la practica manda 2
    // registros en 0xA4 -> debe detectarse como discrepancia (FR-014).
    const respuestaA4ConDosRegistrosDeMas = [
      unRegistro.respuestaA4Ack,
      unRegistro.respuestaA4PayloadMarker,
      unRegistro.respuestaA4Header,
      ...dosRegistros.registros,
    ].join(' ');

    const steps = [
      { expect: hexToBuffer(unRegistro.comandoB4), respond: hexToBuffer(unRegistro.respuestaB4) },
      {
        expect: hexToBuffer(unRegistro.comandoA4),
        respond: hexToBuffer(respuestaA4ConDosRegistrosDeMas),
      },
    ];
    const server = await startScriptedServer(steps);
    const { port } = server.address();
    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-3', logDir });

    await assert.rejects(
      () => queryPendingFichadas(socket, reader, logger, { timeoutMs: 500, seq: 5 }),
      (err) => {
        assert.ok(err instanceof RespuestaInesperadaError);
        assert.match(err.message, /FR-014/);
        return true;
      }
    );
    socket.destroy();
    server.close();
  });
});
