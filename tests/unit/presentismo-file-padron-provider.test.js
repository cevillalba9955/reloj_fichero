import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFilePadronCategoryProvider,
  guardarSnapshotPadron,
} from '../../src/presentismo/adapters/file-padron-category-provider.js';

function tmpFile(nombre = 'padron.json') {
  return join(mkdtempSync(join(tmpdir(), 'padron-')), nombre);
}

test('guardarSnapshotPadron + provider por archivo hacen round-trip sin DB', async () => {
  const filePath = tmpFile();
  guardarSnapshotPadron({
    filePath,
    vista: 'RRHH.V_PADRON',
    empleados: [
      { legajo: 5678, codigoCategoria: 'PROD', nombre: 'Grace Hopper' },
      { legajo: 1234, codigoCategoria: 'ADMIN', nombre: 'Ada Lovelace' },
    ],
  });

  const provider = createFilePadronCategoryProvider({ filePath });
  assert.deepEqual(await provider.obtenerCategoria(1234), { legajo: 1234, codigoCategoria: 'ADMIN' });
  assert.deepEqual(await provider.listar(), [
    { legajo: 1234, codigoCategoria: 'ADMIN', nombre: 'Ada Lovelace' },
    { legajo: 5678, codigoCategoria: 'PROD', nombre: 'Grace Hopper' },
  ]);
  // Legajo ausente → null.
  assert.deepEqual(await provider.obtenerCategoria(9999), { legajo: 9999, codigoCategoria: null });
});

test('snapshot sin nombre (columna no configurada) → nombre null en el round-trip', async () => {
  const filePath = tmpFile();
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }] });
  const provider = createFilePadronCategoryProvider({ filePath });
  assert.deepEqual(await provider.listar(), [{ legajo: 1, codigoCategoria: 'ADMIN', nombre: null }]);
});

test('el snapshot no contiene credenciales ni connect string (Principio V)', () => {
  const filePath = tmpFile();
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }], vista: 'RRHH.V_PADRON' });
  const raw = readFileSync(filePath, 'utf8');
  assert.ok(!/password|connectString|179\.41/i.test(raw), 'nada sensible en el snapshot');
  assert.match(raw, /"generadoEn"/);
});

test('categoría vacía en el snapshot se normaliza a null', async () => {
  const filePath = tmpFile();
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 7, codigoCategoria: '  ' }] });
  const provider = createFilePadronCategoryProvider({ filePath });
  assert.equal((await provider.obtenerCategoria(7)).codigoCategoria, null);
});

test('archivo inexistente → error claro que sugiere sincronizar', async () => {
  const provider = createFilePadronCategoryProvider({ filePath: tmpFile('no-existe.json') });
  await assert.rejects(() => provider.listar(), /sincronizar-padron/);
});

test('snapshot con formato inválido → error explícito', async () => {
  const filePath = tmpFile();
  guardarSnapshotPadron({ filePath, empleados: [{ legajo: 1, codigoCategoria: 'X' }] });
  // Reescribe con forma inesperada.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(filePath, JSON.stringify({ otra: 'cosa' }), 'utf8');
  const provider = createFilePadronCategoryProvider({ filePath });
  await assert.rejects(() => provider.listar(), /formato esperado/);
});
