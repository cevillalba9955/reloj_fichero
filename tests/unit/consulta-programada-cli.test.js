import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, InvalidArgsError, createRosterProvider } from '../../src/cli/consulta-programada.js';
import { ConfiguracionPadronInvalidaError } from '../../src/db/oracle-roster-config.js';

// Los tests pasan `env` explícito (normalmente `{}`) para ser herméticos: la
// resolución CLI > FICHADAS_* > default no debe depender del entorno real.

test('parseCliArgs: exige host (ni --host ni FICHADAS_HOST)', () => {
  assert.throws(() => parseCliArgs([], {}), InvalidArgsError);
});

test('parseCliArgs: aplica los defaults de FR-002 y del adapter placeholder del padrón', () => {
  const options = parseCliArgs(['--host', '192.168.1.82'], {});
  assert.equal(options.host, '192.168.1.82');
  assert.equal(options.port, 5005);
  assert.equal(options.padron, 'archivo');
  assert.equal(options.rosterConfigPath, './config/active-employees.json');
  assert.equal(options.logDir, './logs');
  assert.equal(options.timeoutMs, 5000);
  assert.equal(options.tickIntervalMs, 5 * 60 * 1000);
  assert.equal(options.statusIntervalMs, 60 * 1000);
  assert.equal(options.fullHandshake, false);
  assert.deepEqual(options.checkpoints, {
    entrada: { horaEsperada: '07:00', duracionMinutos: 30 },
  });
});

test('parseCliArgs: permite sobreescribir la hora y la duración de la ventana de entrada por CLI', () => {
  const options = parseCliArgs([
    '--host', '192.168.1.82',
    '--entrada-hora', '08:00',
    '--entrada-duracion', '15',
  ], {});
  assert.deepEqual(options.checkpoints, {
    entrada: { horaEsperada: '08:00', duracionMinutos: 15 },
  });
});

test('parseCliArgs: rechaza --entrada-duracion no numérico', () => {
  assert.throws(
    () => parseCliArgs(['--host', '192.168.1.82', '--entrada-duracion', 'abc'], {}),
    InvalidArgsError
  );
});

test('parseCliArgs: rechaza --port no numérico', () => {
  assert.throws(() => parseCliArgs(['--host', '192.168.1.82', '--port', 'abc'], {}), InvalidArgsError);
});

// ---- Configuración por variables de entorno FICHADAS_* (spec 002) ----

test('parseCliArgs: toma host y parámetros desde FICHADAS_* cuando no se pasan por CLI', () => {
  const env = {
    FICHADAS_HOST: '10.0.0.5',
    FICHADAS_PORT: '6000',
    FICHADAS_TIMEOUT_MS: '8000',
    FICHADAS_TICK_INTERVAL_MS: '120000',
    FICHADAS_STATUS_INTERVAL_MS: '30000',
    FICHADAS_ENTRADA_HORA: '06:30',
    FICHADAS_ENTRADA_DURACION: '10',
    FICHADAS_LOG_DIR: './otros-logs',
    FICHADAS_ROSTER_CONFIG: './config/otro.json',
  };
  const options = parseCliArgs([], env);
  assert.equal(options.host, '10.0.0.5');
  assert.equal(options.port, 6000);
  assert.equal(options.timeoutMs, 8000);
  assert.equal(options.tickIntervalMs, 120000);
  assert.equal(options.statusIntervalMs, 30000);
  assert.equal(options.logDir, './otros-logs');
  assert.equal(options.rosterConfigPath, './config/otro.json');
  assert.deepEqual(options.checkpoints, {
    entrada: { horaEsperada: '06:30', duracionMinutos: 10 },
  });
});

test('parseCliArgs: el argumento CLI tiene precedencia sobre FICHADAS_*', () => {
  const env = { FICHADAS_HOST: '10.0.0.5', FICHADAS_PORT: '6000', FICHADAS_ENTRADA_HORA: '06:30' };
  const options = parseCliArgs(['--host', '192.168.1.82', '--port', '7000', '--entrada-hora', '09:00'], env);
  assert.equal(options.host, '192.168.1.82', 'la IP del CLI gana');
  assert.equal(options.port, 7000, 'el puerto del CLI gana');
  assert.equal(options.checkpoints.entrada.horaEsperada, '09:00', 'la hora del CLI gana');
});

