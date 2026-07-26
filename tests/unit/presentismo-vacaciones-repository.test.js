import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileVacacionesRepository } from '../../src/presentismo/adapters/file-vacaciones-repository.js';
import { assertCumplePuerto } from '../../src/presentismo/ports/index.js';

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-vacaciones-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('cumple el puerto VacacionesRepository', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    assertCumplePuerto('VacacionesRepository', repo);
  });
});

test('legajo sin entrada previa: saldo implícito 0, sin movimientos (edge case "legajo nuevo")', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    const datos = await repo.cargarLegajo(1234);
    assert.deepEqual(datos, { saldo: 0, ultimoIncrementoAplicado: null, movimientos: [] });
  });
});

test('guardarLegajo + cargarLegajo hacen round-trip', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    const datos = {
      saldo: 21,
      ultimoIncrementoAplicado: '2025-11-01',
      movimientos: [{ tipo: 'incremento', fecha: '2025-11-01', dias: 21, saldoResultante: 21, antiguedadAnios: 6, asignacionId: null, autor: null }],
    };
    await repo.guardarLegajo(1234, datos);
    assert.deepEqual(await repo.cargarLegajo(1234), datos);
  });
});

test('guardarLegajo persiste en disco de forma atómica (temp + rename) en data/presentismo/vacaciones.json', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    await repo.guardarLegajo(1, { saldo: 5, ultimoIncrementoAplicado: null, movimientos: [] });
    const contenido = readFileSync(join(repoDir, 'vacaciones.json'), 'utf8');
    const parsed = JSON.parse(contenido);
    assert.equal(parsed.legajos['1'].saldo, 5);
  });
});

test('guardarAsignacion + cargarAsignacion + listarAsignaciones', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    const asignacion = {
      id: 'a1',
      legajo: 1234,
      fechaInicio: '2026-01-10',
      cantidadDias: 21,
      fechaFin: '2026-01-30',
      autor: 'rrhh.mgomez',
      fechaHora: '2026-01-05T14:00:00.000Z',
      vigente: true,
      reversion: null,
    };
    await repo.guardarAsignacion(asignacion);
    assert.deepEqual(await repo.cargarAsignacion('a1'), asignacion);
    assert.deepEqual(await repo.listarAsignaciones(1234), [asignacion]);
    assert.equal(await repo.cargarAsignacion('no-existe'), null);
  });
});

test('listarAsignaciones sin legajo devuelve todas; con legajo filtra', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    await repo.guardarAsignacion({ id: 'a1', legajo: 1, fechaInicio: '2026-01-10', cantidadDias: 5, fechaFin: '2026-01-14', autor: null, fechaHora: 'x', vigente: true, reversion: null });
    await repo.guardarAsignacion({ id: 'a2', legajo: 2, fechaInicio: '2026-02-01', cantidadDias: 3, fechaFin: '2026-02-03', autor: null, fechaHora: 'x', vigente: true, reversion: null });
    assert.equal((await repo.listarAsignaciones()).length, 2);
    assert.deepEqual((await repo.listarAsignaciones(2)).map((a) => a.id), ['a2']);
  });
});

test('revertirAsignacion marca vigente:false y registra la reversión; ya revertida → null', async () => {
  await withTempDir(async (repoDir) => {
    const repo = createFileVacacionesRepository({ repoDir });
    await repo.guardarAsignacion({ id: 'a1', legajo: 1, fechaInicio: '2026-01-10', cantidadDias: 5, fechaFin: '2026-01-14', autor: null, fechaHora: 'x', vigente: true, reversion: null });
    const revertida = await repo.revertirAsignacion('a1', { autor: 'rrhh.mgomez', fechaHora: '2026-02-01T00:00:00.000Z' });
    assert.equal(revertida.vigente, false);
    assert.deepEqual(revertida.reversion, { autor: 'rrhh.mgomez', fechaHora: '2026-02-01T00:00:00.000Z' });

    const otraVez = await repo.revertirAsignacion('a1', { autor: 'x', fechaHora: 'y' });
    assert.equal(otraVez, null, 'revertir una asignación ya no vigente devuelve null');
  });
});

test('un repo nuevo sobre el mismo repoDir ve los datos ya persistidos (no cachea en memoria entre instancias)', async () => {
  await withTempDir(async (repoDir) => {
    const repo1 = createFileVacacionesRepository({ repoDir });
    await repo1.guardarLegajo(1, { saldo: 7, ultimoIncrementoAplicado: null, movimientos: [] });
    const repo2 = createFileVacacionesRepository({ repoDir });
    assert.equal((await repo2.cargarLegajo(1)).saldo, 7);
  });
});
