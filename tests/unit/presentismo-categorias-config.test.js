import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCategoriasConfig,
  serializarCategoriasConfig,
  agregarModalidad,
  editarModalidad,
  eliminarModalidad,
  agregarCategoria,
  editarCategoriaModalidad,
  editarEsquemaSemanal,
} from '../../src/presentismo/config/categorias-config.js';

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

// feature 014 (US3 T025) — escritura y edición.

const MODALIDAD_QUINCENAL = {
  tipo: 'Quincenal',
  aperturaOficial: '06:00',
  cierreOficial: '14:00',
  margenAperturaMin: 15,
  margenCierreMin: 15,
  ventanaApertura: ['05:00', '10:00'],
  ventanaCierre: ['10:00', '23:59'],
};

test('serializarCategoriasConfig produce el mismo formato que parsea', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const raw = serializarCategoriasConfig(cfg);
  const reparseado = parseCategoriasConfig(raw);
  assert.equal(reparseado.resolverModalidadPorCategoria('ADMIN').jornadaEsperada, 540);
  assert.deepEqual(raw.esquemaSemanal, ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
});

test('agregarModalidad agrega una modalidad nueva disponible para asignar', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const actualizado = agregarModalidad(cfg, 'quincenal_operarios', MODALIDAD_QUINCENAL);
  assert.ok(actualizado.modalidades.has('quincenal_operarios'));
  assert.equal(cfg.modalidades.has('quincenal_operarios'), false, 'el config original no se muta');
});

test('agregarModalidad rechaza un nombre ya existente', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  assert.throws(() => agregarModalidad(cfg, 'mensual', MODALIDAD_QUINCENAL), /ya existe una modalidad/);
});

test('editarModalidad cambia sus horarios', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const actualizado = editarModalidad(cfg, 'mensual', { ...MODALIDAD_QUINCENAL, tipo: 'Mensual' });
  assert.equal(actualizado.modalidades.get('mensual').aperturaOficial, 360);
});

test('eliminarModalidad la borra cuando ninguna categoría la usa', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const conNueva = agregarModalidad(cfg, 'quincenal_operarios', MODALIDAD_QUINCENAL);
  const actualizado = eliminarModalidad(conNueva, 'quincenal_operarios');
  assert.equal(actualizado.modalidades.has('quincenal_operarios'), false);
});

test('eliminarModalidad rechaza si alguna categoría la usa (FR-012)', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  try {
    eliminarModalidad(cfg, 'mensual');
    assert.fail('debía lanzar');
  } catch (err) {
    assert.deepEqual(err.categoriasEnUso, ['ADMIN']);
  }
});

test('agregarCategoria crea una categoría nueva asignada a una modalidad existente', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const actualizado = agregarCategoria(cfg, 'PROD', 'mensual');
  assert.equal(actualizado.resolverModalidadPorCategoria('PROD').tipo, 'Mensual');
});

test('agregarCategoria rechaza código duplicado o modalidad inexistente', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  assert.throws(() => agregarCategoria(cfg, 'ADMIN', 'mensual'), /ya existe una categoría/);
  assert.throws(() => agregarCategoria(cfg, 'PROD', 'fantasma'), /no existe/);
});

test('editarCategoriaModalidad reasigna la modalidad de una categoría existente', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const conNueva = agregarModalidad(cfg, 'quincenal_operarios', MODALIDAD_QUINCENAL);
  const actualizado = editarCategoriaModalidad(conNueva, 'ADMIN', 'quincenal_operarios');
  assert.equal(actualizado.resolverModalidadPorCategoria('ADMIN').tipo, 'Quincenal');
});

test('editarCategoriaModalidad rechaza categoría inexistente o modalidad inexistente', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  assert.throws(() => editarCategoriaModalidad(cfg, 'NOEXISTE', 'mensual'), /no existe una categoría/);
  assert.throws(() => editarCategoriaModalidad(cfg, 'ADMIN', 'fantasma'), /no existe/);
});

test('editarEsquemaSemanal reemplaza el esquema compartido', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  const actualizado = editarEsquemaSemanal(cfg, ['lunes', 'martes']);
  assert.equal([...actualizado.esquemaSemanal].sort().join(','), '1,2');
});

test('editarEsquemaSemanal rechaza vacío o con días repetidos', () => {
  const cfg = parseCategoriasConfig(baseConfig());
  assert.throws(() => editarEsquemaSemanal(cfg, []), /no puede quedar vacío/);
  assert.throws(() => editarEsquemaSemanal(cfg, ['lunes', 'lunes']), /no puede tener días repetidos/);
});
