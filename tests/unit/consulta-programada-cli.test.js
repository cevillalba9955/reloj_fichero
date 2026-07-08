import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, InvalidArgsError, createRosterProvider } from '../../src/cli/consulta-programada.js';
import { ConfiguracionPadronInvalidaError } from '../../src/db/oracle-roster-config.js';

test('parseCliArgs: exige --host', () => {
  assert.throws(() => parseCliArgs([]), InvalidArgsError);
});

test('parseCliArgs: aplica los defaults de FR-002 y del adapter placeholder del padrón', () => {
  const options = parseCliArgs(['--host', '192.168.1.82']);
  assert.equal(options.host, '192.168.1.82');
  assert.equal(options.port, 5005);
  assert.equal(options.rosterConfigPath, './config/active-employees.json');
  assert.equal(options.logDir, './logs');
  assert.equal(options.timeoutMs, 5000);
  assert.equal(options.fullHandshake, false);
  assert.deepEqual(options.checkpoints, {
    entrada: { horaEsperada: '07:00', margenMinutos: 30 },
    salida: { horaEsperada: '16:00', margenMinutos: 30 },
  });
});

test('parseCliArgs: permite sobreescribir horarios y márgenes de los checkpoints', () => {
  const options = parseCliArgs([
    '--host', '192.168.1.82',
    '--entrada-hora', '08:00',
    '--entrada-margen', '15',
    '--salida-hora', '17:30',
    '--salida-margen', '20',
  ]);
  assert.deepEqual(options.checkpoints, {
    entrada: { horaEsperada: '08:00', margenMinutos: 15 },
    salida: { horaEsperada: '17:30', margenMinutos: 20 },
  });
});

test('parseCliArgs: rechaza --entrada-margen no numérico', () => {
  assert.throws(
    () => parseCliArgs(['--host', '192.168.1.82', '--entrada-margen', 'abc']),
    InvalidArgsError
  );
});

test('parseCliArgs: rechaza --port no numérico', () => {
  assert.throws(() => parseCliArgs(['--host', '192.168.1.82', '--port', 'abc']), InvalidArgsError);
});

// ---- US3 / FR-013: selección del origen del padrón por configuración ----

test('parseCliArgs: --padron por defecto es "archivo" (comportamiento de la feature 002 sin cambios)', () => {
  const options = parseCliArgs(['--host', '192.168.1.82']);
  assert.equal(options.padron, 'archivo');
});

test('parseCliArgs: acepta --padron oracle', () => {
  const options = parseCliArgs(['--host', '192.168.1.82', '--padron', 'oracle']);
  assert.equal(options.padron, 'oracle');
});

test('parseCliArgs: rechaza un --padron desconocido', () => {
  assert.throws(
    () => parseCliArgs(['--host', '192.168.1.82', '--padron', 'postgres']),
    InvalidArgsError
  );
});

test('createRosterProvider: modo archivo devuelve el adapter local (FR-013, sin tocar env)', () => {
  const options = parseCliArgs(['--host', '192.168.1.82', '--padron', 'archivo']);
  const provider = createRosterProvider(options, { env: {} });
  assert.equal(typeof provider.getActiveEmployees, 'function');
});

test('createRosterProvider: modo oracle con env incompleto → fail-fast ConfiguracionPadronInvalidaError, sin exponer la password (FR-005)', () => {
  const options = parseCliArgs(['--host', '192.168.1.82', '--padron', 'oracle']);
  try {
    createRosterProvider(options, { env: { RRHH_ORACLE_PASSWORD: 'S3cr3tPassw0rd' } });
    assert.fail('debió fallar por configuración incompleta');
  } catch (err) {
    assert.ok(err instanceof ConfiguracionPadronInvalidaError);
    assert.match(err.message, /RRHH_ORACLE_USER/);
    assert.ok(!/S3cr3tPassw0rd/.test(err.message));
  }
});
