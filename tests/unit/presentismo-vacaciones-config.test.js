import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVacacionesConfig,
  serializarVacacionesConfig,
  editarIncrementoAnual,
  editarEscalaAntiguedad,
} from '../../src/presentismo/config/vacaciones-config.js';

const CONFIG_VALIDA = {
  incrementoAnual: { mes: 11, dia: 1 },
  escalaAntiguedad: [
    { aniosMinimos: 0, dias: 14 },
    { aniosMinimos: 5, dias: 21 },
    { aniosMinimos: 10, dias: 28 },
    { aniosMinimos: 20, dias: 35 },
  ],
};

test('carga la config LCT por defecto: 4 tramos, incremento 1/11', () => {
  const cfg = parseVacacionesConfig(CONFIG_VALIDA);
  assert.equal(cfg.incrementoAnual.mes, 11);
  assert.equal(cfg.incrementoAnual.dia, 1);
  assert.equal(cfg.escalaAntiguedad.length, 4);
});

test('rechaza raíz inválida', () => {
  assert.throws(() => parseVacacionesConfig(null));
  assert.throws(() => parseVacacionesConfig({}));
});

test('rechaza escalaAntiguedad vacía', () => {
  assert.throws(
    () => parseVacacionesConfig({ ...CONFIG_VALIDA, escalaAntiguedad: [] }),
    /escalaAntiguedad/,
  );
});

test('rechaza escalaAntiguedad sin el tramo aniosMinimos: 0', () => {
  assert.throws(
    () =>
      parseVacacionesConfig({
        ...CONFIG_VALIDA,
        escalaAntiguedad: [
          { aniosMinimos: 5, dias: 21 },
          { aniosMinimos: 10, dias: 28 },
        ],
      }),
    /primer tramo/,
  );
});

test('rechaza escalaAntiguedad no estrictamente creciente', () => {
  assert.throws(
    () =>
      parseVacacionesConfig({
        ...CONFIG_VALIDA,
        escalaAntiguedad: [
          { aniosMinimos: 0, dias: 14 },
          { aniosMinimos: 5, dias: 21 },
          { aniosMinimos: 5, dias: 28 },
        ],
      }),
    /creciente/,
  );
});

test('rechaza dias <= 0 en un tramo', () => {
  assert.throws(
    () =>
      parseVacacionesConfig({
        ...CONFIG_VALIDA,
        escalaAntiguedad: [{ aniosMinimos: 0, dias: 0 }],
      }),
    /dias/,
  );
});

test('rechaza incrementoAnual.mes fuera de 1..12', () => {
  assert.throws(
    () => parseVacacionesConfig({ ...CONFIG_VALIDA, incrementoAnual: { mes: 13, dia: 1 } }),
    /mes/,
  );
  assert.throws(
    () => parseVacacionesConfig({ ...CONFIG_VALIDA, incrementoAnual: { mes: 0, dia: 1 } }),
    /mes/,
  );
});

test('rechaza incrementoAnual.dia inválido para ese mes', () => {
  assert.throws(
    () => parseVacacionesConfig({ ...CONFIG_VALIDA, incrementoAnual: { mes: 2, dia: 30 } }),
    /dia/,
  );
  assert.throws(
    () => parseVacacionesConfig({ ...CONFIG_VALIDA, incrementoAnual: { mes: 4, dia: 31 } }),
    /dia/,
  );
});

test('acepta incrementoAnual.dia 29 en febrero (se re-evalúa cada año)', () => {
  const cfg = parseVacacionesConfig({ ...CONFIG_VALIDA, incrementoAnual: { mes: 2, dia: 29 } });
  assert.equal(cfg.incrementoAnual.dia, 29);
});

test('serializarVacacionesConfig produce el mismo formato que parsea', () => {
  const cfg = parseVacacionesConfig(CONFIG_VALIDA);
  const raw = serializarVacacionesConfig(cfg);
  const reparseado = parseVacacionesConfig(raw);
  assert.deepEqual(raw, CONFIG_VALIDA);
  assert.equal(reparseado.escalaAntiguedad.length, cfg.escalaAntiguedad.length);
});

test('editarIncrementoAnual re-valida antes de aceptar el cambio', () => {
  const cfg = parseVacacionesConfig(CONFIG_VALIDA);
  const actualizado = editarIncrementoAnual(cfg, { mes: 12, dia: 15 });
  assert.equal(actualizado.incrementoAnual.mes, 12);
  assert.equal(actualizado.incrementoAnual.dia, 15);
  // no muta el original
  assert.equal(cfg.incrementoAnual.mes, 11);
  assert.throws(() => editarIncrementoAnual(cfg, { mes: 13, dia: 1 }), /mes/);
});

test('editarEscalaAntiguedad reemplaza la escala completa y re-valida', () => {
  const cfg = parseVacacionesConfig(CONFIG_VALIDA);
  const actualizado = editarEscalaAntiguedad(cfg, [{ aniosMinimos: 0, dias: 15 }]);
  assert.equal(actualizado.escalaAntiguedad.length, 1);
  assert.equal(actualizado.escalaAntiguedad[0].dias, 15);
  assert.throws(
    () => editarEscalaAntiguedad(cfg, [{ aniosMinimos: 5, dias: 21 }]),
    /primer tramo/,
  );
});

test('carga desde archivo (loadVacacionesConfig) rechaza ausencia/JSON inválido', async () => {
  const { loadVacacionesConfig } = await import('../../src/presentismo/config/vacaciones-config.js');
  assert.throws(() => loadVacacionesConfig('./no-existe-vacaciones.json'), /no se pudo leer/);
});
