import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalFileActiveEmployeesProvider } from '../../src/roster/local-file-active-employees-provider.js';
import { createOracleRosterRepository } from '../../src/db/oracle-roster-repository.js';
import { createOracleEmployeeCategoryProvider } from '../../src/presentismo/adapters/oracle-employee-category-provider.js';

// spec 015 (FR-001, contracts/oracle-roster-fecha-ingreso.md): extensión del
// padrón con fechaIngreso. Cubre la normalización end-to-end: nula/vacía/no
// parseable → null, SIN descartar el legajo (a diferencia de un legajo
// inválido, que sí se descarta hoy).

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-fecha-ingreso-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('local-file-active-employees-provider: fechaIngreso válida viaja tal cual', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'padron.json');
    writeFileSync(
      filePath,
      JSON.stringify({ empleados: [{ legajo: 1, fechaIngreso: '2018-03-01' }] }),
      'utf8',
    );
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    assert.deepEqual(await provider.getActiveEmployees(), [
      { legajo: 1, activo: true, fechaIngreso: '2018-03-01' },
    ]);
  });
});

test('local-file-active-employees-provider: fechaIngreso ausente/nula/vacía/no parseable → null, legajo NO se descarta', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'padron.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        empleados: [
          { legajo: 1 }, // ausente
          { legajo: 2, fechaIngreso: null },
          { legajo: 3, fechaIngreso: '' },
          { legajo: 4, fechaIngreso: 'no-es-fecha' },
          { legajo: 5, fechaIngreso: '2026-13-40' }, // formato correcto pero no valida calendario: se acepta tal cual (validación de calendario no es responsabilidad de esta capa)
        ],
      }),
      'utf8',
    );
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    const empleados = await provider.getActiveEmployees();
    assert.equal(empleados.length, 5, 'ningún legajo se descarta por fechaIngreso inválida');
    assert.equal(empleados.find((e) => e.legajo === 1).fechaIngreso, null);
    assert.equal(empleados.find((e) => e.legajo === 2).fechaIngreso, null);
    assert.equal(empleados.find((e) => e.legajo === 3).fechaIngreso, null);
    assert.equal(empleados.find((e) => e.legajo === 4).fechaIngreso, null);
  });
});

test('local-file-active-employees-provider: esquema legacy (legajosActivos) siempre expone fechaIngreso: null', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'active-employees.json');
    writeFileSync(filePath, JSON.stringify({ legajosActivos: [1, 2] }), 'utf8');
    const provider = createLocalFileActiveEmployeesProvider({ filePath });
    assert.deepEqual(await provider.getActiveEmployees(), [
      { legajo: 1, activo: true, fechaIngreso: null },
      { legajo: 2, activo: true, fechaIngreso: null },
    ]);
  });
});

test('pipeline Oracle (fetchLegajosConCategoria → oracle-employee-category-provider): fechaIngreso nula/no parseable → null sin descartar el legajo', async () => {
  const factory = async () => ({
    async execute() {
      return {
        rows: [
          { LEGAJO: 1, CATEGORIA: 'ADMIN', FECHA_INGRESO: null },
          { LEGAJO: 2, CATEGORIA: 'PROD', FECHA_INGRESO: '' },
          { LEGAJO: 3, CATEGORIA: 'PROD', FECHA_INGRESO: 'invalida' },
          { LEGAJO: 4, CATEGORIA: 'PROD', FECHA_INGRESO: '2020-05-15' },
        ],
      };
    },
    async close() {},
  });
  const repository = createOracleRosterRepository({
    config: {
      vistaPadron: 'RRHH.V_PADRON',
      columnaLegajo: 'LEGAJO',
      columnaCategoria: 'CATEGORIA',
      columnaFechaIngreso: 'FECHA_INGRESO',
      timeoutMs: 5000,
    },
    connectionFactory: factory,
  });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  const listado = await provider.listar();
  assert.equal(listado.length, 4, 'ningún legajo se descarta por fechaIngreso inválida');
  assert.equal(listado.find((e) => e.legajo === 1).fechaIngreso, null);
  assert.equal(listado.find((e) => e.legajo === 2).fechaIngreso, null);
  assert.equal(listado.find((e) => e.legajo === 3).fechaIngreso, null);
  assert.equal(listado.find((e) => e.legajo === 4).fechaIngreso, '2020-05-15');
});
