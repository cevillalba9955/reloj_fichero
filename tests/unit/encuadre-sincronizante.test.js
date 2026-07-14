import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameRecords, parseFichadaRecord, RECORD_SIZE } from '../../src/protocol/records.js';

// Registros reales validos (20 bytes) tomados de research/fichada.pcapng.
const R = {
  a: Buffer.from('0A00000001000033F971E6ED0000000100000040', 'hex'), // leg 10
  b: Buffer.from('4A00000001000014F97106020000000100000040', 'hex'), // leg 74
  c: Buffer.from('4700000001000020F97106020000000100000010', 'hex'), // leg 71
  d: Buffer.from('230000000100002DF97106060000000100000040', 'hex'), // leg 35
  e: Buffer.from('3900000001000034F97106060000000100000040', 'hex'), // leg 57
};
const CLOSING = Buffer.from('BA910000', 'hex'); // bloque de cierre tipico (no es un registro)
const CARRIED = Buffer.from('01000000', 'hex'); // 4 bytes de arrastre sueltos

// --- FR-006: encuadre por invariante estructural ---

test('frameRecords: encuadra registros validos e ignora bytes de frontera intercalados', () => {
  const stream = Buffer.concat([R.a, R.b, CLOSING, R.c, CARRIED, R.d]);
  const framed = frameRecords(stream);
  assert.equal(framed.length, 4);
  assert.deepEqual(framed[0], R.a);
  assert.deepEqual(framed[1], R.b);
  assert.deepEqual(framed[2], R.c);
  assert.deepEqual(framed[3], R.d);
});

test('frameRecords: se re-sincroniza tras un tramo que no encuadra', () => {
  // Basura de 7 bytes en el medio: el encuadrador debe saltarla y seguir.
  const junk = Buffer.from('DEADBEEF001122', 'hex');
  const stream = Buffer.concat([R.a, junk, R.e]);
  const framed = frameRecords(stream);
  assert.deepEqual(framed, [R.a, R.e]);
});

test('frameRecords: buffer vacio o sin registros validos devuelve lista vacia', () => {
  assert.deepEqual(frameRecords(Buffer.alloc(0)), []);
  assert.deepEqual(frameRecords(Buffer.from('00'.repeat(40), 'hex')), []);
});

// --- Modelo de paginacion (research.md §D3): el stream continuo es la
// concatenacion de los payloads sin su bloque de cierre. frameRecords sobre ese
// stream contiguo devuelve TODAS las fichadas, sin perder ni duplicar. ---

test('frameRecords: stream contiguo de N registros (payloads sin cierre concatenados) -> N registros exactos', () => {
  const stream = Buffer.concat([R.a, R.b, R.c, R.d, R.e]);
  const framed = frameRecords(stream);
  assert.equal(framed.length, 5, 'no se pierde ni duplica ninguno');
  assert.deepEqual(
    framed.map((r) => parseFichadaRecord(r).legajo),
    [10, 74, 71, 35, 57],
  );
  // Sin duplicados byte-identicos.
  assert.equal(new Set(framed.map((r) => r.toString('hex'))).size, 5);
});

// --- FR-010: fallo explicito cuando corresponde (verificado a nivel driver) ---

test('parseFichadaRecord sigue exigiendo 20 bytes exactos (contrato preservado)', () => {
  assert.throws(() => parseFichadaRecord(Buffer.alloc(RECORD_SIZE - 1)), RangeError);
});
