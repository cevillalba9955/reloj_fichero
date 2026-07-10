import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirResumen } from '../../src/presentismo/domain/resumen-presentismo.js';
import { Clasificacion } from '../../src/presentismo/domain/calendario-mes.js';
import { EstadoJornada } from '../../src/presentismo/domain/jornada.js';

const PARAMS = {
  aperturaOficial: 420,
  cierreOficial: 960,
  margenApertura: 30,
  margenCierre: 30,
  jornadaEsperada: 540,
};

function dia(fecha, clasificacion) {
  return { fecha, clasificacion };
}

test('horas esperadas suman Laborable + Feriado, no No Laborable (FR-020)', () => {
  const jornadas = [
    { dia: dia('2026-07-01', Clasificacion.LABORABLE), resultado: { estado: EstadoJornada.COMPLETA, totalDiario: 540 } },
    { dia: dia('2026-07-04', Clasificacion.NO_LABORABLE), resultado: { estado: EstadoJornada.NO_APLICA, totalDiario: 0 } },
    { dia: dia('2026-07-09', Clasificacion.FERIADO), resultado: { estado: EstadoJornada.FERIADO_CUMPLIDO, totalDiario: 540 } },
  ];
  const r = construirResumen({ legajo: 1234, periodo: '202607', tramo: 'Mes', modalidadTipo: 'Mensual', params: PARAMS, jornadas });
  assert.equal(r.horasEsperadas, 1080, 'laborable + feriado');
  assert.equal(r.horasTrabajadas, 1080);
  assert.equal(r.saldo, 0);
  assert.equal(r.conteos.laborables, 1);
  assert.equal(r.conteos.completas, 1);
});

test('conteos de incompletas y sin fichadas; saldo negativo', () => {
  const jornadas = [
    { dia: dia('2026-07-01', Clasificacion.LABORABLE), resultado: { estado: EstadoJornada.INCOMPLETA, totalDiario: 0 } },
    { dia: dia('2026-07-02', Clasificacion.LABORABLE), resultado: { estado: EstadoJornada.SIN_FICHADAS, totalDiario: 0 } },
  ];
  const r = construirResumen({ legajo: 1, periodo: '202607', tramo: 'Mes', modalidadTipo: 'Mensual', params: PARAMS, jornadas });
  assert.equal(r.horasEsperadas, 1080);
  assert.equal(r.horasTrabajadas, 0);
  assert.equal(r.saldo, -1080);
  assert.equal(r.conteos.incompletas, 1);
  assert.equal(r.conteos.sinFichadas, 1);
});

test('fichadas en No Laborable se reportan fuera de calendario (FR-018)', () => {
  const jornadas = [
    { dia: dia('2026-07-04', Clasificacion.NO_LABORABLE), resultado: { estado: EstadoJornada.NO_APLICA, totalDiario: 0, fichadasNoUsadas: ['a', 'b'] } },
  ];
  const r = construirResumen({ legajo: 1, periodo: '202607', tramo: 'Mes', modalidadTipo: 'Mensual', params: PARAMS, jornadas });
  assert.equal(r.horasTrabajadas, 0);
  assert.equal(r.fichadasFueraDeCalendario.length, 1);
  assert.deepEqual(r.fichadasFueraDeCalendario[0].fichadas, ['a', 'b']);
});

test('desglose auto vs corregidas y descuento de pausas', () => {
  const jornadas = [
    { dia: dia('2026-07-01', Clasificacion.LABORABLE), resultado: { estado: EstadoJornada.COMPLETA, totalDiario: 540, correccionVigente: true } },
    { dia: dia('2026-07-02', Clasificacion.LABORABLE), resultado: { estado: EstadoJornada.COMPLETA, totalDiario: 480, descuentoPausas: 60 } },
  ];
  const r = construirResumen({ legajo: 1, periodo: '202607', tramo: 'Mes', modalidadTipo: 'Mensual', params: PARAMS, jornadas });
  assert.equal(r.horasCorregidas, 540);
  assert.equal(r.horasAuto, 480);
  assert.equal(r.descuentoPausas, 60);
  assert.equal(r.horasTrabajadas, 1020);
});
