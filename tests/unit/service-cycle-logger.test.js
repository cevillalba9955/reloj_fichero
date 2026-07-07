import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServiceCycleLogger } from '../../src/logging/service-cycle-logger.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-cycle-log-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// T028/FR-015: auditoria de que el logger de ciclo del servicio nunca
// expone datos crudos ni credenciales (Constitucion, Principio V), con el
// mismo criterio ya validado para session-logger.js en
// 001-consulta-fichadas-rs596.
test('service-cycle-logger: escribe una linea NDJSON valida por ciclo y devuelve la forma de ultimoCiclo', () => {
  withTempDir((logDir) => {
    const fixedNow = () => new Date('2026-07-07T10:00:00.000Z');
    const logger = createServiceCycleLogger({ serviceId: 'svc-1', logDir, now: fixedNow });
    const ultimoCiclo = logger.logCiclo({ resultado: 'success', fichadasNuevas: 3, duracionMs: 42 });

    assert.deepEqual(ultimoCiclo, {
      ejecutadoEn: '2026-07-07T10:00:00.000Z',
      resultado: 'success',
      fichadasNuevas: 3,
      duracionMs: 42,
    });

    const lines = readFileSync(logger.logFilePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.serviceId, 'svc-1');
    assert.equal(entry.resultado, 'success');
  });
});

test('service-cycle-logger: rechaza un resultado fuera del enum success/error/omitido', () => {
  withTempDir((logDir) => {
    const logger = createServiceCycleLogger({ serviceId: 'svc-1', logDir });
    assert.throws(() => logger.logCiclo({ resultado: 'inventado' }), /resultado invalido/);
  });
});

test('service-cycle-logger: rechaza un "detail" que parezca bytes crudos de protocolo (Principio V)', () => {
  withTempDir((logDir) => {
    const logger = createServiceCycleLogger({ serviceId: 'svc-1', logDir });
    const rawHexLike = '01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 10 99 02 00 00';
    assert.throws(
      () => logger.logCiclo({ resultado: 'error', detail: rawHexLike }),
      /bytes crudos/
    );
  });
});

test('service-cycle-logger: el detail de un error de sesion RS956 real (mensajes de 001-consulta-fichadas-rs596) no dispara el chequeo de bytes crudos', () => {
  withTempDir((logDir) => {
    const logger = createServiceCycleLogger({ serviceId: 'svc-1', logDir });
    // Mensajes de error reales del cliente existente (src/protocol/client.js):
    // texto legible, no hex crudo — no deben rechazarse por error.
    assert.doesNotThrow(() =>
      logger.logCiclo({
        resultado: 'error',
        detail: 'No se pudo conectar a 192.168.1.82:5005: connect ECONNREFUSED',
      })
    );
    assert.doesNotThrow(() =>
      logger.logCiclo({
        resultado: 'error',
        detail: 'Discrepancia entre fichadas declaradas por 0xB4 (1) y datos recibidos en 0xA4',
      })
    );
  });
});
