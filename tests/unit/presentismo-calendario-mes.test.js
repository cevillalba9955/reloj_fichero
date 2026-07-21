import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarCalendario,
  reclasificarDia,
  parsePeriodo,
  periodoAnterior,
  periodoSiguiente,
  Clasificacion,
  diaDe,
  cerrarCalendario,
  reabrirCalendario,
  exigirPeriodoAbierto,
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

// T002 (feature 008) — aritmética de períodos YYYYMM para la frontera generable.
test('periodoSiguiente y periodoAnterior avanzan un mes', () => {
  assert.equal(periodoSiguiente('202607'), '202608');
  assert.equal(periodoAnterior('202607'), '202606');
});

test('periodoSiguiente/periodoAnterior cruzan el límite de año', () => {
  assert.equal(periodoSiguiente('202612'), '202701', 'dic → ene del año siguiente');
  assert.equal(periodoAnterior('202601'), '202512', 'ene → dic del año anterior');
});

test('periodoSiguiente/periodoAnterior validan el formato YYYYMM', () => {
  assert.throws(() => periodoSiguiente('2026-07'), /período inválido/);
  assert.throws(() => periodoAnterior('202613'), /mes inválido/);
  assert.throws(() => periodoSiguiente('20267'), /período inválido/);
});

// 013-reestructurar-data-periodos (US3) — ciclo de vida cerrado/reabierto.

test('generarCalendario: cerrado=false, cierre=null, reapertura=null por defecto (Acceptance Scenario 4)', () => {
  const cal = generarCalendario('202607', LV);
  assert.equal(cal.cerrado, false);
  assert.equal(cal.cierre, null);
  assert.equal(cal.reapertura, null);
});

test('cerrarCalendario devuelve un calendario NUEVO cerrado, con auditoría, sin mutar el original', () => {
  const cal = generarCalendario('202607', LV);
  const cerrado = cerrarCalendario(cal, 'rrhh.mgomez');
  assert.equal(cerrado.cerrado, true);
  assert.equal(cerrado.cierre.autor, 'rrhh.mgomez');
  assert.ok(typeof cerrado.cierre.fechaHora === 'string' && cerrado.cierre.fechaHora.length > 0);
  // Inmutabilidad: el original no cambió.
  assert.equal(cal.cerrado, false);
  assert.notEqual(cerrado, cal);
});

test('reabrirCalendario revierte el cierre, conserva el historial de "cierre" y agrega "reapertura"', () => {
  const cal = generarCalendario('202607', LV);
  const cerrado = cerrarCalendario(cal, 'rrhh.mgomez');
  const reabierto = reabrirCalendario(cerrado, 'rrhh.otra');
  assert.equal(reabierto.cerrado, false);
  assert.equal(reabierto.reapertura.autor, 'rrhh.otra');
  assert.ok(reabierto.cierre, 'conserva el registro histórico del último cierre');
  assert.equal(reabierto.cierre.autor, 'rrhh.mgomez');
});

test('cerrar un período ya cerrado (o reabrir uno ya abierto) es idempotente: no lanza, actualiza autor/fecha (edge case del spec)', () => {
  const cal = generarCalendario('202607', LV);
  const cerrado1 = cerrarCalendario(cal, 'primero');
  const cerrado2 = cerrarCalendario(cerrado1, 'segundo');
  assert.equal(cerrado2.cerrado, true);
  assert.equal(cerrado2.cierre.autor, 'segundo', 'el segundo intento actualiza el autor/fecha');

  const reabierto1 = reabrirCalendario(cal, 'x'); // ya estaba abierto
  assert.equal(reabierto1.cerrado, false);
  const reabierto2 = reabrirCalendario(reabierto1, 'y'); // reabrir de nuevo
  assert.equal(reabierto2.cerrado, false);
  assert.equal(reabierto2.reapertura.autor, 'y');
});

test('exigirPeriodoAbierto no lanza si el período está abierto (cerrado ausente o false)', () => {
  const cal = generarCalendario('202607', LV);
  assert.doesNotThrow(() => exigirPeriodoAbierto(cal));
  assert.doesNotThrow(() => exigirPeriodoAbierto({ ...cal, cerrado: undefined }));
});

test('exigirPeriodoAbierto lanza con httpCode PERIODO_CERRADO si el período está cerrado', () => {
  const cal = generarCalendario('202607', LV);
  const cerrado = cerrarCalendario(cal, 'a');
  assert.throws(() => exigirPeriodoAbierto(cerrado), (err) => {
    assert.equal(err.httpCode, 'PERIODO_CERRADO');
    return true;
  });
});
