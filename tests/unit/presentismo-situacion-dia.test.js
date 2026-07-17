import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSituacionHoy, SituacionDia } from '../../src/presentismo/domain/situacion-dia.js';
import { calcularJornadaAuto, aplicarAjustes } from '../../src/presentismo/domain/jornada.js';
import { Clasificacion } from '../../src/presentismo/domain/calendario-mes.js';

// T002 (feature 010) — Fixtures de calibración de la situación del día en
// curso, derivados uno a uno de los Acceptance Scenarios de la Historia 1 del
// spec (más los edge cases de Feriado/No Laborable/anomalía). Función pura:
// misma jornada + misma hora → misma situación.

// Parámetros mensuales por defecto: 07:00–16:00, margen 30/30, ventana de
// entrada 05:00–12:00 — mismos que el resto de los tests de 004.
const PARAMS = {
  aperturaOficial: 420,
  cierreOficial: 960,
  margenApertura: 30,
  margenCierre: 30,
  ventanaApertura: [300, 720],
  ventanaCierre: [720, 1439],
  jornadaEsperada: 540,
};

let seq = 0;
const f = (hora) => ({ id: `f${seq++}`, hora });

// Helper: arma auto + ajustado para una jornada Laborable y calcula la situación.
function situacion({ clasificacion = Clasificacion.LABORABLE, horas = [], ahora, correccion = null, pausas = [] }) {
  const auto = calcularJornadaAuto({ clasificacion, fichadas: horas.map(f), params: PARAMS });
  const ajustado = aplicarAjustes(auto, { correccion, pausas, params: PARAMS });
  return calcularSituacionHoy({ clasificacion, auto, ajustado, ahora, params: PARAMS });
}

test('Escenario 1: entrada dentro de margen, sin salida → PRESENTE', () => {
  // 07:05, ahora 10:00.
  assert.equal(situacion({ horas: [425], ahora: 600 }), SituacionDia.PRESENTE);
});

test('Escenario 2: sin entrada y ventana de entrada abierta → ESPERANDO', () => {
  // Sin fichadas, ahora 06:40 (la ventana de entrada cierra a las 12:00).
  assert.equal(situacion({ horas: [], ahora: 400 }), SituacionDia.ESPERANDO);
});

test('Escenario 3: entrada fuera del margen de tolerancia → TARDE', () => {
  // 08:10 (> 07:30), ahora 10:00.
  assert.equal(situacion({ horas: [490], ahora: 600 }), SituacionDia.TARDE);
});

test('Escenario 3b: TARDE prevalece aunque después fiche la salida', () => {
  // Entrada 08:10 + salida 15:58: la jornada cerró, pero llegó tarde.
  assert.equal(situacion({ horas: [490, 958], ahora: 1000 }), SituacionDia.TARDE);
});

test('Escenario 4: sin entrada y ventana de entrada vencida → AUSENTE', () => {
  // Sin fichadas, ahora 12:10 (> fin de ventana de entrada 12:00).
  assert.equal(situacion({ horas: [], ahora: 730 }), SituacionDia.AUSENTE);
});

test('Escenario 4b: el límite de la ventana es inclusivo → a las 12:00 sigue ESPERANDO', () => {
  assert.equal(situacion({ horas: [], ahora: 720 }), SituacionDia.ESPERANDO);
});

test('Escenario 5: entrada y salida dentro de márgenes → Completa', () => {
  // 07:05 y 15:58, ahora 16:30.
  assert.equal(situacion({ horas: [425, 958], ahora: 990 }), SituacionDia.COMPLETA);
});

test('Feriado → Feriado cumplido (no se penaliza, edge case del spec)', () => {
  assert.equal(
    situacion({ clasificacion: Clasificacion.FERIADO, horas: [], ahora: 730 }),
    SituacionDia.FERIADO_CUMPLIDO,
  );
});

test('No Laborable → No aplica (nunca AUSENTE, FR-013)', () => {
  assert.equal(
    situacion({ clasificacion: Clasificacion.NO_LABORABLE, horas: [], ahora: 730 }),
    SituacionDia.NO_APLICA,
  );
});

test('el catálogo incluye ANOMALIA para legajos sin categoría (FR-014)', () => {
  assert.equal(SituacionDia.ANOMALIA, 'ANOMALIA');
});

test('determinismo: misma jornada y misma hora → misma situación', () => {
  const a = situacion({ horas: [425], ahora: 600 });
  const b = situacion({ horas: [425], ahora: 600 });
  assert.equal(a, b);
});

// T029 (US3): retiro anticipado.

test('una pausa vigente tipo retiro_anticipado → RETIRO_ANTICIPADO (prevalece sobre PRESENTE/Completa)', () => {
  const pausa = { desde: 870, hasta: 960, vigente: true, tipo: 'retiro_anticipado', motivo: 'turno médico' };
  // Con entrada y salida (jornada cerrada) igual se distingue el retiro.
  assert.equal(
    situacion({ horas: [425, 958], ahora: 990, pausas: [pausa] }),
    SituacionDia.RETIRO_ANTICIPADO,
  );
  // Con solo entrada (todavía "presente") también.
  assert.equal(
    situacion({ horas: [425], ahora: 900, pausas: [pausa] }),
    SituacionDia.RETIRO_ANTICIPADO,
  );
});

test('una pausa intermedia NO cambia la situación', () => {
  const pausa = { desde: 720, hasta: 780, vigente: true, tipo: 'intermedia', motivo: 'corte' };
  assert.equal(situacion({ horas: [425], ahora: 900, pausas: [pausa] }), SituacionDia.PRESENTE);
});

test('un retiro anticipado revertido (vigente: false) no cambia la situación', () => {
  const pausa = { desde: 870, hasta: 960, vigente: false, tipo: 'retiro_anticipado', motivo: 'x' };
  assert.equal(situacion({ horas: [425], ahora: 900, pausas: [pausa] }), SituacionDia.PRESENTE);
});

test('una corrección de entrada vigente prevalece para la situación (FR-009)', () => {
  // Sin fichada de entrada, pero con entrada corregida a 07:10: no es AUSENTE.
  const correccion = {
    periodo: '202607', legajo: 1, fecha: '2026-07-16',
    valorCalculado: 0, valorCorregido: null,
    entradaCorregida: 430, salidaCorregida: null,
    camposCorregidos: ['entrada'], motivo: 'fichada perdida', vigente: true,
  };
  assert.equal(situacion({ horas: [], ahora: 730, correccion }), SituacionDia.PRESENTE);
});
