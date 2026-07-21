import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFichadasSink } from '../../src/cli/consulta-programada.js';
import { cargarFichadasArchivadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { generarCalendario, cerrarCalendario } from '../../src/presentismo/domain/calendario-mes.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'sink-'));
}

const P = (rawHex, fecha, extra = {}) => ({ legajo: 9, fecha, hora: '07:05:30', metodo: 'rostro', rawHex, ...extra });

test('createFichadasSink agrupa por período y persiste; el consumidor lee sin rawHex (round-trip)', async () => {
  const repoDir = tmpDir();
  const sink = createFichadasSink({ repoDir });
  await sink([
    P('AA11', '2026-07-01'),
    P('BB22', '2026-07-15'),
    P('CC33', '2026-08-02', { legajo: 10 }),
  ]);

  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202607' }).length, 2, 'julio: 2 fichadas');
  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202608' }).length, 1, 'agosto: 1 fichada');

  // El consumidor (archive-fichadas-provider) lee lo que el servicio escribió,
  // en forma de dominio y SIN rawHex (Principio V).
  const provider = createArchiveFichadasProvider({ repoDir });
  const f9 = await provider.obtenerFichadasDelMes(9, '202607');
  assert.equal(f9.length, 2);
  assert.ok(f9.every((f) => f.rawHex === undefined), 'el dominio nunca recibe rawHex');
});

test('createFichadasSink deduplica entre corridas por rawHex', async () => {
  const repoDir = tmpDir();
  const sink = createFichadasSink({ repoDir });
  await sink([P('AA11', '2026-07-01')]);
  await sink([P('AA11', '2026-07-01'), P('DD44', '2026-07-01')]); // AA11 repetida
  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202607' }).length, 2);
});

test('createFichadasSink imputa fichadas sin fecha al período de la fecha de recolección', async () => {
  const repoDir = tmpDir();
  const sink = createFichadasSink({ repoDir, now: () => new Date(2026, 8, 10, 8, 0, 0) }); // septiembre
  await sink([P('EE55', null)]);
  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202609' }).length, 1);
});

// 013-reestructurar-data-periodos (FR-006, US3): fichadas nuevas que llegan
// para un período ya cerrado se rechazan (se omiten, sin lanzar) en vez de
// colarse en un período que ya se consideró liquidado.
test('createFichadasSink omite el período si está cerrado, sin perder las fichadas de los períodos abiertos', async () => {
  const repoDir = tmpDir();
  const repo = createFilePresentismoRepository({ repoDir });
  const cal = generarCalendario('202607', new Set([1, 2, 3, 4, 5]));
  await repo.guardarCalendario(cal);
  const cerrado = await repo.cargarCalendario('202607');
  await repo.guardarCalendario(cerrarCalendario(cerrado, 'test'));

  const eventos = [];
  const logger = { evento: (tipo, datos) => eventos.push({ tipo, datos }) };
  const sink = createFichadasSink({ repoDir, logger });

  await sink([P('AA11', '2026-07-01'), P('BB22', '2026-08-01')]);

  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202607' }).length, 0, 'julio (cerrado) no recibió nada');
  assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202608' }).length, 1, 'agosto (abierto) sí se persistió');
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].tipo, 'fichadas_rechazadas_periodo_cerrado');
  assert.equal(eventos[0].datos.periodo, '202607');
});
