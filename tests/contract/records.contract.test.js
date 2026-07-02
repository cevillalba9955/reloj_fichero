import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToBuffer } from '../helpers/hex.js';
import { parseFichadaRecord, RECORD_SIZE } from '../../src/protocol/records.js';

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('records: RECORD_SIZE es 20 bytes segun research.md', () => {
  assert.equal(RECORD_SIZE, 20);
});

test('records: parseFichadaRecord decodifica el registro real de "un registro pendiente"', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const raw = hexToBuffer(fixture.registros[0]);
  assert.equal(raw.length, 20);

  const record = parseFichadaRecord(raw);

  assert.equal(record.rawHex, raw.toString('hex').toUpperCase());
  assert.equal(record.recordTypeConstant, '00000001');
  assert.equal(record.verificationMethodCode, '00000010');
  assert.deepEqual(record.verificationMethodLabel, { value: 'huella', unconfirmed: true });
  assert.equal(record.unresolvedFields.field0, '01000016');
  assert.equal(record.unresolvedFields.field1, 'F9710205');
  assert.equal(record.unresolvedFields.field4, '99020000');
});

test('records: parseFichadaRecord decodifica los dos registros reales de "dos registros pendientes" con distinto metodo de verificacion', () => {
  const fixture = loadFixture('dos-registros-pendientes.json');
  const [raw1, raw2] = fixture.registros.map(hexToBuffer);

  const record1 = parseFichadaRecord(raw1);
  const record2 = parseFichadaRecord(raw2);

  assert.equal(record1.recordTypeConstant, '00000001');
  assert.equal(record2.recordTypeConstant, '00000001');
  assert.equal(record1.verificationMethodCode, '00000010');
  assert.equal(record2.verificationMethodCode, '00000040');
  assert.notEqual(record1.verificationMethodCode, record2.verificationMethodCode);
  assert.equal(record1.verificationMethodLabel.unconfirmed, true);
  assert.equal(record2.verificationMethodLabel.unconfirmed, true);
  assert.equal(record1.verificationMethodLabel.value, 'huella');
  assert.equal(record2.verificationMethodLabel.value, 'rostro');
});

test('records: parseFichadaRecord decodifica el registro real por tarjeta (verificationMethodCode 0x30, confirmado 2026-07-02)', () => {
  const fixture = loadFixture('tres-registros-pendientes-tarjeta.json');
  const raw = hexToBuffer(fixture.registros[2]);
  const record = parseFichadaRecord(raw);

  assert.equal(record.verificationMethodCode, '00000030');
  assert.deepEqual(record.verificationMethodLabel, { value: 'tarjeta', unconfirmed: true });
});

test('records: parseFichadaRecord decodifica timestampHypothesis (minuto/segundo confirmados, hora mod 8) contra research/control_fichada.csv', () => {
  const fixture = loadFixture('siete-registros-control-fichada.json');
  for (const { hex, csv, expectedTimestampHypothesis } of fixture.registros) {
    const record = parseFichadaRecord(hexToBuffer(hex));
    assert.deepEqual(
      record.timestampHypothesis,
      { value: expectedTimestampHypothesis, unconfirmed: true },
      `hora real ${csv.hora} (${csv.modo}, legajo ${csv.legajo}) deberia decodificar a ${expectedTimestampHypothesis}`
    );
  }
});

test('records: parseFichadaRecord devuelve timestampHypothesis.value null cuando los bits de flag no calzan con el formato esperado', () => {
  const raw = hexToBuffer('01 00 00 16 F9 71 FF FF 00 00 00 01 00 00 00 10 99 02 00 00');
  const record = parseFichadaRecord(raw);
  assert.deepEqual(record.timestampHypothesis, { value: null, unconfirmed: true });
});

test('records: parseFichadaRecord rechaza un buffer que no mide exactamente 20 bytes (FR-010)', () => {
  assert.throws(() => parseFichadaRecord(hexToBuffer('01 02 03')), /20 bytes/);
});

test('records: parseFichadaRecord marca una anomalia cuando recordTypeConstant no es el valor confirmado', () => {
  const raw = hexToBuffer('01 00 00 16 F9 71 02 05 00 00 00 02 00 00 00 10 99 02 00 00');
  const record = parseFichadaRecord(raw);
  assert.equal(record.recordTypeConstant, '00000002');
  assert.equal(record.anomaly, true);
});
