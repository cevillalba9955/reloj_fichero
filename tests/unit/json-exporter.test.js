import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportSessionToJson } from '../../src/output/json-exporter.js';
import { parseFichadaRecord } from '../../src/protocol/records.js';
import { hexToBuffer } from '../helpers/hex.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-export-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('json-exporter: escribe un archivo JSON valido con la forma de contracts/output-schema.json', () => {
  withTempDir((outputDir) => {
    const session = {
      sessionId: 's-1',
      deviceHost: '192.168.1.50',
      devicePort: 5005,
      startedAt: '2026-07-02T10:00:00.000Z',
      endedAt: '2026-07-02T10:00:05.000Z',
      declaredPendingCount: 1,
      status: 'success',
      errorReason: null,
    };
    // Registro real de research.md §6.1 con el encuadre corregido (§5.9):
    // legajo 1 (Cesar Villalba) + campo0..campo3 de la captura.
    const record = parseFichadaRecord(
      hexToBuffer('01 00 00 00 01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10')
    );

    const outputFilePath = exportSessionToJson({ session, records: [record], outputDir });
    const document = JSON.parse(readFileSync(outputFilePath, 'utf8'));

    assert.equal(document.sessionId, 's-1');
    assert.equal(document.receivedRecordCount, 1);
    assert.equal(document.records.length, 1);
    assert.match(document.records[0].rawHex, /^[0-9A-F]{40}$/);
    assert.equal(document.records[0].fecha, '2026-07-02');
    assert.equal(document.records[0].legajo, 1);
    assert.ok(outputFilePath.includes('192.168.1.50'));
  });
});

test('json-exporter: 0 fichadas pendientes exporta records: []', () => {
  withTempDir((outputDir) => {
    const session = {
      sessionId: 's-2',
      deviceHost: '192.168.1.50',
      devicePort: 5005,
      startedAt: '2026-07-02T11:00:00.000Z',
      endedAt: '2026-07-02T11:00:01.000Z',
      declaredPendingCount: 0,
      status: 'success',
      errorReason: null,
    };
    const outputFilePath = exportSessionToJson({ session, records: [], outputDir });
    const document = JSON.parse(readFileSync(outputFilePath, 'utf8'));
    assert.deepEqual(document.records, []);
    assert.equal(document.receivedRecordCount, 0);
  });
});
