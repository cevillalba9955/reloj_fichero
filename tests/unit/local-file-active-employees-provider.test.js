import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalFileActiveEmployeesProvider } from '../../src/roster/local-file-active-employees-provider.js';
import { RosterNoDisponibleError } from '../../src/roster/active-employees-provider.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-roster-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('LocalFileActiveEmployeesProvider: lee el archivo de configuración y expone los legajos activos', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'active-employees.json');
    writeFileSync(filePath, JSON.stringify({ legajosActivos: [1, 2, 3] }), 'utf8');

    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    const empleados = await provider.getActiveEmployees();

    assert.deepEqual(empleados, [
      { legajo: 1, activo: true },
      { legajo: 2, activo: true },
      { legajo: 3, activo: true },
    ]);
  });
});

test('LocalFileActiveEmployeesProvider: rechaza con RosterNoDisponibleError si el archivo no existe', async () => {
  const provider = createLocalFileActiveEmployeesProvider({
    filePath: 'C:/ruta/que/no/existe/active-employees.json',
  });
  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
});

test('LocalFileActiveEmployeesProvider: rechaza con RosterNoDisponibleError si el archivo no tiene JSON válido', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'active-employees.json');
    writeFileSync(filePath, '{ esto no es json valido', 'utf8');
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  });
});

test('LocalFileActiveEmployeesProvider: rechaza con RosterNoDisponibleError si falta el campo legajosActivos', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'active-employees.json');
    writeFileSync(filePath, JSON.stringify({ otraCosa: true }), 'utf8');
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  });
});
