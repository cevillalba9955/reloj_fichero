import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOracleRosterRepository } from '../../src/db/oracle-roster-repository.js';
import { RosterNoDisponibleError } from '../../src/roster/active-employees-provider.js';

const CONFIG_BASE = {
  user: 'padron_ro',
  password: 'S3cr3tPassw0rd',
  connectString: 'oracle.host:1521/RRHHPROD',
  vistaPadron: 'RRHH.V_PADRON_ACTIVOS',
  columnaLegajo: 'LEGAJO',
  timeoutMs: 1000,
};

// Fábrica de conexiones fake (research.md §8): registra el SQL recibido,
// devuelve filas simuladas y anota si close() fue llamado.
function fakeFactory({ rows = [], onExecuteThrow = null, onConnectThrow = null } = {}) {
  const state = { sql: null, binds: null, closed: false, connected: false };
  async function factory() {
    if (onConnectThrow) throw onConnectThrow;
    state.connected = true;
    return {
      async execute(sql, binds) {
        state.sql = sql;
        state.binds = binds;
        if (onExecuteThrow) throw onExecuteThrow;
        return { rows };
      },
      async close() {
        state.closed = true;
      },
    };
  }
  return { factory, state };
}

test('OracleRosterRepository: genera exactamente SELECT <columna> FROM <vista> con la config', async () => {
  const { factory, state } = fakeFactory({ rows: [[101], [102]] });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });

  const filas = await repo.fetchLegajosActivos();

  assert.equal(state.sql, 'SELECT LEGAJO FROM RRHH.V_PADRON_ACTIVOS');
  assert.deepEqual(filas, [101, 102]);
  assert.equal(state.closed, true);
});

test('OracleRosterRepository: devuelve las filas crudas SIN normalizar (dedup/inválidos los hace el provider)', async () => {
  const { factory } = fakeFactory({ rows: [[101], [101], ['x'], [null]] });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });
  const filas = await repo.fetchLegajosActivos();
  assert.deepEqual(filas, [101, 101, 'x', null]);
});

test('OracleRosterRepository: soporta filas en formato objeto ({ LEGAJO: n })', async () => {
  const { factory } = fakeFactory({ rows: [{ LEGAJO: 5 }, { LEGAJO: 6 }] });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });
  assert.deepEqual(await repo.fetchLegajosActivos(), [5, 6]);
});

test('OracleRosterRepository: rechaza SIN ejecutar si la vista no es un identificador SQL válido', async () => {
  const { factory, state } = fakeFactory({ rows: [[1]] });
  const repo = createOracleRosterRepository({
    config: { ...CONFIG_BASE, vistaPadron: 'V_PADRON; DROP TABLE X' },
    connectionFactory: factory,
  });
  await assert.rejects(() => repo.fetchLegajosActivos());
  assert.equal(state.connected, false, 'no debe abrir conexión con un identificador inválido');
  assert.equal(state.sql, null);
});

test('OracleRosterRepository: rechaza SIN ejecutar si la columna no es un identificador SQL válido', async () => {
  const { factory, state } = fakeFactory({ rows: [[1]] });
  const repo = createOracleRosterRepository({
    config: { ...CONFIG_BASE, columnaLegajo: 'LEG AJO' },
    connectionFactory: factory,
  });
  await assert.rejects(() => repo.fetchLegajosActivos());
  assert.equal(state.connected, false);
});

test('OracleRosterRepository: un fallo de conexión sale como RosterNoDisponibleError categoría conexion, sin secretos', async () => {
  const { factory } = fakeFactory({ onConnectThrow: new Error(`no route to oracle.host:1521/RRHHPROD user=padron_ro pass=S3cr3tPassw0rd`) });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });
  await assert.rejects(
    () => repo.fetchLegajosActivos(),
    (err) => {
      assert.ok(err instanceof RosterNoDisponibleError);
      assert.equal(err.categoria, 'conexion');
      assert.ok(!/S3cr3tPassw0rd/.test(err.message), 'no debe filtrar la password');
      assert.ok(!/1521\/RRHHPROD/.test(err.message), 'no debe filtrar el connect string');
      return true;
    }
  );
});

test('OracleRosterRepository: distingue autenticación rechazada (ORA-01017)', async () => {
  const { factory } = fakeFactory({ onConnectThrow: new Error('ORA-01017: invalid username/password; logon denied') });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });
  await assert.rejects(
    () => repo.fetchLegajosActivos(),
    (err) => {
      assert.equal(err.categoria, 'autenticacion');
      return true;
    }
  );
});

test('OracleRosterRepository: cierra la conexión incluso si execute falla', async () => {
  const { factory, state } = fakeFactory({ onExecuteThrow: new Error('ORA-00942: table or view does not exist') });
  const repo = createOracleRosterRepository({ config: CONFIG_BASE, connectionFactory: factory });
  await assert.rejects(
    () => repo.fetchLegajosActivos(),
    (err) => {
      assert.ok(err instanceof RosterNoDisponibleError);
      assert.equal(err.categoria, 'consulta');
      return true;
    }
  );
  assert.equal(state.closed, true, 'close() debe llamarse en el finally aún ante error de execute');
});

test('OracleRosterRepository: un timeout se traduce a RosterNoDisponibleError categoría timeout sin espera indefinida', async () => {
  // Fábrica que nunca resuelve: solo el timeout puede desbloquear.
  async function factory() {
    return new Promise(() => {});
  }
  const repo = createOracleRosterRepository({
    config: { ...CONFIG_BASE, timeoutMs: 50 },
    connectionFactory: factory,
  });
  await assert.rejects(
    () => repo.fetchLegajosActivos(),
    (err) => {
      assert.ok(err instanceof RosterNoDisponibleError);
      assert.equal(err.categoria, 'timeout');
      return true;
    }
  );
});
