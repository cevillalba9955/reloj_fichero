import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// 018-informe-cierre-periodo (T005) — persistencia de la copia emitida del
// informe de cierre. `guardarInformeCierre(periodo, tramo, entrada)` crea/
// reemplaza la entrada del tramo en `P<periodo>/informe-cierre.json`;
// `cargarInformeCierre(periodo)` devuelve el mapa por tramo o null.

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'presentismo-informe-'));
  return { dir, repo: createFilePresentismoRepository({ repoDir: dir }) };
}

const entrada = (horas) => ({
  sello: { periodoId: '202607', tramo: 'Mes', modo: 'automatico', emitidoEn: '2026-08-01T10:00:00.000Z', autor: 'ana' },
  resumen: { encabezado: { totalHoras: horas, empleados: 1 }, filas: [] },
  detalle: { encabezado: {}, secciones: [] },
  pendientes: { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] },
  obsoleto: false,
  invalidadoPor: null,
});

test('cargarInformeCierre: sin archivo → null', async () => {
  const { dir, repo } = tmpRepo();
  try {
    assert.equal(await repo.cargarInformeCierre('202607'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guardarInformeCierre: crea P<periodo>/informe-cierre.json con la entrada del tramo', async () => {
  const { dir, repo } = tmpRepo();
  try {
    await repo.guardarInformeCierre('202607', 'Mes', entrada(100));
    const ruta = join(dir, 'P202607', 'informe-cierre.json');
    assert.ok(existsSync(ruta));
    const guardado = JSON.parse(readFileSync(ruta, 'utf8'));
    assert.equal(guardado.Mes.resumen.encabezado.totalHoras, 100);
    const cargado = await repo.cargarInformeCierre('202607');
    assert.deepEqual(Object.keys(cargado), ['Mes']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guardarInformeCierre: segunda llamada al mismo tramo lo REEMPLAZA', async () => {
  const { dir, repo } = tmpRepo();
  try {
    await repo.guardarInformeCierre('202607', 'Mes', entrada(100));
    await repo.guardarInformeCierre('202607', 'Mes', entrada(250));
    const cargado = await repo.cargarInformeCierre('202607');
    assert.equal(cargado.Mes.resumen.encabezado.totalHoras, 250);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('guardarInformeCierre: escribir un tramo no toca los otros', async () => {
  const { dir, repo } = tmpRepo();
  try {
    await repo.guardarInformeCierre('202607', 'Q1', entrada(80));
    await repo.guardarInformeCierre('202607', 'Q2', entrada(90));
    await repo.guardarInformeCierre('202607', 'Q1', entrada(85));
    const cargado = await repo.cargarInformeCierre('202607');
    assert.equal(cargado.Q1.resumen.encabezado.totalHoras, 85);
    assert.equal(cargado.Q2.resumen.encabezado.totalHoras, 90);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
