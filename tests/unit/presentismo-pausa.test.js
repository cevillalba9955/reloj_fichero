import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descuentoPausas } from '../../src/presentismo/domain/pausa.js';
import { calcularJornadaAuto, aplicarAjustes, EstadoJornada } from '../../src/presentismo/domain/jornada.js';
import { Clasificacion } from '../../src/presentismo/domain/calendario-mes.js';

const PARAMS = {
  aperturaOficial: 420,
  cierreOficial: 960,
  margenApertura: 30,
  margenCierre: 30,
  ventanaApertura: [300, 720],
  ventanaCierre: [720, 1439],
  jornadaEsperada: 540,
};

const completa = () =>
  calcularJornadaAuto({
    clasificacion: Clasificacion.LABORABLE,
    fichadas: [{ id: 'a', hora: 425 }, { id: 'b', hora: 958 }], // 07:05–15:58 → 9:00
    params: PARAMS,
  });

test('descuentoPausas: solape con el horario efectivo', () => {
  // horario efectivo 07:00–16:00 (420–960).
  const pausas = [{ desde: 720, hasta: 780, vigente: true }]; // 12:00–13:00
  assert.equal(descuentoPausas(pausas, 420, 960), 60);
});

test('pausa 12:00–13:00 descuenta 1 h del total (US3-6)', () => {
  const ajustada = aplicarAjustes(completa(), { pausas: [{ desde: 720, hasta: 780, vigente: true }] });
  assert.equal(ajustada.totalDiario, 480); // 8:00
  assert.equal(ajustada.descuentoPausas, 60);
});

test('varias pausas suman su descuento', () => {
  const ajustada = aplicarAjustes(completa(), {
    pausas: [
      { desde: 720, hasta: 780, vigente: true }, // 1 h
      { desde: 600, hasta: 630, vigente: true }, // 30 min (10:00–10:30)
    ],
  });
  assert.equal(ajustada.descuentoPausas, 90);
  assert.equal(ajustada.totalDiario, 450); // 7:30
});

test('pausa fuera del horario efectivo solo descuenta el solape', () => {
  // Pausa 06:00–07:30 (360–450): solo 07:00–07:30 = 30 min dentro de 420–960.
  const ajustada = aplicarAjustes(completa(), { pausas: [{ desde: 360, hasta: 450, vigente: true }] });
  assert.equal(ajustada.descuentoPausas, 30);
  assert.equal(ajustada.totalDiario, 510);
});

test('pausa mayor que lo trabajado → total acota a 0 (US3-8)', () => {
  // Jornada corta completa: 11:00 (entrada, ventana apertura) y 12:30 (salida,
  // ventana cierre) → efectivas 11:00–12:30 = 1:30 (90).
  const corta = calcularJornadaAuto({
    clasificacion: Clasificacion.LABORABLE,
    fichadas: [{ id: 'a', hora: 660 }, { id: 'b', hora: 750 }], // 11:00, 12:30
    params: PARAMS,
  });
  assert.equal(corta.estado, EstadoJornada.COMPLETA);
  assert.equal(corta.horasAuto, 90);
  const ajustada = aplicarAjustes(corta, { pausas: [{ desde: 660, hasta: 780, vigente: true }] }); // 2 h
  assert.equal(ajustada.totalDiario, 0);
});

test('pausa no aplica en Feriado (sin horario efectivo, FR-039)', () => {
  const feriado = calcularJornadaAuto({ clasificacion: Clasificacion.FERIADO, fichadas: [], params: PARAMS });
  const ajustada = aplicarAjustes(feriado, { pausas: [{ desde: 720, hasta: 780, vigente: true }] });
  assert.equal(ajustada.descuentoPausas, 0);
  assert.equal(ajustada.totalDiario, 540, 'crédito de feriado intacto');
});

test('pausa no vigente no descuenta', () => {
  const ajustada = aplicarAjustes(completa(), { pausas: [{ desde: 720, hasta: 780, vigente: false }] });
  assert.equal(ajustada.descuentoPausas, 0);
  assert.equal(ajustada.totalDiario, 540);
});
