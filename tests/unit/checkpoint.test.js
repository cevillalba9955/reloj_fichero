import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Checkpoint } from '../../src/scheduling/checkpoint.js';

// research.md §2: los checkpoints se evalúan contra un "now" inyectado, sin
// depender del reloj de pared real, para tests deterministas.
// Clarifications 2026-07-14: ventana de un solo lado
// [horaEsperada, horaEsperada + duracionMinutos] (07:00 -> 07:30).
function dateAt(hh, mm, ss = 0) {
  return new Date(2026, 6, 7, hh, mm, ss, 0);
}

test('Checkpoint: estado pendiente antes de que abra la ventana (antes de horaEsperada)', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const estado = cp.evaluar(dateAt(6, 59), false);
  assert.equal(estado, 'pendiente');
  assert.equal(cp.estaAbierto(), false);
});

test('Checkpoint: pasa a abierto exactamente al llegar la horaEsperada (inicio de la ventana)', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const estado = cp.evaluar(dateAt(7, 0), false);
  assert.equal(estado, 'abierto');
  assert.equal(cp.estaAbierto(), true);
});

test('Checkpoint: sigue abierto dentro de la ventana de un solo lado', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  assert.equal(cp.evaluar(dateAt(7, 15), false), 'abierto');
});

test('Checkpoint: cierra por ventana vencida (horaEsperada + duracionMinutos) si el predicado de completitud sigue en false', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  cp.evaluar(dateAt(7, 0), false);
  const estadoFinal = cp.evaluar(dateAt(7, 31), false);
  assert.equal(estadoFinal, 'cerrado_ventana_vencida');
});

test('Checkpoint: una vez cerrado por ventana vencida no vuelve a abrirse', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  cp.evaluar(dateAt(7, 31), false);
  assert.equal(cp.estado, 'cerrado_ventana_vencida');
  const estado = cp.evaluar(dateAt(7, 35), false);
  assert.equal(estado, 'cerrado_ventana_vencida');
  assert.equal(cp.estaAbierto(), false);
});

test('Checkpoint: contieneHora determina si una hora decodificada cae en la ventana de un solo lado', () => {
  const cp = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  assert.equal(cp.contieneHora('07:00:00'), true);
  assert.equal(cp.contieneHora('07:15:00'), true);
  assert.equal(cp.contieneHora('07:30:00'), true);
  assert.equal(cp.contieneHora('06:59:59'), false);
  assert.equal(cp.contieneHora('07:31:00'), false);
  assert.equal(cp.contieneHora(null), false);
});
