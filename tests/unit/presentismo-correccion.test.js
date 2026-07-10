import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correccionVigenteDe, crearCorreccion } from '../../src/presentismo/domain/correccion.js';
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

test('crearCorreccion exige motivo (FR-027)', () => {
  assert.throws(() => crearCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', valorCorregido: 540, motivo: '' }), /motivo/);
  const c = crearCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', valorCorregido: 540, motivo: 'olvido de salida', autor: 'ana' });
  assert.equal(c.motivo, 'olvido de salida');
  assert.equal(c.autor, 'ana');
});

test('la corrección prevalece sobre el auto (FR-028, US3-2)', () => {
  // Jornada incompleta (solo entrada) → auto 0.
  const auto = calcularJornadaAuto({ clasificacion: Clasificacion.LABORABLE, fichadas: [{ id: 'a', hora: 422 }], params: PARAMS });
  assert.equal(auto.estado, EstadoJornada.INCOMPLETA);
  const correccion = crearCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', valorCalculado: 0, valorCorregido: 540, motivo: 'olvido' });
  const ajustada = aplicarAjustes(auto, { correccion });
  assert.equal(ajustada.totalDiario, 540);
  assert.equal(ajustada.correccionVigente, true);
});

test('correccionVigenteDe encuentra solo la vigente', () => {
  const correcciones = [
    { legajo: 1, fecha: '2026-07-10', vigente: false, valorCorregido: 100 },
    { legajo: 1, fecha: '2026-07-10', vigente: true, valorCorregido: 540 },
    { legajo: 2, fecha: '2026-07-10', vigente: true, valorCorregido: 480 },
  ];
  assert.equal(correccionVigenteDe(correcciones, 1, '2026-07-10').valorCorregido, 540);
  assert.equal(correccionVigenteDe(correcciones, 9, '2026-07-10'), null);
});

test('requiereRevision cuando el auto por debajo cambió (FR-029)', () => {
  const auto = calcularJornadaAuto({ clasificacion: Clasificacion.LABORABLE, fichadas: [{ id: 'a', hora: 425 }, { id: 'b', hora: 958 }], params: PARAMS });
  assert.equal(auto.totalDiario, 540);
  // La corrección se tomó cuando el auto valía 0 (incompleta), ahora vale 540.
  const correccion = crearCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', valorCalculado: 0, valorCorregido: 480, motivo: 'x' });
  const ajustada = aplicarAjustes(auto, { correccion });
  assert.equal(ajustada.requiereRevision, true);
  assert.equal(ajustada.totalDiario, 480, 'la corrección sigue prevaleciendo');
});

test('la corrección puede exceder la jornada esperada (FR-024)', () => {
  const auto = calcularJornadaAuto({ clasificacion: Clasificacion.LABORABLE, fichadas: [{ id: 'a', hora: 425 }, { id: 'b', hora: 958 }], params: PARAMS });
  const correccion = crearCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-10', valorCalculado: 540, valorCorregido: 600, motivo: 'hora extra acordada' });
  const ajustada = aplicarAjustes(auto, { correccion });
  assert.equal(ajustada.totalDiario, 600);
});
