import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs, runAndReport, InvalidArgsError } from '../../src/cli/consultar-fichadas.js';
import { parseFichadaRecord } from '../../src/protocol/records.js';
import { hexToBuffer } from '../helpers/hex.js';

function withTempDirs(fn) {
  const outputDir = mkdtempSync(join(tmpdir(), 'rs596-cli-out-'));
  const logDir = mkdtempSync(join(tmpdir(), 'rs596-cli-log-'));
  try {
    return fn({ outputDir, logDir });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
    rmSync(logDir, { recursive: true, force: true });
  }
}

test('parseCliArgs: exige --host', () => {
  assert.throws(() => parseCliArgs([]), InvalidArgsError);
});

test('parseCliArgs: aplica defaults de contracts/cli-contract.md', () => {
  const options = parseCliArgs(['--host', '192.168.1.50']);
  assert.equal(options.host, '192.168.1.50');
  assert.equal(options.port, 5005);
  assert.equal(options.outputDir, './output');
  assert.equal(options.logDir, './logs');
  assert.equal(options.timeoutMs, 5000);
  assert.equal(options.fullHandshake, false);
});

test('parseCliArgs: --full-handshake activa la secuencia completa de 0x13 (FR-002)', () => {
  const options = parseCliArgs(['--host', '192.168.1.50', '--full-handshake']);
  assert.equal(options.fullHandshake, true);
});

test('parseCliArgs: rechaza --port no numerico', () => {
  assert.throws(() => parseCliArgs(['--host', '1.2.3.4', '--port', 'abc']), InvalidArgsError);
});

test('runAndReport: caso 0 fichadas pendientes -> exit 0, exporta records: [] y lo informa en consola', async () => {
  await withTempDirs(async ({ outputDir, logDir }) => {
    const options = { host: '127.0.0.1', port: 5005, outputDir, logDir, timeoutMs: 2000 };
    const fakeSession = {
      sessionId: 'fake-1',
      deviceHost: '127.0.0.1',
      devicePort: 5005,
      startedAt: '2026-07-02T10:00:00.000Z',
      endedAt: '2026-07-02T10:00:01.000Z',
      declaredPendingCount: 0,
      status: 'success',
      errorReason: null,
    };
    const printed = [];
    const exitCode = await runAndReport(options, {
      runSession: async () => ({ session: fakeSession, rawRecords: [] }),
      print: (line) => printed.push(line),
      printError: () => {},
    });

    assert.equal(exitCode, 0);
    assert.ok(printed.some((l) => l.includes('Fichadas pendientes declaradas (0xB4): 0')));
    assert.ok(printed.some((l) => l.includes('Fichadas exportadas: 0')));
  });
});

test('runAndReport: caso N fichadas pendientes -> exporta el JSON y avisa de fecha sin resolver', async () => {
  await withTempDirs(async ({ outputDir, logDir }) => {
    const options = { host: '127.0.0.1', port: 5005, outputDir, logDir, timeoutMs: 2000 };
    const fakeSession = {
      sessionId: 'fake-2',
      deviceHost: '127.0.0.1',
      devicePort: 5005,
      startedAt: '2026-07-02T10:05:00.000Z',
      endedAt: '2026-07-02T10:05:02.000Z',
      declaredPendingCount: 1,
      status: 'success',
      errorReason: null,
    };
    const rawRecord = hexToBuffer('01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 99 02 00 00');
    const printed = [];
    const exitCode = await runAndReport(options, {
      runSession: async () => ({ session: fakeSession, rawRecords: [rawRecord] }),
      print: (line) => printed.push(line),
      printError: () => {},
    });

    assert.equal(exitCode, 0);
    assert.ok(printed.some((l) => l.includes('Fichadas exportadas: 1')));
    assert.ok(printed.some((l) => l.includes('sin fecha resuelta')));
    const jsonLine = printed.find((l) => l.startsWith('JSON exportado:'));
    assert.ok(jsonLine);
    const outputFilePath = jsonLine.replace('JSON exportado: ', '');
    const document = JSON.parse(readFileSync(outputFilePath, 'utf8'));
    assert.equal(document.records.length, 1);
    assert.deepEqual(parseFichadaRecord(rawRecord).rawHex, document.records[0].rawHex);
  });
});

test('runAndReport: host inalcanzable -> exit 1, no intenta exportar', async () => {
  await withTempDirs(async ({ outputDir, logDir }) => {
    const options = { host: '10.255.255.1', port: 5005, outputDir, logDir, timeoutMs: 2000 };
    const fakeSession = {
      sessionId: 'fake-3',
      deviceHost: '10.255.255.1',
      devicePort: 5005,
      startedAt: '2026-07-02T10:10:00.000Z',
      endedAt: '2026-07-02T10:10:01.000Z',
      declaredPendingCount: 0,
      status: 'error',
      errorReason: 'No se pudo conectar a 10.255.255.1:5005: connect ECONNREFUSED',
      errorStage: 'connecting',
    };
    const errors = [];
    const exitCode = await runAndReport(options, {
      runSession: async () => ({ session: fakeSession, rawRecords: [] }),
      print: () => {},
      printError: (line) => errors.push(line),
    });

    assert.equal(exitCode, 1);
    assert.ok(errors.some((l) => l.includes('ECONNREFUSED')));
  });
});

test('runAndReport: error en etapa handshake -> exit 2 (distinto de error de conexion)', async () => {
  await withTempDirs(async ({ outputDir, logDir }) => {
    const options = { host: '127.0.0.1', port: 5005, outputDir, logDir, timeoutMs: 2000 };
    const fakeSession = {
      sessionId: 'fake-4',
      deviceHost: '127.0.0.1',
      devicePort: 5005,
      startedAt: '2026-07-02T10:15:00.000Z',
      endedAt: '2026-07-02T10:15:01.000Z',
      declaredPendingCount: 0,
      status: 'error',
      errorReason: 'Timeout esperando la respuesta al handshake (0x80)',
      errorStage: 'handshake',
    };
    const exitCode = await runAndReport(options, {
      runSession: async () => ({ session: fakeSession, rawRecords: [] }),
      print: () => {},
      printError: () => {},
    });
    assert.equal(exitCode, 2);
  });
});
