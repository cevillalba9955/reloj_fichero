import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarCalendario,
  reclasificarDia,
  parsePeriodo,
  Clasificacion,
  diaDe,
} from '../../src/presentismo/domain/calendario-mes.js';

// Lunes a viernes = {1,2,3,4,5} (domingo=0..sábado=6).
const LV = new Set([1, 2, 3, 4, 5]);

test('parsePeriodo valida YYYYMM', () => {
  assert.deepEqual(parsePeriodo('202607'), { anio: 2026, mes: 7 });
  assert.throws(() => parsePeriodo('202613'), /mes inválido/);
  assert.throws(() => parsePeriodo('2026-07'));
  assert.throws(() => parsePeriodo('20267'));
});

test('genera 31 días con L–V Laborable y S–D No Laborable (US1-1)', () => {
  const cal = generarCalendario('202607', LV);
  assert.equal(cal.dias.length, 31);
  // 2026-07-01 es miércoles → Laborable.
  assert.equal(diaDe(cal, '2026-07-01').clasificacion, Clasificacion.LABORABLE);
  // 2026-07-04 es sábado, 2026-07-05 domingo → No Laborable.
  assert.equal(diaDe(cal, '2026-07-04').clasificacion, Clasificacion.NO_LABORABLE);
  assert.equal(diaDe(cal, '2026-07-05').clasificacion, Clasificacion.NO_LABORABLE);
});

test('febrero no bisiesto tiene 28 días', () => {
  assert.equal(generarCalendario('202702', LV).dias.length, 28);
  assert.equal(generarCalendario('202402', LV).dias.length, 29, '2024 bisiesto');
});

test('reclasificar un día a Feriado y preservar el resto (US1-2)', () => {
  const cal = generarCalendario('202607', LV);
  const cal2 = reclasificarDia(cal, '2026-07-09', Clasificacion.FERIADO);
  assert.equal(diaDe(cal2, '2026-07-09').clasificacion, Clasificacion.FERIADO);
  assert.equal(diaDe(cal2, '2026-07-09').reclasificadoManual, true);
  assert.equal(diaDe(cal2, '2026-07-10').clasificacion, Clasificacion.LABORABLE, 'los demás intactos');
  // Inmutabilidad: el original no cambió.
  assert.equal(diaDe(cal, '2026-07-09').clasificacion, Clasificacion.LABORABLE);
});

test('esquema Lunes a Sábado hace laborables los sábados (US1-3)', () => {
  const LVS = new Set([1, 2, 3, 4, 5, 6]);
  const cal = generarCalendario('202607', LVS);
  assert.equal(diaDe(cal, '2026-07-04').clasificacion, Clasificacion.LABORABLE, 'sábado');
  assert.equal(diaDe(cal, '2026-07-05').clasificacion, Clasificacion.NO_LABORABLE, 'domingo');
});

test('regenerar no pisa reclasificaciones manuales (US1-4, FR-006)', () => {
  const cal = generarCalendario('202607', LV);
  const editado = reclasificarDia(cal, '2026-07-09', Clasificacion.FERIADO);
  const regenerado = generarCalendario('202607', LV, editado);
  assert.equal(diaDe(regenerado, '2026-07-09').clasificacion, Clasificacion.FERIADO, 'preserva edición');
  assert.equal(regenerado.dias.length, 31, 'sin duplicar días');
});

test('reclasificar rechaza fecha fuera del mes y clasificación inválida', () => {
  const cal = generarCalendario('202607', LV);
  assert.throws(() => reclasificarDia(cal, '2026-08-01', Clasificacion.FERIADO), /no pertenece/);
  assert.throws(() => reclasificarDia(cal, '2026-07-09', 'Vacaciones'), /clasificación inválida/);
});
