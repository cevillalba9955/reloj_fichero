import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionLogger } from '../../src/logging/session-logger.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-log-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('session-logger: escribe una linea NDJSON valida por evento', () => {
  withTempDir((logDir) => {
    const fixedNow = () => new Date('2026-07-02T10:00:00.000Z');
    const logger = createSessionLogger({ sessionId: 'abc123', logDir, now: fixedNow });
    logger.log('command_sent', { commandCode: '0xB4', byteLength: 16 });
    logger.log('response_received', { commandCode: '0xB4', byteLength: 10, detail: 'ack simple' });

    const lines = readFileSync(logger.logFilePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.equal(first.event, 'command_sent');
    assert.equal(first.sessionId, 'abc123');
    assert.equal(first.commandCode, '0xB4');
    assert.equal(first.timestamp, '2026-07-02T10:00:00.000Z');
  });
});

test('session-logger: rechaza eventos fuera del enum documentado en data-model.md', () => {
  withTempDir((logDir) => {
    const logger = createSessionLogger({ sessionId: 'abc123', logDir });
    assert.throws(() => logger.log('evento_inventado'), /evento invalido/);
  });
});

test('session-logger: rechaza detail que parezca bytes crudos de protocolo (Principio V)', () => {
  withTempDir((logDir) => {
    const logger = createSessionLogger({ sessionId: 'abc123', logDir });
    const rawHexLike = '01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 99 02 00 00';
    assert.throws(() => logger.log('response_received', { detail: rawHexLike }), /bytes crudos/);
  });
});
