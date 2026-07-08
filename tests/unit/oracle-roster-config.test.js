import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOracleRosterConfig, ConfiguracionPadronInvalidaError } from '../../src/db/oracle-roster-config.js';

const ENV_COMPLETO = {
  RRHH_ORACLE_USER: 'padron_ro',
  RRHH_ORACLE_PASSWORD: 'S3cr3tPassw0rd',
  RRHH_ORACLE_CONNECT_STRING: 'oracle.host:1521/RRHHPROD',
  RRHH_ORACLE_VISTA_PADRON: 'RRHH.V_PADRON_ACTIVOS',
};

test('readOracleRosterConfig: config completa → objeto con defaults aplicados', () => {
  const config = readOracleRosterConfig(ENV_COMPLETO);
  assert.equal(config.user, 'padron_ro');
  assert.equal(config.password, 'S3cr3tPassw0rd');
  assert.equal(config.connectString, 'oracle.host:1521/RRHHPROD');
  assert.equal(config.vistaPadron, 'RRHH.V_PADRON_ACTIVOS');
  assert.equal(config.columnaLegajo, 'LEGAJO', 'default columnaLegajo');
  assert.equal(config.timeoutMs, 10000, 'default timeoutMs');
});

test('readOracleRosterConfig: respeta columnaLegajo y timeoutMs cuando se proveen', () => {
  const config = readOracleRosterConfig({
    ...ENV_COMPLETO,
    RRHH_ORACLE_COLUMNA_LEGAJO: 'NRO_LEGAJO',
    RRHH_ORACLE_TIMEOUT_MS: '3000',
  });
  assert.equal(config.columnaLegajo, 'NRO_LEGAJO');
  assert.equal(config.timeoutMs, 3000);
});

test('readOracleRosterConfig: faltan N variables requeridas → un solo error que las nombra todas', () => {
  try {
    readOracleRosterConfig({});
    assert.fail('debió lanzar');
  } catch (err) {
    assert.ok(err instanceof ConfiguracionPadronInvalidaError);
    assert.match(err.message, /RRHH_ORACLE_USER/);
    assert.match(err.message, /RRHH_ORACLE_PASSWORD/);
    assert.match(err.message, /RRHH_ORACLE_CONNECT_STRING/);
    assert.match(err.message, /RRHH_ORACLE_VISTA_PADRON/);
  }
});

test('readOracleRosterConfig: una variable requerida vacía cuenta como faltante', () => {
  assert.throws(
    () => readOracleRosterConfig({ ...ENV_COMPLETO, RRHH_ORACLE_USER: '   ' }),
    (err) => {
      assert.ok(err instanceof ConfiguracionPadronInvalidaError);
      assert.match(err.message, /RRHH_ORACLE_USER/);
      return true;
    }
  );
});

test('readOracleRosterConfig: vista con caracteres fuera del patrón (;, espacios, comillas) → error', () => {
  for (const vista of ['V_PADRON; DROP TABLE X', 'V PADRON', "V'PADRON", 'V-PADRON']) {
    assert.throws(
      () => readOracleRosterConfig({ ...ENV_COMPLETO, RRHH_ORACLE_VISTA_PADRON: vista }),
      (err) => {
        assert.ok(err instanceof ConfiguracionPadronInvalidaError);
        assert.match(err.message, /RRHH_ORACLE_VISTA_PADRON/);
        return true;
      },
      `vista inválida no rechazada: ${vista}`
    );
  }
});

test('readOracleRosterConfig: columna inválida (con punto o caracteres raros) → error', () => {
  assert.throws(
    () => readOracleRosterConfig({ ...ENV_COMPLETO, RRHH_ORACLE_COLUMNA_LEGAJO: 'A.B' }),
    ConfiguracionPadronInvalidaError
  );
});

test('readOracleRosterConfig: timeout no numérico o ≤ 0 → error', () => {
  for (const valor of ['abc', '0', '-100', '1.5']) {
    assert.throws(
      () => readOracleRosterConfig({ ...ENV_COMPLETO, RRHH_ORACLE_TIMEOUT_MS: valor }),
      (err) => {
        assert.ok(err instanceof ConfiguracionPadronInvalidaError);
        assert.match(err.message, /RRHH_ORACLE_TIMEOUT_MS/);
        return true;
      },
      `timeout inválido no rechazado: ${valor}`
    );
  }
});

test('readOracleRosterConfig: ningún mensaje de error contiene el valor de la password (FR-005, SC-006)', () => {
  const env = { RRHH_ORACLE_PASSWORD: 'S3cr3tPassw0rd' }; // faltan las demás
  try {
    readOracleRosterConfig(env);
    assert.fail('debió lanzar');
  } catch (err) {
    assert.ok(!/S3cr3tPassw0rd/.test(err.message), 'el mensaje jamás debe incluir el valor de la password');
  }
});
