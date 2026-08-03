import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearSincronizadorPadron } from '../../src/web/padron-sync.js';
import { ConfiguracionPadronInvalidaError } from '../../src/db/oracle-roster-config.js';

// fix vacaciones — sincronizador de padrón reusado por calendario-handlers.js
// (auto al iniciar el período actual) y padron-handlers.js (botón manual).
// Fábrica de conexión FAKE (mismo patrón que oracle-employee-category-provider.test.js):
// sin base real.
function fakeConnectionFactory(rows) {
  return async () => ({
    async execute(sql) {
      return { rows };
    },
    async close() {},
  });
}

const envOracle = {
  RRHH_ORACLE_USER: 'ro',
  RRHH_ORACLE_PASSWORD: 'x',
  RRHH_ORACLE_CONNECT_STRING: 'host/svc',
  RRHH_ORACLE_VISTA_PADRON: 'RRHH.V_PADRON',
  RRHH_ORACLE_COLUMNA_CATEGORIA: 'CATEGORIA',
  RRHH_ORACLE_COLUMNA_NOMBRE: 'NOMBRE',
  RRHH_ORACLE_COLUMNA_FECHA_INGRESO: 'FECHA_INGRESO',
};

function conRepoTemporal(fn) {
  const repoDir = mkdtempSync(join(tmpdir(), 'padron-sync-'));
  return Promise.resolve(fn(repoDir)).finally(() => rmSync(repoDir, { recursive: true, force: true }));
}

test('sincronizarPadronOracle escribe el snapshot del período actual con fechaIngreso', () =>
  conRepoTemporal(async (repoDir) => {
    const sincronizar = crearSincronizadorPadron({
      repoDir,
      env: envOracle,
      connectionFactory: fakeConnectionFactory([
        { LEGAJO: 1, CATEGORIA: 'ADMIN', NOMBRE: 'Ana Pérez', FECHA_INGRESO: '2020-01-15' },
      ]),
      now: () => new Date('2026-08-03T00:00:00Z'),
    });

    const resultado = await sincronizar();
    assert.equal(resultado.periodo, '202608');
    assert.equal(resultado.empleados.length, 1);
    assert.equal(resultado.empleados[0].fechaIngreso, '2020-01-15');
    assert.equal(resultado.vista, 'RRHH.V_PADRON');

    const enDisco = JSON.parse(readFileSync(join(repoDir, 'P202608', 'padron.json'), 'utf8'));
    assert.equal(enDisco.empleados[0].fechaIngreso, '2020-01-15');
    assert.equal(enDisco.vista, 'RRHH.V_PADRON');
  }));

test('sincronizarPadronOracle rechaza si Oracle no devuelve legajos', () =>
  conRepoTemporal(async (repoDir) => {
    const sincronizar = crearSincronizadorPadron({
      repoDir,
      env: envOracle,
      connectionFactory: fakeConnectionFactory([]),
      now: () => new Date('2026-08-03T00:00:00Z'),
    });
    await assert.rejects(sincronizar(), /no devolvió legajos activos/);
  }));

test('sincronizarPadronOracle rechaza si falta configuración Oracle', () =>
  conRepoTemporal(async (repoDir) => {
    const sincronizar = crearSincronizadorPadron({ repoDir, env: {} });
    await assert.rejects(sincronizar(), ConfiguracionPadronInvalidaError);
  }));
