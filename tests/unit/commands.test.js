import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToBuffer } from '../helpers/hex.js';
import {
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildHandshakeCommand,
  buildParamsCommand,
  buildIdentificationCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';

function loadFixture(name) {
  const url = new URL(`../contract/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('commands: buildPendingCountCommand(5) reproduce el 0xB4 real de 16 bytes', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const expected = hexToBuffer(fixture.comandoB4);
  assert.equal(expected.length, 16);
  assert.deepEqual(buildPendingCountCommand(5), expected);
});

test('commands: buildPendingCountCommand cambia solo los ultimos 2 bytes (seq) al variar el contador', () => {
  const base = buildPendingCountCommand(5);
  const next = buildPendingCountCommand(6);
  assert.equal(base.length, next.length);
  assert.deepEqual(base.subarray(0, 14), next.subarray(0, 14), 'todo excepto el seq debe permanecer igual');
  assert.deepEqual(next.subarray(14, 16), hexToBuffer('06 00'));
});

test('commands: buildPendingDetailCommand(6, 1) reproduce el 0xA4 real de 16 bytes (1 registro, fichada3.pcapng stream 19)', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const expected = hexToBuffer(fixture.comandoA4);
  assert.equal(expected.length, 16);
  assert.deepEqual(buildPendingDetailCommand(6, 1), expected);
});

test('commands: buildPendingDetailCommand(6, 2) reproduce el 0xA4 real de 16 bytes (2 registros, fichada2.pcapng stream 11)', () => {
  const fixture = loadFixture('dos-registros-pendientes.json');
  const expected = hexToBuffer(fixture.comandoA4);
  assert.equal(expected.length, 16);
  assert.deepEqual(buildPendingDetailCommand(6, 2), expected);
});

test('commands: buildHandshakeCommand(1) reproduce el 0x80 real de 16 bytes (fichada1.pcapng stream 176)', () => {
  const expected = hexToBuffer('55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 01 00');
  assert.deepEqual(buildHandshakeCommand(1), expected);
});

test('commands: buildParamsCommand(2) reproduce el 0x13 real de "parametros" (fichada1.pcapng stream 176)', () => {
  const expected = hexToBuffer('55 AA 01 13 00 00 00 00 00 00 00 00 30 00 02 00');
  assert.deepEqual(buildParamsCommand(2), expected);
});

test('commands: buildIdentificationCommand(3) reproduce el 0x13 real de "identificacion" (fichada2.pcapng stream 13)', () => {
  const expected = hexToBuffer('55 AA 01 13 01 00 00 00 00 00 00 00 00 04 03 00');
  assert.deepEqual(buildIdentificationCommand(3), expected);
});

test('commands: buildCloseOperationCommand(7) reproduce el 0x81 real de cierre (fichada2.pcapng stream 11)', () => {
  const expected = hexToBuffer('55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 07 00');
  assert.deepEqual(buildCloseOperationCommand(7), expected);
});
