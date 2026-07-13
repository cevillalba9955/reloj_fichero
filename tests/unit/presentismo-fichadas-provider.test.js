import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStoreFichadasProvider } from '../../src/presentismo/adapters/memory-store-fichadas-provider.js';

// Store fake con la forma de la feature 002 (fecha 'YYYY-MM-DD', hora 'HH:MM:SS').
function fakeStore(porLegajo) {
  return {
    getFichadasPorLegajo(legajo) {
      return porLegajo[legajo] ?? [];
    },
  };
}

test('convierte hora HH:MM:SS a minutos y filtra por mes', async () => {
  const store = fakeStore({
    1234: [
      { legajo: 1234, fecha: '2026-07-01', hora: '07:05:30', rawHex: 'AA11' },
      { legajo: 1234, fecha: '2026-08-01', hora: '08:00:00', rawHex: 'BB22' }, // otro mes
    ],
  });
  const provider = createMemoryStoreFichadasProvider({ store });
  const fichadas = await provider.obtenerFichadasDelMes(1234, '202607');
  assert.equal(fichadas.length, 1);
  assert.equal(fichadas[0].hora, 425, '07:05 → 425, segundos truncados');
});

test('deduplica por rawHex pero NO expone rawHex (Principio V)', async () => {
  const store = fakeStore({
    1234: [
      { legajo: 1234, fecha: '2026-07-01', hora: '07:05:00', rawHex: 'AA11' },
      { legajo: 1234, fecha: '2026-07-01', hora: '07:05:00', rawHex: 'AA11' }, // repetida
    ],
  });
  const provider = createMemoryStoreFichadasProvider({ store });
  const fichadas = await provider.obtenerFichadasDelMes(1234, '202607');
  assert.equal(fichadas.length, 1, 'dedup por rawHex');
  assert.equal(fichadas[0].rawHex, undefined, 'no se expone rawHex');
  assert.ok(!JSON.stringify(fichadas).includes('AA11'), 'ningún rawHex en la salida');
});

test('fichada sin fecha → no imputable (hora null, fecha null)', async () => {
  const store = fakeStore({
    1234: [{ legajo: 1234, fecha: null, hora: null, rawHex: 'CC33' }],
  });
  const provider = createMemoryStoreFichadasProvider({ store });
  const fichadas = await provider.obtenerFichadasDelMes(1234, '202607');
  assert.equal(fichadas.length, 1);
  assert.equal(fichadas[0].fecha, null);
});
