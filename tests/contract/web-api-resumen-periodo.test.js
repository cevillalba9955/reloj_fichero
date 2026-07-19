import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  mesActualPeriodo,
} from '../helpers/fichadas-hoy-entorno.js';

// T005 (feature 011, US1) — Contrato de GET /api/resumen-periodo y
// GET /api/resumen-periodo/{legajo}. Ver specs/011-resumen-periodo/contracts/
// web-api.md y data-model.md (VistaResumenPeriodo / VistaDetalleEmpleado).
// Reutiliza el mismo entorno file-based que 010 (crearEntornoFichadasHoy):
// calendario del período actual, snapshot local del padrón, sin Oracle/reloj.

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' },
  { legajo: 9, categoria: 'CATEGORIA_INEXISTENTE', nombre: 'Zoe Anomalía' },
];

// Día 1 del mes actual: siempre vencido (<= hoy) sea cual sea el día en que
// corra la suite.
const FECHA = fechaDelMes(1);

test('GET /api/resumen-periodo → 200 con la forma de VistaResumenPeriodo', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
  });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    assert.equal(res.status, 200);
    const v = await res.json();

    assert.equal(v.periodo, mesActualPeriodo());
    assert.ok(Array.isArray(v.periodos) && v.periodos.includes(mesActualPeriodo()));
    assert.ok(Array.isArray(v.filas));
    assert.equal(v.filas.length, 2);

    for (const fila of v.filas) {
      for (const campo of [
        'legajo', 'nombre', 'horasTrabajadas', 'completas', 'incompletas',
        'ausencias', 'llegadasTarde', 'retirosAnticipados', 'correcciones', 'anomalia',
      ]) {
        assert.ok(campo in fila, `cada fila debe incluir "${campo}"`);
      }
    }

    const fila1 = v.filas.find((f) => f.legajo === 1);
    assert.equal(fila1.nombre, 'Ana Pérez');
    assert.equal(fila1.anomalia, null);

    const fila9 = v.filas.find((f) => f.legajo === 9);
    assert.ok(fila9.anomalia, 'legajo sin categoría viene señalado como anomalía (FR-007)');
    assert.equal(fila9.horasTrabajadas, 0);

    assert.ok(!/rawHex|template|huella/i.test(JSON.stringify(v)));
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo?periodo= inválido → 400 PERIODO_INVALIDO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=2026-07`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PERIODO_INVALIDO');
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo?periodo= sin calendario generado → 404 CALENDARIO_NO_GENERADO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=209912`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'CALENDARIO_NO_GENERADO');
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo — padrón vacío → 200 con filas []', async () => {
  const e = await crearEntornoFichadasHoy({ padron: [] });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).filas, []);
  } finally {
    e.close();
  }
});

// ---------------------------------------------------------------------------
// T014 (US2) — GET /api/resumen-periodo/{legajo}
// ---------------------------------------------------------------------------

test('GET /api/resumen-periodo/{legajo} → 200 con VistaDetalleEmpleado', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
  });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo/1`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.legajo, 1);
    assert.equal(v.nombre, 'Ana Pérez');
    assert.ok(Array.isArray(v.dias));
    const dia = v.dias.find((d) => d.fecha === FECHA);
    // 07:05 cae dentro del margen de tolerancia (07:00 + 30 min): la entrada
    // EFECTIVA (lo que expone el detalle) se ajusta a la apertura oficial.
    assert.equal(dia.entrada, '07:00', 'horas en HH:MM, nunca minutos crudos');
    assert.ok(!/rawHex|template|huella/i.test(JSON.stringify(v)));
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo/{legajo} — legajo inválido → 400 LEGAJO_INVALIDO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo/abc`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'LEGAJO_INVALIDO');
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo/{legajo} — sin categoría configurada → 409 EMPLEADO_SIN_CATEGORIA', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo/9`);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'EMPLEADO_SIN_CATEGORIA');
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo/{legajo}?periodo= sin calendario → 404 CALENDARIO_NO_GENERADO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo/1?periodo=209912`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'CALENDARIO_NO_GENERADO');
  } finally {
    e.close();
  }
});
