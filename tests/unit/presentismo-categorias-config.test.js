import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';

function baseConfig() {
  return {
    esquemaSemanal: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    modalidades: {
      mensual: {
        tipo: 'Mensual',
        aperturaOficial: '07:00',
        cierreOficial: '16:00',
        margenAperturaMin: 30,
        margenCierreMin: 30,
        ventanaApertura: ['05:00', '12:00'],
        ventanaCierre: ['12:00', '23:59'],
      },
    },
    categorias: { ADMIN: { modalidad: 'mensual' } },
  };
}

test('parseCategoriasConfig: parsea y deriva jornada esperada', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const mod = cfg.resolverModalidadPorCategoria('ADMIN');
  assert.equal(mod.aperturaOficial, 420);
  assert.equal(mod.cierreOficial, 960);
  assert.equal(mod.jornadaEsperada, 540, '9 h derivadas de 07:00–16:00');
  assert.deepEqual(mod.ventanaApertura, [300, 720]);
  assert.equal([...cfg.esquemaSemanal].sort().join(','), '1,2,3,4,5', 'lunes..viernes');
});

test('esquemaSemanal default cuando se omite', () => {
  const raw = baseConfig();
  delete raw.esquemaSemanal;
  const cfg = parseCategoriasConfig(raw);
  assert.equal([...cfg.esquemaSemanal].sort().join(','), '1,2,3,4,5');
});

test('categoría no configurada → resolverModalidad devuelve null (FR-035)', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  assert.equal(cfg.resolverModalidadPorCategoria('NOEXISTE'), null);
});

test('fail-fast: categoría referencia modalidad inexistente', () => {
  const raw = baseConfig();
  raw.categorias.ADMIN.modalidad = 'fantasma';
  assert.throws(() => parseCategoriasConfig(raw), /modalidad inexistente/);
});

test('fail-fast: apertura no anterior al cierre', () => {
  const raw = baseConfig();
  raw.modalidades.mensual.cierreOficial = '07:00';
  assert.throws(() => parseCategoriasConfig(raw), /anterior a cierreOficial/);
});

test('fail-fast: tipo de modalidad inválido', () => {
  const raw = baseConfig();
  raw.modalidades.mensual.tipo = 'Semanal';
  assert.throws(() => parseCategoriasConfig(raw), /Mensual o Quincenal/);
});

test('fail-fast: margen negativo', () => {
  const raw = baseConfig();
  raw.modalidades.mensual.margenAperturaMin = -5;
  assert.throws(() => parseCategoriasConfig(raw), /margenAperturaMin/);
});
