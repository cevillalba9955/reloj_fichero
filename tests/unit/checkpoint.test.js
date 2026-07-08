import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Checkpoint } from '../../src/scheduling/checkpoint.js';

// research.md §2: los checkpoints se evalúan contra un "now" inyectado, sin
// depender del reloj de pared real, para tests deterministas.
function dateAt(hh, mm, ss = 0) {
  return new Date(2026, 6, 7, hh, mm, ss, 0);
}

test('Checkpoint: estado pendiente antes de que abra la ventana de aceptación', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const estado = cp.evaluar(dateAt(6, 20), false);
  assert.equal(estado, 'pendiente');
  assert.equal(cp.estaAbierto(), false);
});

test('Checkpoint: pasa a abierto al entrar en la ventana de aceptación (horaEsperada - margen)', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const estado = cp.evaluar(dateAt(6, 30), false);
  assert.equal(estado, 'abierto');
  assert.equal(cp.estaAbierto(), true);
});

test('Checkpoint: sigue abierto exactamente en la hora esperada', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  assert.equal(cp.evaluar(dateAt(7, 0), false), 'abierto');
});

test('Checkpoint: cierra por margen agotado (horaEsperada + margen) si el predicado de completitud sigue en false', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  cp.evaluar(dateAt(7, 0), false);
  const estadoFinal = cp.evaluar(dateAt(7, 31), false);
  assert.equal(estadoFinal, 'cerrado_margen_agotado');
});

test('Checkpoint: una vez cerrado por margen agotado no vuelve a abrirse', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  cp.evaluar(dateAt(7, 31), false);
  assert.equal(cp.estado, 'cerrado_margen_agotado');
  const estado = cp.evaluar(dateAt(7, 35), false);
  assert.equal(estado, 'cerrado_margen_agotado');
  assert.equal(cp.estaAbierto(), false);
});

test('Checkpoint: contieneHora determina si una hora decodificada cae en la ventana de aceptación', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  assert.equal(cp.contieneHora('07:15:00'), true);
  assert.equal(cp.contieneHora('06:29:59'), false);
  assert.equal(cp.contieneHora('07:30:00'), true);
  assert.equal(cp.contieneHora('07:31:00'), false);
  assert.equal(cp.contieneHora(null), false);
});
