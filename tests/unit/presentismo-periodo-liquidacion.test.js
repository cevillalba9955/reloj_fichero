import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recortar, tramosParaTipo, fechaEnTramo, Tramo } from '../../src/presentismo/domain/periodo-liquidacion.js';
import { generarCalendario } from '../../src/presentismo/domain/calendario-mes.js';

const LV = new Set([1, 2, 3, 4, 5]);

test('tramosParaTipo', () => {
  assert.deepEqual(tramosParaTipo('Mensual'), ['Mes']);
  assert.deepEqual(tramosParaTipo('Quincenal'), ['Q1', 'Q2']);
});

test('recorte Q1=1–15, Q2=16–fin, Mes=todos', () => {
  const cal = generarCalendario('202607', LV); // 31 días
  const q1 = recortar(cal, Tramo.Q1);
  const q2 = recortar(cal, Tramo.Q2);
  const mes = recortar(cal, Tramo.MES);
  assert.equal(q1.dias.length, 15);
  assert.equal(q2.dias.length, 16);
  assert.equal(mes.dias.length, 31);
  assert.equal(q1.dias.at(-1).dd, 15);
  assert.equal(q2.dias[0].dd, 16);
});

test('fechaEnTramo: quincena de una fecha ISO (feature 011, modo QUINCENAL)', () => {
  assert.equal(fechaEnTramo('2026-07-01', Tramo.Q1), true);
  assert.equal(fechaEnTramo('2026-07-15', Tramo.Q1), true);
  assert.equal(fechaEnTramo('2026-07-16', Tramo.Q1), false);
  assert.equal(fechaEnTramo('2026-07-15', Tramo.Q2), false);
  assert.equal(fechaEnTramo('2026-07-16', Tramo.Q2), true);
  assert.equal(fechaEnTramo('2026-07-31', Tramo.Q2), true);
  assert.equal(fechaEnTramo('2026-07-01', Tramo.MES), true);
  assert.equal(fechaEnTramo('2026-07-31', Tramo.MES), true);
});

test('Q1 + Q2 = Mes sin días de más ni de menos (SC-012)', () => {
  const cal = generarCalendario('202602', LV); // febrero 28 días
  const q1 = recortar(cal, Tramo.Q1).dias.length;
  const q2 = recortar(cal, Tramo.Q2).dias.length;
  assert.equal(q1 + q2, recortar(cal, Tramo.MES).dias.length);
  assert.equal(q1, 15);
  assert.equal(q2, 13);
});
