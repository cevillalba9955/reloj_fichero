import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRosterFetchLogger } from '../../src/logging/roster-fetch-logger.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-roster-log-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function leerLineas(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('roster-fetch-logger: escribe una línea NDJSON por evento con los campos de data-model §4', () => {
  withTempDir((dir) => {
    const fixedNow = () => new Date('2026-07-08T10:00:00.000Z');
    const logger = createRosterFetchLogger({ serviceId: 'svc-1', logDir: dir, now: fixedNow });

    logger.logEvento({ evento: 'padron_fresco', cantidadLegajos: 3, duracionMs: 42, obtenidoEn: '2026-07-08T10:00:00.000Z' });
    logger.logEvento({ evento: 'legajo_descartado', detail: 'duplicado' });

    const lineas = leerLineas(logger.logFilePath);
    assert.equal(lineas.length, 2);
    assert.deepEqual(lineas[0], {
      ts: '2026-07-08T10:00:00.000Z',
      serviceId: 'svc-1',
      evento: 'padron_fresco',
      cantidadLegajos: 3,
      duracionMs: 42,
      obtenidoEn: '2026-07-08T10:00:00.000Z',
      detail: null,
    });
    assert.equal(lineas[1].evento, 'legajo_descartado');
    assert.equal(lineas[1].detail, 'duplicado');
    assert.equal(lineas[1].cantidadLegajos, null);
  });
});

test('roster-fetch-logger: rechaza un evento desconocido', () => {
  withTempDir((dir) => {
    const logger = createRosterFetchLogger({ serviceId: 'svc-1', logDir: dir });
    assert.throws(() => logger.logEvento({ evento: 'no_existe' }), /evento/i);
  });
});

test('roster-fetch-logger: ninguna línea contiene la password ni el connect string (FR-010, Principio V)', () => {
  withTempDir((dir) => {
    const logger = createRosterFetchLogger({ serviceId: 'svc-1', logDir: dir });
    // Se registran eventos normales; el logger jamás recibe secretos, pero
    // verificamos que el archivo no los contenga bajo ninguna circunstancia.
    logger.logEvento({ evento: 'padron_fresco', cantidadLegajos: 2, duracionMs: 10, obtenidoEn: new Date().toISOString() });
    logger.logEvento({ evento: 'padron_error', detail: 'timeout' });
    logger.logEvento({ evento: 'padron_respaldo', cantidadLegajos: 2, obtenidoEn: new Date().toISOString() });

    const contenido = readFileSync(logger.logFilePath, 'utf8');
    assert.ok(!/S3cr3tPassw0rd/.test(contenido));
    assert.ok(!/1521\/RRHHPROD/.test(contenido));
  });
});

test('roster-fetch-logger: guarda defensivo que rechaza un detail con pinta de connect string (host:puerto/servicio)', () => {
  withTempDir((dir) => {
    const logger = createRosterFetchLogger({ serviceId: 'svc-1', logDir: dir });
    assert.throws(
      () => logger.logEvento({ evento: 'padron_error', detail: 'falló contra oracle.host:1521/RRHHPROD' }),
      /detail/i
    );
  });
});
