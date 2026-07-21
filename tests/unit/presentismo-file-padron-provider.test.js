import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFilePadronCategoryProvider,
  guardarSnapshotPadron,
} from '../../src/presentismo/adapters/file-padron-category-provider.js';
import { rutaCarpetaPeriodo } from '../../src/presentismo/domain/periodo-storage.js';

function tmpRepo() {
  return mkdtempSync(join(tmpdir(), 'padron-'));
}

function rutaPadron(repoDir, periodo) {
  return join(rutaCarpetaPeriodo(repoDir, periodo), 'padron.json');
}

test('guardarSnapshotPadron + provider por archivo hacen round-trip sin DB (resuelve el mes en curso)', async () => {
  const repoDir = tmpRepo();
  const now = () => new Date(2026, 6, 15); // julio 2026
  guardarSnapshotPadron({
    filePath: rutaPadron(repoDir, '202607'),
    vista: 'RRHH.V_PADRON',
    empleados: [
      { legajo: 5678, codigoCategoria: 'PROD', nombre: 'Grace Hopper' },
      { legajo: 1234, codigoCategoria: 'ADMIN', nombre: 'Ada Lovelace' },
    ],
  });

  const provider = createFilePadronCategoryProvider({ repoDir, now });
  assert.deepEqual(await provider.obtenerCategoria(1234), { legajo: 1234, codigoCategoria: 'ADMIN' });
  assert.deepEqual(await provider.listar(), [
    { legajo: 1234, codigoCategoria: 'ADMIN', nombre: 'Ada Lovelace' },
    { legajo: 5678, codigoCategoria: 'PROD', nombre: 'Grace Hopper' },
  ]);
  // Legajo ausente → null.
  assert.deepEqual(await provider.obtenerCategoria(9999), { legajo: 9999, codigoCategoria: null });
});

test('snapshot sin nombre (columna no configurada) → nombre null en el round-trip', async () => {
  const repoDir = tmpRepo();
  const now = () => new Date(2026, 6, 1);
  guardarSnapshotPadron({ filePath: rutaPadron(repoDir, '202607'), empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }] });
  const provider = createFilePadronCategoryProvider({ repoDir, now });
  assert.deepEqual(await provider.listar(), [{ legajo: 1, codigoCategoria: 'ADMIN', nombre: null }]);
});

test('el snapshot no contiene credenciales ni connect string (Principio V)', () => {
  const repoDir = tmpRepo();
  const filePath = rutaPadron(repoDir, '202607');
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }], vista: 'RRHH.V_PADRON' });
  const raw = readFileSync(filePath, 'utf8');
  assert.ok(!/password|connectString|179\.41/i.test(raw), 'nada sensible en el snapshot');
  assert.match(raw, /"generadoEn"/);
});

test('categoría vacía en el snapshot se normaliza a null', async () => {
  const repoDir = tmpRepo();
  const now = () => new Date(2026, 6, 1);
  guardarSnapshotPadron({ filePath: rutaPadron(repoDir, '202607'), empleados: [{ legajo: 7, codigoCategoria: '  ' }] });
  const provider = createFilePadronCategoryProvider({ repoDir, now });
  assert.equal((await provider.obtenerCategoria(7)).codigoCategoria, null);
});

test('archivo inexistente → error claro que sugiere sincronizar', async () => {
  const provider = createFilePadronCategoryProvider({ repoDir: tmpRepo(), now: () => new Date(2026, 6, 1) });
  await assert.rejects(() => provider.listar(), /sincronizar-padron/);
});

test('snapshot con formato inválido → error explícito', async () => {
  const repoDir = tmpRepo();
  const filePath = rutaPadron(repoDir, '202607');
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 1, codigoCategoria: 'X' }] });
  // Reescribe con forma inesperada.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(filePath, JSON.stringify({ otra: 'cosa' }), 'utf8');
  const provider = createFilePadronCategoryProvider({ repoDir, now: () => new Date(2026, 6, 1) });
  await assert.rejects(() => provider.listar(), /formato esperado/);
});

// 013-reestructurar-data-periodos (US2, FR-004, research.md §5): el provider
// resuelve el snapshot del MES EN CURSO en cada llamada, nunca lo fija al
// construirse — así un proceso de larga vida (el backend web) lee el padrón
// correcto apenas cambia el mes, sin reiniciarse.
test('resuelve P<mesActualPeriodo(now())>/padron.json en cada llamada, no al construirse', async () => {
  const repoDir = tmpRepo();
  guardarSnapshotPadron({ filePath: rutaPadron(repoDir, '202607'), empleados: [{ legajo: 1, codigoCategoria: 'JULIO' }] });
  guardarSnapshotPadron({ filePath: rutaPadron(repoDir, '202608'), empleados: [{ legajo: 1, codigoCategoria: 'AGOSTO' }] });

  let mesActual = new Date(2026, 6, 15); // julio
  const provider = createFilePadronCategoryProvider({ repoDir, now: () => mesActual });

  assert.equal((await provider.obtenerCategoria(1)).codigoCategoria, 'JULIO');

  // El reloj avanza a agosto SIN recrear el provider: debe leer el padrón nuevo.
  mesActual = new Date(2026, 7, 1);
  assert.equal((await provider.obtenerCategoria(1)).codigoCategoria, 'AGOSTO');

  // Y volver a julio (mismo proceso) sigue viendo el padrón de julio intacto.
  mesActual = new Date(2026, 6, 20);
  assert.equal((await provider.obtenerCategoria(1)).codigoCategoria, 'JULIO');
});
