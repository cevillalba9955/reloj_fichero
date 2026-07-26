import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  mesActualPeriodo,
} from '../helpers/fichadas-hoy-entorno.js';
import { createFileVacacionesRepository } from '../../src/presentismo/adapters/file-vacaciones-repository.js';
import { periodoSiguiente } from '../../src/presentismo/domain/calendario-mes.js';

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
        'feriado', 'licencia', 'vacaciones',
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
    // El detalle muestra la hora REAL fichada (07:05), no la efectiva ajustada
    // por tolerancia; con corrección vigente mostraría la corregida.
    assert.equal(dia.entrada, '07:05', 'hora real fichada, en HH:MM');
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

// ---------------------------------------------------------------------------
// Modo QUINCENAL (FR-013) — PRESENTISMO_RESUMEN_PERIODO=QUINCENAL en .env:
// los períodos seleccionables son quincenas 'YYYYMM-Q1' / 'YYYYMM-Q2'.
// ---------------------------------------------------------------------------

const ENV_QUINCENAL = { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' };

test('QUINCENAL: los períodos ofrecidos son quincenas y el default es la quincena en curso', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON, envExtra: ENV_QUINCENAL });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    assert.equal(res.status, 200);
    const v = await res.json();

    const mes = mesActualPeriodo();
    assert.deepEqual(v.periodos, [`${mes}-Q1`, `${mes}-Q2`]);
    const quincenaHoy = new Date().getDate() <= 15 ? 'Q1' : 'Q2';
    assert.equal(v.periodo, `${mes}-${quincenaHoy}`);
  } finally {
    e.close();
  }
});

test('QUINCENAL: el detalle de una quincena solo incluye sus días', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
    envExtra: ENV_QUINCENAL,
  });
  try {
    const mes = mesActualPeriodo();

    const q1 = await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${mes}-Q1`)).json();
    assert.ok(q1.dias.some((d) => d.fecha === FECHA), 'el día 1 pertenece a la 1ra quincena');
    assert.ok(q1.dias.every((d) => Number(d.fecha.slice(8, 10)) <= 15));

    const q2 = await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${mes}-Q2`)).json();
    assert.ok(q2.dias.every((d) => Number(d.fecha.slice(8, 10)) >= 16), 'la 2da quincena no incluye días 1–15');
  } finally {
    e.close();
  }
});

test('QUINCENAL: el resumen de la quincena acumula solo sus días (fila↔detalle coherentes)', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
    envExtra: ENV_QUINCENAL,
  });
  try {
    const mes = mesActualPeriodo();
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=${mes}-Q2`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.periodo, `${mes}-Q2`);
    const fila1 = v.filas.find((f) => f.legajo === 1);
    // La fichada del día 1 (Q1) no aporta a la Q2: sin jornadas incompletas.
    assert.equal(fila1.incompletas, 0);
  } finally {
    e.close();
  }
});

test('QUINCENAL: ?periodo=YYYYMM (mes completo) sigue siendo válido', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON, envExtra: ENV_QUINCENAL });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=${mesActualPeriodo()}`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).periodo, mesActualPeriodo());
  } finally {
    e.close();
  }
});

test('MENSUAL (default): ?periodo=YYYYMM-Q1 → 400 PERIODO_INVALIDO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=${mesActualPeriodo()}-Q1`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PERIODO_INVALIDO');
  } finally {
    e.close();
  }
});

// feature 012 (FR-012) — columnas feriado/licencia y `dias[].justificacion`.
test('feature 012: feriado/licencia en el resumen y justificacion en el detalle', async () => {
  const FECHA_LICENCIA = fechaDelMes(2);
  const FECHA_FERIADO = fechaDelMes(9);
  const e = await crearEntornoFichadasHoy({
    padron: [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }],
    clasificaciones: { [FECHA_LICENCIA]: 'Laborable', [FECHA_FERIADO]: 'Feriado' },
  });
  try {
    const alta = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_LICENCIA, motivoId: 'examen' }),
    });
    assert.equal(alta.status, 200);

    const res = await fetch(`${e.base}/api/resumen-periodo`);
    const v = await res.json();
    const fila1 = v.filas.find((f) => f.legajo === 1);
    assert.equal(fila1.feriado, 1);
    assert.equal(fila1.licencia, 1);

    const detalleRes = await fetch(`${e.base}/api/resumen-periodo/1`);
    const detalle = await detalleRes.json();
    const dia = detalle.dias.find((d) => d.fecha === FECHA_LICENCIA);
    assert.equal(dia.justificacion.motivoId, 'examen');
    assert.equal(dia.justificacion.tipoPago, 'Paga');
  } finally {
    e.close();
  }
});

// spec 015 — nuevo contador `vacaciones`: días con la Justificación-espejo de
// una Asignación de Vacaciones (motivoId 'vacaciones-anual', "No paga"),
// excluidos de `ausencias` a diferencia de cualquier otra Justificación
// "No paga" (que sí sigue sumando ahí, ver test de feature 012 arriba).
test('spec 015: vacaciones en el resumen, excluidas de ausencias', async () => {
  const FECHA_VACACIONES = fechaDelMes(1); // día 1: siempre <= hoy
  const e = await crearEntornoFichadasHoy({
    padron: [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }],
    clasificaciones: { [FECHA_VACACIONES]: 'Laborable' },
  });
  try {
    const antes = await (await fetch(`${e.base}/api/resumen-periodo`)).json();
    const ausenciasAntes = antes.filas.find((f) => f.legajo === 1).ausencias;
    assert.ok(ausenciasAntes > 0, 'sin vacaciones asignadas, el día 1 (sin fichadas) ya cuenta como ausencia');

    const vacacionesRepo = createFileVacacionesRepository({ repoDir: e.repoDir });
    await vacacionesRepo.guardarLegajo(1, { saldo: 10, ultimoIncrementoAplicado: null, movimientos: [] });

    const alta = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: FECHA_VACACIONES, cantidadDias: 1, autor: 'rrhh' }),
    });
    assert.equal(alta.status, 200);

    const res = await fetch(`${e.base}/api/resumen-periodo`);
    const v = await res.json();
    const fila1 = v.filas.find((f) => f.legajo === 1);
    assert.equal(fila1.vacaciones, 1);
    assert.equal(fila1.ausencias, ausenciasAntes - 1, 'el día de vacaciones deja de sumar a ausencias');
  } finally {
    e.close();
  }
});

// spec 015 feedback — `enCurso` avisa que el período mostrado todavía no
// refleja sus días futuros en los acumulados (no cambia ningún cálculo).
test('GET /api/resumen-periodo: enCurso es true para el período que contiene a "hoy"', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    const v = await res.json();
    assert.equal(v.enCurso, true);
  } finally {
    e.close();
  }
});

test('GET /api/resumen-periodo?periodo=: enCurso es false para un período que no contiene a "hoy"', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON, incluirMesSiguiente: true });
  try {
    const mesSiguiente = periodoSiguiente(mesActualPeriodo());
    const res = await fetch(`${e.base}/api/resumen-periodo?periodo=${mesSiguiente}`);
    const v = await res.json();
    assert.equal(v.periodo, mesSiguiente);
    assert.equal(v.enCurso, false);
  } finally {
    e.close();
  }
});
