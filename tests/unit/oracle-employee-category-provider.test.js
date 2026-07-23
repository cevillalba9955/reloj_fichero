import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOracleRosterRepository } from '../../src/db/oracle-roster-repository.js';
import { createOracleEmployeeCategoryProvider } from '../../src/presentismo/adapters/oracle-employee-category-provider.js';

// Fábrica de conexión FAKE (research §8): sin base real. Registra el SQL y
// devuelve filas fijas en formato OBJECT (columnas en mayúsculas).
function fakeConnectionFactory(rows) {
  const calls = { sql: null, closed: false };
  const factory = async () => ({
    async execute(sql) {
      calls.sql = sql;
      return { rows };
    },
    async close() {
      calls.closed = true;
    },
  });
  return { factory, calls };
}

const config = {
  user: 'ro',
  password: 'x',
  connectString: 'host/svc',
  vistaPadron: 'RRHH.V_PADRON',
  columnaLegajo: 'LEGAJO',
  columnaCategoria: 'CATEGORIA',
  timeoutMs: 5000,
};

test('provee categoría por legajo desde el padrón (fake conn)', async () => {
  const { factory, calls } = fakeConnectionFactory([
    { LEGAJO: 1234, CATEGORIA: 'ADMIN' },
    { LEGAJO: 5678, CATEGORIA: 'PROD' },
  ]);
  const repository = createOracleRosterRepository({ config, connectionFactory: factory });
  const provider = createOracleEmployeeCategoryProvider({ repository });

  assert.deepEqual(await provider.obtenerCategoria(1234), { legajo: 1234, codigoCategoria: 'ADMIN' });
  assert.deepEqual(await provider.obtenerCategoria(5678), { legajo: 5678, codigoCategoria: 'PROD' });
  // Legajo ausente del padrón → null.
  assert.deepEqual(await provider.obtenerCategoria(9999), { legajo: 9999, codigoCategoria: null });
  // SQL proyecta ambas columnas; conexión cerrada.
  assert.match(calls.sql, /SELECT LEGAJO, CATEGORIA FROM RRHH\.V_PADRON/);
  assert.equal(calls.closed, true);
});

test('categoría vacía/nula del padrón se normaliza a null', async () => {
  const { factory } = fakeConnectionFactory([
    { LEGAJO: 1, CATEGORIA: '  ' },
    { LEGAJO: 2, CATEGORIA: null },
  ]);
  const repository = createOracleRosterRepository({ config, connectionFactory: factory });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  assert.equal((await provider.obtenerCategoria(1)).codigoCategoria, null);
  assert.equal((await provider.obtenerCategoria(2)).codigoCategoria, null);
});

test('lee el padrón una sola vez (cache)', async () => {
  let ejecuciones = 0;
  const factory = async () => ({
    async execute() {
      ejecuciones++;
      return { rows: [{ LEGAJO: 1, CATEGORIA: 'ADMIN' }] };
    },
    async close() {},
  });
  const repository = createOracleRosterRepository({ config, connectionFactory: factory });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  await provider.obtenerCategoria(1);
  await provider.obtenerCategoria(1);
  assert.equal(ejecuciones, 1, 'una sola consulta al padrón');
});

test('listar() devuelve el padrón normalizado y ordenado por legajo', async () => {
  const { factory } = fakeConnectionFactory([
    { LEGAJO: 5678, CATEGORIA: 'PROD' },
    { LEGAJO: 1234, CATEGORIA: 'ADMIN' },
    { LEGAJO: 9, CATEGORIA: '  ' }, // categoría vacía → null
  ]);
  const repository = createOracleRosterRepository({ config, connectionFactory: factory });
  const provider = createOracleEmployeeCategoryProvider({ repository });

  // Sin columnaNombre/columnaFechaIngreso configuradas, ambas son null.
  assert.deepEqual(await provider.listar(), [
    { legajo: 9, codigoCategoria: null, nombre: null, fechaIngreso: null },
    { legajo: 1234, codigoCategoria: 'ADMIN', nombre: null, fechaIngreso: null },
    { legajo: 5678, codigoCategoria: 'PROD', nombre: null, fechaIngreso: null },
  ]);
});