test('parseCliArgs: FICHADAS_HOST satisface el requerido sin --host', () => {
  const options = parseCliArgs([], { FICHADAS_HOST: '10.0.0.9' });
  assert.equal(options.host, '10.0.0.9');
});

test('parseCliArgs: una variable FICHADAS_* vacía cae al default (no cuenta como provista)', () => {
  const options = parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_PORT: '' });
  assert.equal(options.port, 5005);
});

test('parseCliArgs: rechaza FICHADAS_TICK_INTERVAL_MS no numérico', () => {
  assert.throws(
    () => parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_TICK_INTERVAL_MS: 'xx' }),
    InvalidArgsError
  );
});

test('parseCliArgs: rechaza FICHADAS_PORT <= 0', () => {
  assert.throws(
    () => parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_PORT: '0' }),
    InvalidArgsError
  );
});

test('parseCliArgs: FICHADAS_FULL_HANDSHAKE=true activa el handshake completo', () => {
  assert.equal(parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_FULL_HANDSHAKE: 'true' }).fullHandshake, true);
  assert.equal(parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_FULL_HANDSHAKE: '1' }).fullHandshake, true);
  assert.equal(parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_FULL_HANDSHAKE: 'false' }).fullHandshake, false);
  assert.equal(parseCliArgs(['--host', '1.2.3.4'], {}).fullHandshake, false);
});

test('parseCliArgs: --tick-interval-ms por CLI se expone y valida', () => {
  const options = parseCliArgs(['--host', '1.2.3.4', '--tick-interval-ms', '90000'], {});
  assert.equal(options.tickIntervalMs, 90000);
  assert.throws(() => parseCliArgs(['--host', '1.2.3.4', '--tick-interval-ms', '-5'], {}), InvalidArgsError);
});

// ---- US3 / FR-013: selección del origen del padrón por configuración ----

test('parseCliArgs: --padron por defecto es "archivo"', () => {
  assert.equal(parseCliArgs(['--host', '192.168.1.82'], {}).padron, 'archivo');
});

test('parseCliArgs: acepta --padron oracle y FICHADAS_PADRON=oracle', () => {
  assert.equal(parseCliArgs(['--host', '1.2.3.4', '--padron', 'oracle'], {}).padron, 'oracle');
  assert.equal(parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_PADRON: 'oracle' }).padron, 'oracle');
});

test('parseCliArgs: rechaza un padron desconocido (CLI o env)', () => {
  assert.throws(() => parseCliArgs(['--host', '1.2.3.4', '--padron', 'postgres'], {}), InvalidArgsError);
  assert.throws(() => parseCliArgs(['--host', '1.2.3.4'], { FICHADAS_PADRON: 'mysql' }), InvalidArgsError);
});

test('createRosterProvider: modo archivo devuelve el adapter local (FR-013)', () => {
  const options = parseCliArgs(['--host', '192.168.1.82', '--padron', 'archivo'], {});
  const provider = createRosterProvider(options, { env: {} });
  assert.equal(typeof provider.getActiveEmployees, 'function');
});

test('createRosterProvider: modo oracle con env incompleto → fail-fast sin exponer la password (FR-005)', () => {
  const options = parseCliArgs(['--host', '192.168.1.82', '--padron', 'oracle'], {});
  try {
    createRosterProvider(options, { env: { RRHH_ORACLE_PASSWORD: 'S3cr3tPassw0rd' } });
    assert.fail('debió fallar por configuración incompleta');
  } catch (err) {
    assert.ok(err instanceof ConfiguracionPadronInvalidaError);
    assert.match(err.message, /RRHH_ORACLE_USER/);
    assert.ok(!/S3cr3tPassw0rd/.test(err.message));
  }
});
