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

// --- spec 005: soporte del snapshot 004 { empleados: [{ legajo }] } ---

test('LocalFileActiveEmployeesProvider: lee el snapshot 004 ({ empleados }) y expone los legajos activos', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'padron.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        generadoEn: '2026-07-13T00:00:00Z',
        vista: 'RRHH.V_PADRON',
        empleados: [
          { legajo: 9, categoria: 'PROD', nombre: 'Ada' },
          { legajo: 74, categoria: 'PROD', nombre: 'Grace' },
        ],
      }),
      'utf8'
    );
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    assert.deepEqual(await provider.getActiveEmployees(), [
      { legajo: 9, activo: true },
      { legajo: 74, activo: true },
    ]);
  });
});

test('LocalFileActiveEmployeesProvider: normaliza (dedup + descarta invalidos) en ambos esquemas', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'padron.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        empleados: [
          { legajo: 9 },
          { legajo: 9 }, // duplicado
          { legajo: 0 }, // invalido (< 1)
          { legajo: 'x' }, // invalido (no numerico)
          { legajo: 10 },
        ],
      }),
      'utf8'
    );
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    assert.deepEqual(await provider.getActiveEmployees(), [
      { legajo: 9, activo: true },
      { legajo: 10, activo: true },
    ]);
  });
});

test('LocalFileActiveEmployeesProvider: rechaza si tras normalizar no queda ningun legajo valido', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'padron.json');
    writeFileSync(filePath, JSON.stringify({ empleados: [{ legajo: 0 }, { legajo: -1 }] }), 'utf8');
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  });
});
