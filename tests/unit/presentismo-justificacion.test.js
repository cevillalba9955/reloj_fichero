import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clasificarDiaParaJustificar,
  expandirRangoElegible,
  crearJustificacion,
  justificacionVigenteDe,
  RazonNoAplicable,
} from '../../src/presentismo/domain/justificacion.js';
import { Clasificacion } from '../../src/presentismo/domain/calendario-mes.js';
import { EstadoJornada } from '../../src/presentismo/domain/jornada.js';

const MOTIVO_VACACIONES = { id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga' };
const MOTIVO_SIN_AVISO = { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga' };

test('día Laborable pasado sin fichadas es elegible', () => {
  const r = clasificarDiaParaJustificar({
    fecha: '2026-07-10',
    clasificacion: Clasificacion.LABORABLE,
    estado: EstadoJornada.SIN_FICHADAS,
    esFuturo: false,
    yaJustificado: false,
  });
  assert.equal(r.elegible, true);
});

test('día Laborable futuro es elegible sin importar estado', () => {
  const r = clasificarDiaParaJustificar({
    fecha: '2026-08-10',
    clasificacion: Clasificacion.LABORABLE,
    estado: null,
    esFuturo: true,
    yaJustificado: false,
  });
  assert.equal(r.elegible, true);
});

test('día Laborable pasado con fichadas (Incompleta/Completa) no es elegible: CON_FICHADAS', () => {
  const r = clasificarDiaParaJustificar({
    fecha: '2026-07-10',
    clasificacion: Clasificacion.LABORABLE,
    estado: EstadoJornada.COMPLETA,
    esFuturo: false,
    yaJustificado: false,
  });
  assert.equal(r.elegible, false);
  assert.equal(r.razon, RazonNoAplicable.CON_FICHADAS);
});

test('día No Laborable o Feriado no es elegible: NO_LABORABLE', () => {
  for (const clasificacion of [Clasificacion.NO_LABORABLE, Clasificacion.FERIADO]) {
    const r = clasificarDiaParaJustificar({
      fecha: '2026-07-11',
      clasificacion,
      estado: null,
      esFuturo: false,
      yaJustificado: false,
    });
    assert.equal(r.elegible, false);
    assert.equal(r.razon, RazonNoAplicable.NO_LABORABLE);
  }
});

test('día ya justificado no es elegible: YA_JUSTIFICADO', () => {
  const r = clasificarDiaParaJustificar({
    fecha: '2026-07-10',
    clasificacion: Clasificacion.LABORABLE,
    estado: EstadoJornada.SIN_FICHADAS,
    esFuturo: false,
    yaJustificado: true,
  });
  assert.equal(r.elegible, false);
  assert.equal(r.razon, RazonNoAplicable.YA_JUSTIFICADO);
});

test('expandirRangoElegible separa elegibles, omitidas (silencioso) y no aplicables sin bloquear el resto', () => {
  const dias = [
    { fecha: '2026-08-03', clasificacion: Clasificacion.LABORABLE, estado: null, esFuturo: true, yaJustificado: false },
    { fecha: '2026-08-04', clasificacion: Clasificacion.LABORABLE, estado: null, esFuturo: true, yaJustificado: false },
    { fecha: '2026-08-01', clasificacion: Clasificacion.NO_LABORABLE, estado: null, esFuturo: true, yaJustificado: false },
    { fecha: '2026-08-02', clasificacion: Clasificacion.NO_LABORABLE, estado: null, esFuturo: true, yaJustificado: false },
    {
      fecha: '2026-07-31',
      clasificacion: Clasificacion.LABORABLE,
      estado: EstadoJornada.COMPLETA,
      esFuturo: false,
      yaJustificado: false,
    },
  ];
  const { elegibles, omitidas, noAplicables } = expandirRangoElegible(dias);
  assert.deepEqual(elegibles, ['2026-08-03', '2026-08-04']);
  assert.deepEqual(
    omitidas.map((o) => o.fecha),
    ['2026-08-01', '2026-08-02'],
  );
  assert.deepEqual(noAplicables, [{ fecha: '2026-07-31', razon: RazonNoAplicable.CON_FICHADAS }]);
});

test('crearJustificacion copia etiqueta y tipoPago del motivo resuelto, con auditoría', () => {
  const j = crearJustificacion({
    periodo: '202607',
    legajo: 1234,
    fecha: '2026-07-10',
    motivo: MOTIVO_VACACIONES,
    autor: 'rrhh.mgomez',
    fechaHora: '2026-07-20T14:00:00.000Z',
  });
  assert.equal(j.motivoId, 'vacaciones');
  assert.equal(j.etiquetaMotivo, 'Vacaciones');
  assert.equal(j.tipoPago, 'Paga');
  assert.equal(j.vigente, true);
  assert.equal(j.reversion, null);
  assert.equal(j.autor, 'rrhh.mgomez');
});

test('crearJustificacion rechaza un motivo inválido', () => {
  assert.throws(() =>
    crearJustificacion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', motivo: null, autor: 'x' }),
  );
});

test('justificacionVigenteDe encuentra solo la vigente del legajo/fecha', () => {
  const lista = [
    crearJustificacion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', motivo: MOTIVO_SIN_AVISO, autor: 'a' }),
    { ...crearJustificacion({ periodo: '202607', legajo: 1234, fecha: '2026-07-11', motivo: MOTIVO_VACACIONES, autor: 'a' }), vigente: false },
  ];
  assert.equal(justificacionVigenteDe(lista, 1234, '2026-07-10')?.motivoId, 'sin_aviso');
  assert.equal(justificacionVigenteDe(lista, 1234, '2026-07-11'), null, 'la revertida no cuenta como vigente');
  assert.equal(justificacionVigenteDe(lista, 1234, '2026-07-12'), null);
});
