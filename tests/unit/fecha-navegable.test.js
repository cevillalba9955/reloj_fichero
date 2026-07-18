import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaNavegable, construirNavegacion } from '../../src/web/view-model.js';

// feature 010, iteración 2 (T056) — Predicado único de navegabilidad de fechas
// (research.md §6): fecha <= hoy Y período con calendario generado ("período de
// liquidación abierto" mientras el cierre de período no exista). Capa crítica
// (Principio IV): impide editar fechas fuera del período abierto.

const HOY = '2026-07-18';
const PERIODOS = ['202606', '202607'];

test('fechaNavegable: hoy es navegable si su período tiene calendario', () => {
  assert.equal(fechaNavegable(HOY, { hoy: HOY, periodos: PERIODOS }), true);
});

test('fechaNavegable: mañana no es navegable aunque el período tenga calendario', () => {
  assert.equal(fechaNavegable('2026-07-19', { hoy: HOY, periodos: PERIODOS }), false);
});

test('fechaNavegable: día previo de un período con calendario es navegable', () => {
  assert.equal(fechaNavegable('2026-06-30', { hoy: HOY, periodos: PERIODOS }), true);
});

test('fechaNavegable: día de un período sin calendario no es navegable', () => {
  assert.equal(fechaNavegable('2026-05-31', { hoy: HOY, periodos: PERIODOS }), false);
});

test('fechaNavegable: sin períodos generados, ni siquiera hoy es navegable', () => {
  assert.equal(fechaNavegable(HOY, { hoy: HOY, periodos: [] }), false);
});

test('construirNavegacion: en hoy, siguiente es null (nunca futuro) y esHoy true', () => {
  const nav = construirNavegacion({ fecha: HOY, hoy: HOY, periodos: PERIODOS });
  assert.deepEqual(nav, { anterior: '2026-07-17', siguiente: null, esHoy: true });
});

test('construirNavegacion: en un día previo, ofrece anterior y siguiente', () => {
  const nav = construirNavegacion({ fecha: '2026-07-10', hoy: HOY, periodos: PERIODOS });
  assert.deepEqual(nav, { anterior: '2026-07-09', siguiente: '2026-07-11', esHoy: false });
});

test('construirNavegacion: cruza el borde de mes hacia un período con calendario', () => {
  const nav = construirNavegacion({ fecha: '2026-07-01', hoy: HOY, periodos: PERIODOS });
  assert.equal(nav.anterior, '2026-06-30');
});

test('construirNavegacion: primer día del período más antiguo no ofrece anterior', () => {
  const nav = construirNavegacion({ fecha: '2026-06-01', hoy: HOY, periodos: PERIODOS });
  assert.deepEqual(nav, { anterior: null, siguiente: '2026-06-02', esHoy: false });
});
