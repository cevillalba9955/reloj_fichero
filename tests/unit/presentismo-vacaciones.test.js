import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandirDiasCorridos,
  fechaFinDe,
  calcularAntiguedadAnios,
  diasPorAntiguedad,
  proximoIncremento,
  aplicarIncremento,
  aplicarAsignacion,
  aplicarReversion,
  construirAsignacion,
  construirMovimientoSaldo,
  calcularIncrementosPendientes,
} from '../../src/presentismo/domain/vacaciones.js';

const ESCALA_LCT = [
  { aniosMinimos: 0, dias: 14 },
  { aniosMinimos: 5, dias: 21 },
  { aniosMinimos: 10, dias: 28 },
  { aniosMinimos: 20, dias: 35 },
];

// FR-002 / Acceptance Scenario US1.1: días corridos, sean hábiles o no.
test('expandirDiasCorridos devuelve la lista completa de fechas corridas', () => {
  const fechas = expandirDiasCorridos('2026-01-10', 7);
  assert.deepEqual(fechas, [
    '2026-01-10',
    '2026-01-11',
    '2026-01-12',
    '2026-01-13',
    '2026-01-14',
    '2026-01-15',
    '2026-01-16',
  ]);
});

// Acceptance Scenario US1.3: cruza de mes calendario sin cortarse.
test('expandirDiasCorridos cruza de mes sin cortarse', () => {
  const fechas = expandirDiasCorridos('2026-01-28', 5);
  assert.deepEqual(fechas, ['2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01']);
});

test('expandirDiasCorridos rechaza cantidadDias <= 0', () => {
  assert.throws(() => expandirDiasCorridos('2026-01-10', 0));
  assert.throws(() => expandirDiasCorridos('2026-01-10', -1));
});

// contracts/web-api.md ejemplo: fechaInicio 2026-01-10 + 21 días → fechaFin 2026-01-30.
test('fechaFinDe calcula fechaInicio + (cantidadDias - 1) días', () => {
  assert.equal(fechaFinDe('2026-01-10', 21), '2026-01-30');
  assert.equal(fechaFinDe('2026-01-10', 1), '2026-01-10');
});

test('calcularAntiguedadAnios devuelve años completos (aniversario no alcanzado no cuenta)', () => {
  assert.equal(calcularAntiguedadAnios('2015-11-01', '2026-11-01'), 11);
  assert.equal(calcularAntiguedadAnios('2015-11-02', '2026-11-01'), 10);
  assert.equal(calcularAntiguedadAnios('2026-01-01', '2026-07-22'), 0);
});

// Acceptance Scenario US3.1: 6 años de antigüedad → 21 días (tramo 5-<10).
test('diasPorAntiguedad devuelve el último tramo con aniosMinimos <= antigüedad', () => {
  assert.equal(diasPorAntiguedad(ESCALA_LCT, 0), 14);
  assert.equal(diasPorAntiguedad(ESCALA_LCT, 4), 14);
  assert.equal(diasPorAntiguedad(ESCALA_LCT, 6), 21);
  assert.equal(diasPorAntiguedad(ESCALA_LCT, 10), 28);
  assert.equal(diasPorAntiguedad(ESCALA_LCT, 25), 35);
});

test('proximoIncremento devuelve la próxima fecha del ciclo (este año o el siguiente)', () => {
  const config = { mes: 11, dia: 1 };
  assert.equal(proximoIncremento(config, '2026-07-22'), '2026-11-01');
  assert.equal(proximoIncremento(config, '2026-12-15'), '2027-11-01');
  assert.equal(proximoIncremento(config, '2026-11-01'), '2026-11-01');
});

// Acceptance Scenario US1.1/US1.2: descuento de saldo, incluido a negativo.
test('aplicarAsignacion descuenta del saldo, puede quedar negativo (FR-004)', () => {
  assert.equal(aplicarAsignacion(10, 7), 3);
  assert.equal(aplicarAsignacion(3, 5), -2);
});

// Acceptance Scenario US3.2: el incremento suma sobre saldo negativo sin clamp a 0.
test('aplicarIncremento suma sobre el saldo existente, incluso negativo (FR-013)', () => {
  assert.equal(aplicarIncremento(-2, 14), 12);
  assert.equal(aplicarIncremento(24, 0), 24);
});

// Acceptance Scenario US4.1: revertir repone el saldo descontado.
test('aplicarReversion repone al saldo la cantidad descontada', () => {
  assert.equal(aplicarReversion(2, 5), 7);
});

