import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMotivosAusenciaConfig, TipoPago } from '../../src/presentismo/config/motivos-ausencia-config.js';

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

test('rechaza catálogo sin ningún motivo activo', () => {
  assert.throws(
    () =>
      parseMotivosAusenciaConfig({
        motivos: [{ id: 'x', etiqueta: 'X', tipoPago: 'Paga', activo: false }],
      }),
    /al menos un motivo activo/,
  );
});

test('rechaza raíz inválida', () => {
  assert.throws(() => parseMotivosAusenciaConfig(null));
  assert.throws(() => parseMotivosAusenciaConfig({}));
});
