import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHoraMinuto,
  formatHoraMinuto,
  overlap,
  clamp,
  enVentana,
} from '../../src/presentismo/domain/tiempo.js';

test('parseHoraMinuto: HH:MM y HH:MM:SS', () => {
  assert.equal(parseHoraMinuto('07:00'), 420);
  assert.equal(parseHoraMinuto('16:00'), 960);
  assert.equal(parseHoraMinuto('23:59'), 1439);
  assert.equal(parseHoraMinuto('00:00'), 0);
  assert.equal(parseHoraMinuto('08:10:45'), 8 * 60 + 10, 'trunca segundos');
});

test('parseHoraMinuto: rechaza formato/rango inválido', () => {
  assert.throws(() => parseHoraMinuto('24:00'));
  assert.throws(() => parseHoraMinuto('07:60'));
  assert.throws(() => parseHoraMinuto('7h'));
  assert.throws(() => parseHoraMinuto(700));
});

test('formatHoraMinuto: minutos → HH:MM', () => {
  assert.equal(formatHoraMinuto(420), '07:00');
  assert.equal(formatHoraMinuto(1439), '23:59');
  assert.equal(formatHoraMinuto(0), '00:00');
  assert.equal(formatHoraMinuto(540), '09:00', 'duración 9 h');
  assert.throws(() => formatHoraMinuto(-1));
});

test('overlap: solapamiento de intervalos', () => {
  assert.equal(overlap(420, 960, 720, 780), 60, 'pausa 12-13 dentro de 07-16');
  assert.equal(overlap(420, 960, 1000, 1100), 0, 'sin solape');
  assert.equal(overlap(420, 960, 300, 500), 80, 'solape parcial por izquierda');
  assert.equal(overlap(420, 960, 900, 1100), 60, 'solape parcial por derecha');
});

test('clamp y enVentana', () => {
  assert.equal(clamp(600, 0, 540), 540);
  assert.equal(clamp(-10, 0, 540), 0);
  assert.equal(clamp(300, 0, 540), 300);
  assert.equal(enVentana(450, [450, 720]), true, 'límite inferior inclusivo');
  assert.equal(enVentana(720, [450, 720]), true, 'límite superior inclusivo');
  assert.equal(enVentana(721, [450, 720]), false);
});
