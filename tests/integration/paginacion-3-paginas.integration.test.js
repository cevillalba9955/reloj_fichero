import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectSocket, BufferedSocketReader, queryPendingFichadas } from '../../src/protocol/client.js';
import { createSessionLogger } from '../../src/logging/session-logger.js';
import { parseFichadaRecord } from '../../src/protocol/records.js';
import { loadStream10 } from '../helpers/stream10-fixture.js';
import { startDeviceReplay } from '../helpers/scripted-device.js';

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-pag3-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Regresion de la feature 006: descarga real de 123 fichadas (3 paginas) del
// software oficial, reproducida byte a byte desde research/fichada.pcapng.
// Antes del fix, los 21 registros de la 3ra pagina salian corruptos.
test('queryPendingFichadas: lote de 123 (3 paginas) decodifica 122 fichadas unicas y validas', async () => {
  await withTempLogDir(async (logDir) => {
    const fx = loadStream10();
    const responses = [fx.b4Ack, ...fx.a4Responses];
    const { server, received, port } = await startDeviceReplay(responses);

    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-pag3', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 1 });

    // Conteo declarado por el equipo (0xB4) y unicos tras encuadre + dedup.
    assert.equal(result.declaredPendingCount, 123, 'declaredPendingCount');
    assert.equal(result.rawRecords.length, 122, 'fichadas unicas tras dedup');

    const parsed = result.rawRecords.map(parseFichadaRecord);

    // Ningun registro corrupto: todos con invariante estructural y campos legibles.
    for (const [i, r] of parsed.entries()) {
      assert.equal(r.recordTypeConstant, '00000001', `rec ${i} recordType`);
      assert.notEqual(r.fecha, null, `rec ${i} fecha`);
      assert.notEqual(r.hora, null, `rec ${i} hora`);
      assert.notEqual(r.metodo, null, `rec ${i} metodo`);
      assert.ok(Number.isInteger(r.legajo), `rec ${i} legajo`);
    }

    // Dedup efectiva: no hay dos fichadas con la misma tupla (legajo,fecha,hora,metodo).
    const keys = parsed.map((r) => `${r.legajo}|${r.fecha}|${r.hora}|${r.metodo}`);
    assert.equal(new Set(keys).size, 122, 'sin duplicados por tupla');

    // Spot-check: primer registro conocido (pagina 1) y un registro del borde
    // de la pagina 3 (que antes salia desplazado).
    assert.deepEqual(
      { legajo: parsed[0].legajo, fecha: parsed[0].fecha, hora: parsed[0].hora, metodo: parsed[0].metodo },
      { legajo: 10, fecha: '2026-07-06', hora: '15:59:51', metodo: 'rostro' },
      'primer registro',
    );
    const borde = parsed.find((r) => r.legajo === 35 && r.fecha === '2026-07-13' && r.hora === '16:00:32');
    assert.ok(borde, 'registro de borde de pagina 3 (leg 35, 2026-07-13 16:00:32) presente y bien encuadrado');
    assert.equal(borde.metodo, 'huella');

    // Los 3 comandos 0xA4 que envio el driver deben pedir el byteLen del software oficial.
    const a4Sent = received.filter((c) => c[3] === 0xa4);
    assert.equal(a4Sent.length, 3, 'tres comandos 0xA4 enviados');
    assert.deepEqual(
      a4Sent.map((c) => c.readUInt16LE(12)),
      fx.a4Fields.map((f) => f.byteLen),
      'byteLen por pagina == oficial (1024,1024,412)',
    );

    socket.destroy();
    server.close();
  });
});
