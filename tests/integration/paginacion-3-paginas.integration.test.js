import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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

function loadOficial() {
  const url = new URL('../fixtures/fichada-3paginas/oficial-13-14.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')).records;
}

// Regresion de la feature 006: descarga real de 123 fichadas (3 paginas) del
// software oficial, reproducida byte a byte desde research/fichada.pcapng, y
// validada contra el listado oficial de fichadas de los dias 13-14 provisto por
// el usuario. Antes del fix del encuadre se perdia el 1er registro de la 3ra
// pagina (leg 53 @ 16:00) y se generaba un duplicado (leg 57 @ 16:00).
test('queryPendingFichadas: lote de 123 (3 paginas) decodifica las 123 fichadas declaradas, sin perder ni duplicar', async () => {
  await withTempLogDir(async (logDir) => {
    const fx = loadStream10();
    const responses = [fx.b4Ack, ...fx.a4Responses];
    const { server, received, port } = await startDeviceReplay(responses);

    const socket = await connectSocket('127.0.0.1', port, 2000);
    const reader = new BufferedSocketReader(socket);
    const logger = createSessionLogger({ sessionId: 's-pag3', logDir });

    const result = await queryPendingFichadas(socket, reader, logger, { timeoutMs: 2000, seq: 1 });

    // Se exportan TODAS las declaradas por 0xB4, sin deduplicar (FR-013).
    assert.equal(result.declaredPendingCount, 123, 'declaredPendingCount');
    assert.equal(result.rawRecords.length, 123, 'todas las fichadas declaradas');

    const parsed = result.rawRecords.map(parseFichadaRecord);

    // Ningun registro corrupto: invariante estructural + campos legibles.
    for (const [i, r] of parsed.entries()) {
      assert.equal(r.recordTypeConstant, '00000001', `rec ${i} recordType`);
      assert.notEqual(r.fecha, null, `rec ${i} fecha`);
      assert.notEqual(r.hora, null, `rec ${i} hora`);
      assert.notEqual(r.metodo, null, `rec ${i} metodo`);
      assert.ok(Number.isInteger(r.legajo), `rec ${i} legajo`);
    }

    // Sin duplicados byte-identicos (el bug de encuadre producia exactamente uno).
    const rawHexes = result.rawRecords.map((b) => b.toString('hex'));
    assert.equal(new Set(rawHexes).size, 123, 'no hay registros byte-identicos duplicados');

    // --- Verificacion contra el GROUND TRUTH oficial (dias 13-14) ---
    // Todas las fichadas del listado oficial deben estar presentes (a resolucion
    // de minuto). Esto es lo que atrapa la perdida del registro de frontera.
    const nuestrosMin = new Set(
      parsed
        .filter((r) => r.fecha === '2026-07-13' || r.fecha === '2026-07-14')
        .map((r) => `${r.legajo}|${r.fecha}|${r.hora.slice(0, 5)}`),
    );
    for (const [legajo, fecha, hhmm] of loadOficial()) {
      assert.ok(
        nuestrosMin.has(`${legajo}|${fecha}|${hhmm}`),
        `falta la fichada oficial: legajo ${legajo} ${fecha} ${hhmm}`,
      );
    }

    // Chequeo puntual del registro que el bug perdia: leg 53 @ 2026-07-13 16:00:18.
    const leg53 = parsed.find(
      (r) => r.legajo === 53 && r.fecha === '2026-07-13' && r.hora === '16:00:18',
    );
    assert.ok(leg53, 'leg 53 @ 2026-07-13 16:00:18 presente (registro de frontera de pagina)');

    // Los 3 comandos 0xA4 que envio el driver deben pedir el byteLen del oficial.
    const a4Sent = received.filter((c) => c[3] === 0xa4);
    assert.deepEqual(
      a4Sent.map((c) => c.readUInt16LE(12)),
      fx.a4Fields.map((f) => f.byteLen),
      'byteLen por pagina == oficial (1024,1024,412)',
    );

    socket.destroy();
    server.close();
  });
});
