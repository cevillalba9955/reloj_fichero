import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMotivosAusenciaConfig,
  serializarMotivosAusenciaConfig,
  agregarMotivo,
  editarMotivo,
  TipoPago,
} from '../../src/presentismo/config/motivos-ausencia-config.js';

const CONFIG_VALIDA = {
  motivos: [
    { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga' },
    { id: 'aviso_justificado', etiqueta: 'Aviso Justificado', tipoPago: 'No paga' },
    { id: 'enfermedad', etiqueta: 'Enfermedad', tipoPago: 'Paga' },
    { id: 'art', etiqueta: 'ART', tipoPago: 'Paga' },
    { id: 'nacimiento', etiqueta: 'Nacimiento', tipoPago: 'Paga' },
    { id: 'fallecimiento', etiqueta: 'Fallecimiento', tipoPago: 'Paga' },
    { id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga' },
    { id: 'matrimonio', etiqueta: 'Matrimonio', tipoPago: 'Paga' },
    { id: 'examen', etiqueta: 'Examen', tipoPago: 'Paga' },
  ],
};

test('carga el catálogo por defecto: 9 motivos, 2 No paga y 7 Paga', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  const activos = cfg.listarActivos();
  assert.equal(activos.length, 9);
  const noPaga = activos.filter((m) => m.tipoPago === TipoPago.NO_PAGA).map((m) => m.id).sort();
  assert.deepEqual(noPaga, ['aviso_justificado', 'sin_aviso']);
  assert.equal(activos.filter((m) => m.tipoPago === TipoPago.PAGA).length, 7);
});

test('resolverMotivoActivo devuelve el motivo o null si no existe', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  assert.equal(cfg.resolverMotivoActivo('vacaciones')?.etiqueta, 'Vacaciones');
  assert.equal(cfg.resolverMotivoActivo('inexistente'), null);
});

test('un motivo con activo:false no se ofrece para nuevas justificaciones', () => {
  const otros = CONFIG_VALIDA.motivos.filter((m) => m.id !== 'examen');
  const conInactivo = parseMotivosAusenciaConfig({
    motivos: [{ id: 'examen', etiqueta: 'Examen', tipoPago: 'Paga', activo: false }, ...otros],
  });
  assert.equal(conInactivo.listarActivos().find((m) => m.id === 'examen'), undefined);
  assert.equal(conInactivo.resolverMotivoActivo('examen'), null, 'inactivo: no se ofrece para nuevas justificaciones');
});

test('rechaza catálogo vacío', () => {
  assert.throws(() => parseMotivosAusenciaConfig({ motivos: [] }), /no vacío/);
});

test('rechaza id duplicado', () => {
  assert.throws(
    () =>
      parseMotivosAusenciaConfig({
        motivos: [
          { id: 'x', etiqueta: 'X', tipoPago: 'Paga' },
          { id: 'x', etiqueta: 'X2', tipoPago: 'No paga' },
        ],
      }),
    /duplicado/,
  );
});

test('rechaza tipoPago inválido', () => {
  assert.throws(
    () => parseMotivosAusenciaConfig({ motivos: [{ id: 'x', etiqueta: 'X', tipoPago: 'Gratis' }] }),
    /tipoPago/,
  );
});

test('feature 014: un catálogo sin ningún motivo activo ya NO es un error (research.md §3)', () => {
  const cfg = parseMotivosAusenciaConfig({
    motivos: [{ id: 'x', etiqueta: 'X', tipoPago: 'Paga', activo: false }],
  });
  assert.deepEqual(cfg.listarActivos(), []);
  assert.equal(cfg.resolverMotivoActivo('x'), null);
});

test('rechaza raíz inválida', () => {
  assert.throws(() => parseMotivosAusenciaConfig(null));
  assert.throws(() => parseMotivosAusenciaConfig({}));
});

// feature 014 (US2 T018) — serialización y edición del catálogo.

test('serializarMotivosAusenciaConfig produce el mismo formato que parsea', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  const raw = serializarMotivosAusenciaConfig(cfg);
  const reparseado = parseMotivosAusenciaConfig(raw);
  assert.equal(reparseado.listarActivos().length, cfg.listarActivos().length);
});

test('agregarMotivo agrega uno nuevo activo por defecto', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  const actualizado = agregarMotivo(cfg, { id: 'mudanza', etiqueta: 'Mudanza', tipoPago: 'No paga' });
  assert.equal(actualizado.resolverMotivoActivo('mudanza')?.etiqueta, 'Mudanza');
  // el catálogo original no se muta
  assert.equal(cfg.resolverMotivoActivo('mudanza'), null);
});

test('agregarMotivo rechaza un id ya existente', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  assert.throws(
    () => agregarMotivo(cfg, { id: 'vacaciones', etiqueta: 'Otra', tipoPago: 'Paga' }),
    /ya existe un motivo/,
  );
});

test('editarMotivo cambia etiqueta/tipoPago/activo sin alterar el id', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  const actualizado = editarMotivo(cfg, 'examen', { etiqueta: 'Examen final', tipoPago: 'No paga' });
  const motivo = actualizado.resolverMotivoActivo('examen');
  assert.equal(motivo.etiqueta, 'Examen final');
  assert.equal(motivo.tipoPago, 'No paga');
  assert.equal(motivo.id, 'examen');
});

test('editarMotivo con activo:false desactiva sin eliminar (FR-009)', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  const actualizado = editarMotivo(cfg, 'examen', { activo: false });
  assert.equal(actualizado.resolverMotivoActivo('examen'), null);
  assert.equal(actualizado.motivos.get('examen').etiqueta, 'Examen', 'sigue existiendo, solo inactivo');
});

test('editarMotivo rechaza un id inexistente', () => {
  const cfg = parseMotivosAusenciaConfig(CONFIG_VALIDA);
  assert.throws(() => editarMotivo(cfg, 'no_existe', { activo: false }), /no existe un motivo/);
});