test('con columnaNombre, listar() incluye el nombre y el SQL lo proyecta', async () => {
  const { factory, calls } = fakeConnectionFactory([
    { LEGAJO: 1234, CATEGORIA: 'ADMIN', NOMBRE: 'Ada Lovelace' },
    { LEGAJO: 5678, CATEGORIA: 'PROD', NOMBRE: '  ' }, // nombre vacío → null
  ]);
  const repository = createOracleRosterRepository({
    config: { ...config, columnaNombre: 'NOMBRE' },
    connectionFactory: factory,
  });
  const provider = createOracleEmployeeCategoryProvider({ repository });

  assert.deepEqual(await provider.listar(), [
    { legajo: 1234, codigoCategoria: 'ADMIN', nombre: 'Ada Lovelace', fechaIngreso: null },
    { legajo: 5678, codigoCategoria: 'PROD', nombre: null, fechaIngreso: null },
  ]);
  assert.match(calls.sql, /SELECT LEGAJO, CATEGORIA, NOMBRE FROM RRHH\.V_PADRON/);
  // obtenerCategoria sigue devolviendo solo la categoría (no cambia el puerto).
  assert.deepEqual(await provider.obtenerCategoria(1234), { legajo: 1234, codigoCategoria: 'ADMIN' });
});

// spec 015 (FR-001, contracts/oracle-roster-fecha-ingreso.md): columna de
// fecha de ingreso opcional, fuente de la antigüedad para vacaciones.
test('con columnaFechaIngreso, listar() incluye fechaIngreso y el SQL la proyecta', async () => {
  const { factory, calls } = fakeConnectionFactory([
    { LEGAJO: 1234, CATEGORIA: 'ADMIN', FECHA_INGRESO: '2018-03-01' },
    { LEGAJO: 5678, CATEGORIA: 'PROD', FECHA_INGRESO: null },
  ]);
  const repository = createOracleRosterRepository({
    config: { ...config, columnaFechaIngreso: 'FECHA_INGRESO' },
    connectionFactory: factory,
  });
  const provider = createOracleEmployeeCategoryProvider({ repository });

  assert.deepEqual(await provider.listar(), [
    { legajo: 1234, codigoCategoria: 'ADMIN', nombre: null, fechaIngreso: '2018-03-01' },
    { legajo: 5678, codigoCategoria: 'PROD', nombre: null, fechaIngreso: null },
  ]);
  assert.match(calls.sql, /SELECT LEGAJO, CATEGORIA, FECHA_INGRESO FROM RRHH\.V_PADRON/);
});

test('fechaIngreso no parseable como YYYY-MM-DD se normaliza a null sin descartar el legajo', async () => {
  const { factory } = fakeConnectionFactory([{ LEGAJO: 1, CATEGORIA: 'ADMIN', FECHA_INGRESO: 'no-es-fecha' }]);
  const repository = createOracleRosterRepository({
    config: { ...config, columnaFechaIngreso: 'FECHA_INGRESO' },
    connectionFactory: factory,
  });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  assert.deepEqual(await provider.listar(), [{ legajo: 1, codigoCategoria: 'ADMIN', nombre: null, fechaIngreso: null }]);
});

test('con columnaNombre Y columnaFechaIngreso, el SQL proyecta ambas en orden', async () => {
  const { factory, calls } = fakeConnectionFactory([
    { LEGAJO: 1, CATEGORIA: 'ADMIN', NOMBRE: 'Ada', FECHA_INGRESO: '2018-03-01' },
  ]);
  const repository = createOracleRosterRepository({
    config: { ...config, columnaNombre: 'NOMBRE', columnaFechaIngreso: 'FECHA_INGRESO' },
    connectionFactory: factory,
  });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  assert.deepEqual(await provider.listar(), [
    { legajo: 1, codigoCategoria: 'ADMIN', nombre: 'Ada', fechaIngreso: '2018-03-01' },
  ]);
  assert.match(calls.sql, /SELECT LEGAJO, CATEGORIA, NOMBRE, FECHA_INGRESO FROM RRHH\.V_PADRON/);
});

test('listar() y obtenerCategoria() comparten una sola consulta al padrón', async () => {
  let ejecuciones = 0;
  const factory = async () => ({
    async execute() {
      ejecuciones++;
      return { rows: [{ LEGAJO: 1, CATEGORIA: 'ADMIN' }] };
    },
    async close() {},
  });
  const repository = createOracleRosterRepository({ config, connectionFactory: factory });
  const provider = createOracleEmployeeCategoryProvider({ repository });
  await provider.listar();
  await provider.obtenerCategoria(1);
  assert.equal(ejecuciones, 1, 'una sola consulta al padrón (cache compartido)');
});

test('sin columnaCategoria configurada, el repositorio lo informa claro', async () => {
  const { factory } = fakeConnectionFactory([]);
  const repository = createOracleRosterRepository({
    config: { ...config, columnaCategoria: null },
    connectionFactory: factory,
  });
  await assert.rejects(() => repository.fetchLegajosConCategoria(), /columnaCategoria no configurada/);
});
