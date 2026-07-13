import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFichadasSink } from '../../src/cli/consulta-programada.js';
import { cargarFichadasArchivadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'sink-'));
}

const P = (rawHex, fecha, extra = {}) => ({ legajo: 9, fecha, hora: '07:05:30', metodo: 'rostro', rawHex, ...extra });

test('createFichadasSink agrupa por período y persiste; el consumidor lee sin rawHex (round-trip)', async () => {
  const archiveDir = tmpDir();
  const sink = createFichadasSink({ archiveDir });
  sink([
    P('AA11', '2026-07-01'),
    P('BB22', '2026-07-15'),
    P('CC33', '2026-08-02', { legajo: 10 }),
  ]);

  assert.equal(cargarFichadasArchivadas({ archiveDir, periodo: '202607' }).length, 2, 'julio: 2 fichadas');
  assert.equal(cargarFichadasArchivadas({ archiveDir, periodo: '202608' }).length, 1, 'agosto: 1 fichada');

  // El consumidor (archive-fichadas-provider) lee lo que el servicio escribió,
  // en forma de dominio y SIN rawHex (Principio V).
  const provider = createArchiveFichadasProvider({ archiveDir });
  const f9 = await provider.obtenerFichadasDelMes(9, '202607');
  assert.equal(f9.length, 2);
  assert.ok(f9.every((f) => f.rawHex === undefined), 'el dominio nunca recibe rawHex');
});

test('createFichadasSink deduplica entre corridas por rawHex', () => {
  const archiveDir = tmpDir();
  const sink = createFichadasSink({ archiveDir });
  sink([P('AA11', '2026-07-01')]);
  sink([P('AA11', '2026-07-01'), P('DD44', '2026-07-01')]); // AA11 repetida
  assert.equal(cargarFichadasArchivadas({ archiveDir, periodo: '202607' }).length, 2);
});

test('createFichadasSink imputa fichadas sin fecha al período de la fecha de recolección', () => {
  const archiveDir = tmpDir();
  const sink = createFichadasSink({ archiveDir, now: () => new Date(2026, 8, 10, 8, 0, 0) }); // septiembre
  sink([P('EE55', null)]);
  assert.equal(cargarFichadasArchivadas({ archiveDir, periodo: '202609' }).length, 1);
});
