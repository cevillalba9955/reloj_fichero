import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularJornadaAuto, EstadoJornada } from '../../src/presentismo/domain/jornada.js';
import { Clasificacion } from '../../src/presentismo/domain/calendario-mes.js';

// Parámetros mensuales por defecto: 07:00–16:00, margen 30/30, jornada 540.
const PARAMS = {
  aperturaOficial: 420,
  cierreOficial: 960,
  margenApertura: 30,
  margenCierre: 30,
  ventanaApertura: [300, 720],
  ventanaCierre: [720, 1439],
  jornadaEsperada: 540,
};

// Helper: fichada a partir de minutos.
let seq = 0;
const f = (hora) => ({ id: `f${seq++}`, hora });

function calc(clasificacion, horas) {
  return calcularJornadaAuto({ clasificacion, fichadas: horas.map(f), params: PARAMS });
}

test('US2-1 completa dentro de margen → 9:00', () => {
  const r = calc(Clasificacion.LABORABLE, [425, 958]); // 07:05, 15:58
  assert.equal(r.estado, EstadoJornada.COMPLETA);
  assert.equal(r.entradaEfectiva, 420);
  assert.equal(r.salidaEfectiva, 960);
  assert.equal(r.horasAuto, 540);
});

test('US2-2 llegada temprana / salida tardía sin extras → 9:00', () => {
  const r = calc(Clasificacion.LABORABLE, [400, 985]); // 06:40, 16:25
  assert.equal(r.horasAuto, 540);
});

test('US2-3 entrada fuera de margen → parcial 7:50', () => {
  const r = calc(Clasificacion.LABORABLE, [490, 965]); // 08:10, 16:05
  assert.equal(r.entradaEfectiva, 490);
  assert.equal(r.salidaEfectiva, 960);
  assert.equal(r.horasAuto, 470); // 7:50
});

test('US2-4 salida fuera de margen → parcial 7:00', () => {
  const r = calc(Clasificacion.LABORABLE, [435, 840]); // 07:15, 14:00
  assert.equal(r.entradaEfectiva, 420);
  assert.equal(r.salidaEfectiva, 840);
  assert.equal(r.horasAuto, 420); // 7:00
});

test('US2-5 fichada intermedia ignorada → 6:15', () => {
  const r = calc(Clasificacion.LABORABLE, [510, 660, 885]); // 08:30, 11:00, 14:45
  assert.equal(r.estado, EstadoJornada.COMPLETA);
  assert.equal(r.entrada.hora, 510);
  assert.equal(r.salida.hora, 885);
  assert.equal(r.horasAuto, 375); // 6:15
  assert.equal(r.fichadasNoUsadas.length, 1, 'la de 11:00 no se usa');
});

test('US2-6 sin fichadas → 0 y Sin fichadas', () => {
  const r = calc(Clasificacion.LABORABLE, []);
  assert.equal(r.estado, EstadoJornada.SIN_FICHADAS);
  assert.equal(r.horasAuto, 0);
});

test('US2-7 feriado sin fichadas → crédito 9:00 Feriado cumplido', () => {
  const r = calc(Clasificacion.FERIADO, []);
  assert.equal(r.estado, EstadoJornada.FERIADO_CUMPLIDO);
  assert.equal(r.totalDiario, 540);
});

test('US2-8 No Laborable con fichadas → No aplica, 0', () => {
  const r = calc(Clasificacion.NO_LABORABLE, [540, 780]);
  assert.equal(r.estado, EstadoJornada.NO_APLICA);
  assert.equal(r.totalDiario, 0);
});

test('incompleta: solo entrada 07:02 → 0 + sugerencia 9:00 (FR-015/US3-1)', () => {
  const r = calc(Clasificacion.LABORABLE, [422]); // 07:02
  assert.equal(r.estado, EstadoJornada.INCOMPLETA);
  assert.equal(r.horasAuto, 0);
  assert.equal(r.sugerencia, 540);
  assert.equal(r.motivo, 'sin salida');
});

test('incompleta: solo salida 15:00 → sugerencia 8:00', () => {
  const r = calc(Clasificacion.LABORABLE, [900]); // 15:00, en ventana de cierre
  assert.equal(r.estado, EstadoJornada.INCOMPLETA);
  assert.equal(r.salidaEfectiva, 900);
  assert.equal(r.sugerencia, 480); // 15:00 - 07:00 = 8:00
  assert.equal(r.motivo, 'sin entrada');
});

test('borde: única fichada en el solape 12:00 no puede ser entrada y salida', () => {
  const r = calc(Clasificacion.LABORABLE, [720]); // 12:00 en ambas ventanas
  assert.equal(r.estado, EstadoJornada.INCOMPLETA, 'no cierra con una sola');
});

test('límites inclusivos: entrada 07:30 justo en el margen → efectiva 07:00', () => {
  const r = calc(Clasificacion.LABORABLE, [450, 958]); // 07:30, 15:58
  assert.equal(r.entradaEfectiva, 420);
});

test('salida no posterior a entrada → no hay salida válida (Incompleta)', () => {
  // dos fichadas ambas en ventana de apertura, ninguna en cierre.
  const r = calc(Clasificacion.LABORABLE, [500, 600]); // 08:20, 10:00
  assert.equal(r.estado, EstadoJornada.INCOMPLETA);
});

// ---- Detalle de la jornada (US4, FR-021) ----

test('US4 detalle: entrada/salida elegidas y fichada intermedia no usada', () => {
  seq = 0;
  const fichadas = [510, 660, 885].map(f); // 08:30, 11:00, 14:45
  const r = calcularJornadaAuto({ clasificacion: Clasificacion.LABORABLE, fichadas, params: PARAMS });
  assert.equal(r.entrada.id, 'f0', '08:30 como entrada');
  assert.equal(r.salida.id, 'f2', '14:45 como salida');
  assert.deepEqual(r.fichadasNoUsadas, ['f1'], '11:00 no utilizada');
});

test('US4 detalle: hora real vs hora efectiva por tolerancia', () => {
  const r = calc(Clasificacion.LABORABLE, [440, 958]); // entrada 07:20 → efectiva 07:00
  assert.equal(r.entrada.hora, 440, 'hora real fichada');
  assert.equal(r.entradaEfectiva, 420, 'hora efectiva normalizada');
});

test('US4 detalle: motivo de incompletitud disponible', () => {
  const r = calc(Clasificacion.LABORABLE, [422]); // solo entrada
  assert.equal(r.estado, EstadoJornada.INCOMPLETA);
  assert.equal(r.motivo, 'sin salida');
});
