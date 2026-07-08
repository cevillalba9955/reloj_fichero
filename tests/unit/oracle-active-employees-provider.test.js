import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOracleActiveEmployeesProvider } from '../../src/roster/oracle-active-employees-provider.js';
import { RosterNoDisponibleError } from '../../src/roster/active-employees-provider.js';

function fakeRepo(rowsOrThrow) {
  return {
    async fetchLegajosActivos() {
      if (rowsOrThrow instanceof Error) throw rowsOrThrow;
      return rowsOrThrow;
    },
  };
}

function fakeLogger() {
  const eventos = [];
  return { eventos, logEvento: (e) => eventos.push(e) };
}

test('OracleActiveEmployeesProvider: mapea filas a Empleado[] { legajo, activo: true }', async () => {
  const provider = createOracleActiveEmployeesProvider({ repository: fakeRepo([101, 102, 103]) });
  assert.deepEqual(await provider.getActiveEmployees(), [
    { legajo: 101, activo: true },
    { legajo: 102, activo: true },
    { legajo: 103, activo: true },
  ]);
});

test('OracleActiveEmployeesProvider: deduplica legajos repetidos y loguea cada descarte (FR-012)', async () => {
  const logger = fakeLogger();
  const provider = createOracleActiveEmployeesProvider({ repository: fakeRepo([101, 101, 102, 101]), logger });
  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados.map((e) => e.legajo), [101, 102]);
  const duplicados = logger.eventos.filter((e) => e.evento === 'legajo_descartado' && e.detail === 'duplicado');
  assert.equal(duplicados.length, 2);
});

test('OracleActiveEmployeesProvider: descarta valores no interpretables como legajo sin invalidar el padrón (FR-012)', async () => {
  const logger = fakeLogger();
  const provider = createOracleActiveEmployeesProvider({
    repository: fakeRepo([101, null, 'texto', -5, 0, 3.5, '  ', 102]),
    logger,
  });
  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados.map((e) => e.legajo), [101, 102]);
  const invalidos = logger.eventos.filter((e) => e.evento === 'legajo_descartado' && e.detail === 'invalido');
  assert.equal(invalidos.length, 6);
});

test('OracleActiveEmployeesProvider: acepta legajos como string numérico entero (normalizados a número)', async () => {
  const provider = createOracleActiveEmployeesProvider({ repository: fakeRepo(['101', '102']) });
  assert.deepEqual(await provider.getActiveEmployees(), [
    { legajo: 101, activo: true },
    { legajo: 102, activo: true },
  ]);
});

test('OracleActiveEmployeesProvider: no captura RosterNoDisponibleError del repositorio (lo maneja el decorator)', async () => {
  const provider = createOracleActiveEmployeesProvider({
    repository: fakeRepo(new RosterNoDisponibleError('fuente caída')),
  });
  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
});

test('OracleActiveEmployeesProvider: un descarte nunca incluye el valor crudo no representable en el log', async () => {
  const logger = fakeLogger();
  const provider = createOracleActiveEmployeesProvider({ repository: fakeRepo([{ raro: true }]), logger });
  await provider.getActiveEmployees();
  const descartes = logger.eventos.filter((e) => e.evento === 'legajo_descartado');
  assert.equal(descartes.length, 1);
  assert.equal(descartes[0].detail, 'invalido');
});
