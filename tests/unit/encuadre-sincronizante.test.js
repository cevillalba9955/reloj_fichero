import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameRecords, dedupeFichadas, parseFichadaRecord, RECORD_SIZE } from '../../src/protocol/records.js';

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

// --- FR-007: deduplicacion por (legajo, fecha, hora, metodo) ---

test('dedupeFichadas: colapsa el registro reenviado y preserva el orden de primera aparicion', () => {
  const withDup = [R.a, R.b, R.b, R.c]; // R.b reenviado (duplicado de frontera)
  const { records, removed } = dedupeFichadas(withDup);
  assert.equal(removed, 1);
  assert.deepEqual(records, [R.a, R.b, R.c]);
});

test('dedupeFichadas: sin duplicados no remueve nada', () => {
  const { records, removed } = dedupeFichadas([R.a, R.b, R.c, R.d]);
  assert.equal(removed, 0);
  assert.equal(records.length, 4);
});

// --- SC-005 / US3: robustez ante un flujo sintetico de 4+ paginas con solapes ---

test('frameRecords + dedupeFichadas: flujo sintetico de 4 paginas con solapes -> unicos exactos', () => {
  // Simula 4 paginas: cada continuacion reenvia el ultimo registro de la previa
  // (duplicado) y hay bloques de cierre/arrastre entre medio.
  const page1 = Buffer.concat([R.a, R.b, CARRIED, CLOSING]);
  const page2 = Buffer.concat([R.b, R.c, CARRIED, CLOSING]); // reenvia R.b
  const page3 = Buffer.concat([R.c, R.d, CARRIED, CLOSING]); // reenvia R.c
  const page4 = Buffer.concat([R.d, R.e, CLOSING]); // reenvia R.d
  const all = Buffer.concat([page1, page2, page3, page4]);

  const framed = frameRecords(all);
  const { records, removed } = dedupeFichadas(framed);

  assert.equal(removed, 3, 'tres registros reenviados colapsados');
  assert.deepEqual(records.map((r) => parseFichadaRecord(r).legajo), [10, 74, 71, 35, 57]);
});

// --- FR-010: fallo explicito cuando corresponde (verificado a nivel driver) ---

test('parseFichadaRecord sigue exigiendo 20 bytes exactos (contrato preservado)', () => {
  assert.throws(() => parseFichadaRecord(Buffer.alloc(RECORD_SIZE - 1)), RangeError);
});