test('construirAsignacion arma el registro con fechaFin derivada y vigente:true', () => {
  const a = construirAsignacion({ id: 'a1', legajo: 1234, fechaInicio: '2026-01-10', cantidadDias: 21, autor: 'rrhh.mgomez' });
  assert.equal(a.id, 'a1');
  assert.equal(a.legajo, 1234);
  assert.equal(a.fechaFin, '2026-01-30');
  assert.equal(a.vigente, true);
  assert.equal(a.reversion, null);
  assert.equal(a.autor, 'rrhh.mgomez');
  assert.equal(typeof a.fechaHora, 'string');
});

const CONFIG_INCREMENTO = { mes: 11, dia: 1 };

// Acceptance Scenario US3.1: 6 años de antigüedad a la fecha del incremento → 21 días.
test('calcularIncrementosPendientes: legajo nunca incrementado, ciclo ya alcanzado → un solo incremento', () => {
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso: '2020-06-01',
    ultimoIncrementoAplicado: null,
    escalaAntiguedad: ESCALA_LCT,
    incrementoAnualConfig: CONFIG_INCREMENTO,
    hoy: '2026-11-02',
  });
  assert.deepEqual(pendientes, [{ fecha: '2026-11-01', dias: 21, antiguedadAnios: 6 }]);
});

// El ciclo de ESTE año (2026-11-01) todavía no llegó a '2026-07-22': el más
// reciente ya alcanzado es el del año anterior (2025-11-01), y como nunca se
// aplicó ninguno, se pone al día con ESE (uno solo, no el de este año).
test('calcularIncrementosPendientes: primera evaluación se pone al día con el último ciclo ya alcanzado (no el de este año, que no llegó)', () => {
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso: '2020-06-01',
    ultimoIncrementoAplicado: null,
    escalaAntiguedad: ESCALA_LCT,
    incrementoAnualConfig: CONFIG_INCREMENTO,
    hoy: '2026-07-22',
  });
  assert.deepEqual(pendientes, [{ fecha: '2025-11-01', dias: 21, antiguedadAnios: 5 }]);
});

test('calcularIncrementosPendientes: es idempotente (ya aplicado el ciclo, no se repite)', () => {
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso: '2020-06-01',
    ultimoIncrementoAplicado: '2026-11-01',
    escalaAntiguedad: ESCALA_LCT,
    incrementoAnualConfig: CONFIG_INCREMENTO,
    hoy: '2026-11-02',
  });
  assert.deepEqual(pendientes, []);
});

// research.md §4: si pasó más de un ciclo sin que nadie consultara el
// sistema (con un incremento previo ya aplicado), se backfillean todos.
test('calcularIncrementosPendientes: con un incremento previo, backfillea varios ciclos consecutivos', () => {
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso: '2010-06-01',
    ultimoIncrementoAplicado: '2023-11-01',
    escalaAntiguedad: ESCALA_LCT,
    incrementoAnualConfig: CONFIG_INCREMENTO,
    hoy: '2026-12-01',
  });
  assert.deepEqual(pendientes, [
    { fecha: '2024-11-01', dias: 28, antiguedadAnios: 14 },
    { fecha: '2025-11-01', dias: 28, antiguedadAnios: 15 },
    { fecha: '2026-11-01', dias: 28, antiguedadAnios: 16 },
  ]);
});

// Edge case del spec: fechaIngreso cargada después de que ya pasó el
// incremento del año en curso → NO se aplica retroactivamente ese año; el
// legajo queda habilitado recién para el próximo ciclo.
test('calcularIncrementosPendientes: legajo nunca incrementado, sin backfill de años previos a fechaIngreso ni del ciclo ya pasado antes de conocerse', () => {
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso: '2026-11-15', // cargada después del ciclo 2026-11-01
    ultimoIncrementoAplicado: null,
    escalaAntiguedad: ESCALA_LCT,
    incrementoAnualConfig: CONFIG_INCREMENTO,
    hoy: '2026-12-01',
  });
  assert.deepEqual(pendientes, [], 'no retrocede al ciclo ya pasado antes de que se conociera la fecha de ingreso');
});

test('construirMovimientoSaldo arma el registro con la forma de data-model.md §4.1', () => {
  const m = construirMovimientoSaldo({
    tipo: 'incremento',
    fecha: '2025-11-01',
    dias: 21,
    saldoResultante: 24,
    antiguedadAnios: 6,
  });
  assert.deepEqual(m, {
    tipo: 'incremento',
    fecha: '2025-11-01',
    dias: 21,
    saldoResultante: 24,
    antiguedadAnios: 6,
    asignacionId: null,
    autor: null,
  });
});
