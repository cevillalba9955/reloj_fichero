import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToBuffer } from '../helpers/hex.js';
import {
  MARKER_COMMAND,
  MARKER_RESPONSE,
  ACK_SIZE,
  parseAckHeader,
  hasPayloadMarker,
  isKeepalive,
  encodeSequence,
} from '../../src/protocol/framing.js';

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('framing: MARKER_COMMAND y MARKER_RESPONSE coinciden con el research doc', () => {
  assert.deepEqual(MARKER_COMMAND, hexToBuffer('55 AA'));
  assert.deepEqual(MARKER_RESPONSE, hexToBuffer('AA 55'));
});

test('framing: parseAckHeader decodifica el ACK simple real (0xB4, un registro pendiente)', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const ack = hexToBuffer(fixture.respuestaB4);
  assert.equal(ack.length, ACK_SIZE);
  const header = parseAckHeader(ack);
  assert.equal(header.flagBytes.readUInt32LE(0), 1, 'flag = 1 registro pendiente (declaredPendingCount)');
  assert.equal(header.seq, 5);
});

test('framing: parseAckHeader decodifica el ACK simple real (0xB4, dos registros pendientes)', () => {
  const fixture = loadFixture('dos-registros-pendientes.json');
  const ack = hexToBuffer(fixture.respuestaB4);
  const header = parseAckHeader(ack);
  assert.equal(header.flagBytes.readUInt32LE(0), 2, 'flag = 2 registros pendientes');
  assert.equal(header.seq, 5);
});

test('framing: parseAckHeader decodifica el ACK con payload de 0xA4 (encabezado de los primeros 10 bytes)', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const full = hexToBuffer(fixture.respuestaA4Completa);
  const ackPart = full.subarray(0, ACK_SIZE);
  const header = parseAckHeader(ackPart);
  assert.equal(header.seq, 6);
  assert.ok(hasPayloadMarker(full, ACK_SIZE), 'despues del ACK debe venir el marcador 55 AA de payload');
});

test('framing: rechaza un ACK que no mide exactamente ACK_SIZE bytes', () => {
  assert.throws(() => parseAckHeader(hexToBuffer('AA 55 01 01 00 00')), /bytes exactos/i);
});

test('framing: isKeepalive detecta el paquete de 6 bytes en 00 y no confunde otros tamaños', () => {
  assert.equal(isKeepalive(hexToBuffer('00 00 00 00 00 00')), true);
  assert.equal(isKeepalive(hexToBuffer('00 00 00 00 00 01')), false);
  assert.equal(isKeepalive(hexToBuffer('00 00 00 00 00 00 00')), false);
});

test('framing: encodeSequence produce little-endian de 2 bytes', () => {
  assert.deepEqual(encodeSequence(5), hexToBuffer('05 00'));
  assert.deepEqual(encodeSequence(6), hexToBuffer('06 00'));
  assert.deepEqual(encodeSequence(256), hexToBuffer('00 01'));
});
