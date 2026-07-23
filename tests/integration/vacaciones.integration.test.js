import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearEntornoFichadasHoy, fechaDelMes, fechaDelMesSiguiente } from '../helpers/fichadas-hoy-entorno.js';
import { createFileVacacionesRepository } from '../../src/presentismo/adapters/file-vacaciones-repository.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { generarCalendario, periodoAnterior } from '../../src/presentismo/domain/calendario-mes.js';
import { expandirDiasCorridos } from '../../src/presentismo/domain/vacaciones.js';

// spec 015 — Integración: asignar (multi-período) → resumen de período →
// revertir (T040-T043 lo completan) → incremento anual perezoso (T033-T037
// lo completa). Ver quickstart.md Escenarios 1-2.

const PADRON = [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }];

function entorno(extra = {}) {
  return crearEntornoFichadasHoy({ padron: PADRON, clasificaciones: {}, incluirMesSiguiente: true, ...extra });
}

async function seedSaldo(repoDir, legajo, saldo) {
  const repo = createFileVacacionesRepository({ repoDir });
  await repo.guardarLegajo(legajo, { saldo, ultimoIncrementoAplicado: null, movimientos: [] });
}

async function post(base, path, body, method = 'POST') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// Acceptance Scenario US1.3/US1.6: una asignación que cruza de período no se
// corta ni se rechaza; cada día queda marcado en el período que corresponde.
// Usa el período ANTERIOR al actual (en vez de incluirMesSiguiente) con
// fechas ya pasadas: el "Resumen del Período" (feature 011, FR-008) recorta
// su detalle a `fecha <= hoy`, así que solo fechas pasadas son observables
// ahí — un rango que cruce hacia el futuro seguiría creando la Justificación-
// espejo correctamente, pero no se vería reflejado en ese resumen todavía.
test('asignar vacaciones que cruza de período: ambos períodos reflejan los días como No paga/ausencia', async () => {
  const e = await entorno();
  try {
    const repoPresentismo = createFilePresentismoRepository({ repoDir: e.repoDir });
    const periodoAnt = periodoAnterior(e.periodo);
    await repoPresentismo.guardarCalendario(generarCalendario(periodoAnt, new Set([1, 2, 3, 4, 5])));

    await seedSaldo(e.repoDir, 1, 20);
    // 3 días antes del 1° del mes actual (fin del período anterior) + 3 días
    // del mes actual: todos <= hoy.
    const inicioMesActual = new Date(`${fechaDelMes(1)}T00:00:00Z`);
    const fechaInicio = new Date(inicioMesActual.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { status, body } = await post(e.base, '/api/vacaciones/asignaciones', {
      legajo: 1,
      fechaInicio,
      cantidadDias: 6,
      autor: 'rrhh.mgomez',
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.saldoResultante, 14);

    // Período anterior: los 3 primeros días de la asignación.
    const detalleAnt = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${periodoAnt}`)).json()).dias;
    const diasVacacionesAnt = detalleAnt.filter((d) => d.justificacion?.motivoId === 'vacaciones-anual');
    assert.equal(diasVacacionesAnt.length, 3, 'los 3 días del período anterior deben quedar marcados');
    for (const d of diasVacacionesAnt) {
      assert.equal(d.justificacion.tipoPago, 'No paga');
      assert.equal(d.horas, 0, 'No paga no acredita jornada esperada');
    }
    const filaAnt = (await (await fetch(`${e.base}/api/resumen-periodo?periodo=${periodoAnt}`)).json()).filas.find(
      (f) => f.legajo === 1,
    );
    assert.ok(filaAnt.ausencias >= 3, 'los días de vacaciones cuentan como ausencia');
    assert.equal(filaAnt.licencia, 0, 'nunca como licencia (tipoPago Paga)');

    // Período actual: los 3 días restantes de la misma asignación.
    const detalleActual = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${e.periodo}`)).json()).dias;
    const diasVacacionesActual = detalleActual.filter((d) => d.justificacion?.motivoId === 'vacaciones-anual');
    assert.equal(diasVacacionesActual.length, 3, 'los 3 días del período actual deben quedar marcados');
    for (const d of diasVacacionesActual) {
      assert.equal(d.justificacion.tipoPago, 'No paga');
    }
  } finally {
    e.close();
  }
});

// spec 015 (US3, T034) — incremento anual perezoso e idempotente: forzar una
// fecha de incremento ya pasada y verificar que dos GET consecutivos no lo
// duplican (quickstart.md Escenario 3.1/3.2).
test('incremento automático anual: se aplica una sola vez ante consultas repetidas (idempotencia)', async () => {
  const configDir = mkdtempSync(join(tmpdir(), 'vacaciones-config-'));
  const configPath = join(configDir, 'vacaciones.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      incrementoAnual: { mes: 1, dia: 1 }, // ya pasado para cualquier fecha de ejecución después de enero
      escalaAntiguedad: [
        { aniosMinimos: 0, dias: 14 },
        { aniosMinimos: 5, dias: 21 },
        { aniosMinimos: 10, dias: 28 },
        { aniosMinimos: 20, dias: 35 },
      ],
    }),
  );

  const PADRON_CON_INGRESO = [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez', fechaIngreso: '2018-03-01' }];
  const e = await crearEntornoFichadasHoy({
    padron: PADRON_CON_INGRESO,
    clasificaciones: {},
    envExtra: { PRESENTISMO_VACACIONES_CONFIG: configPath },
  });
  try {
    const r1 = await fetch(`${e.base}/api/vacaciones/1`);
    const body1 = await r1.json();
    const incrementos1 = body1.movimientos.filter((m) => m.tipo === 'incremento');
    assert.equal(incrementos1.length, 1, 'un único incremento aplicado en la primera consulta');
    assert.ok(incrementos1[0].dias > 0, 'acredita días según la escala LCT para la antigüedad calculada');
    assert.equal(body1.saldo, incrementos1[0].dias, 'saldo previo era 0 (legajo nuevo): el saldo es exactamente el incremento');

    const r2 = await fetch(`${e.base}/api/vacaciones/1`);
    const body2 = await r2.json();
    assert.deepEqual(body2, body1, 'una segunda consulta no duplica el incremento (idempotencia)');
  } finally {
    e.close();
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('asignar vacaciones sobre un período sin calendario generado no registra nada (todo o nada, FR-005)', async () => {
  // Sin incluirMesSiguiente: cruzar a ese mes debe rechazar TODA la asignación.
  const e = await crearEntornoFichadasHoy({ padron: PADRON, clasificaciones: {}, incluirMesSiguiente: false });
  try {
    await seedSaldo(e.repoDir, 1, 20);
    const { status, body } = await post(e.base, '/api/vacaciones/asignaciones', {
      legajo: 1,
      fechaInicio: fechaDelMes(29),
      cantidadDias: 5,
      autor: 'rrhh',
    });
    assert.equal(status, 404);
    assert.equal(body.error.codigo, 'CALENDARIO_NO_GENERADO');

    const repo = createFileVacacionesRepository({ repoDir: e.repoDir });
    assert.deepEqual(await repo.listarAsignaciones(1), [], 'ningún registro parcial (todo o nada)');
    assert.equal((await repo.cargarLegajo(1)).saldo, 20, 'el saldo no se tocó');
  } finally {
    e.close();
  }
});

// spec 015 (US4, T039) — ciclo completo: asignar → resumen de período →
// revertir → el día deja de estar marcado → repetir el DELETE da 404 →
// intentar revertir desde el genérico de 012 da 409 (quickstart.md
// Escenario 4).
test('ciclo completo: asignar → resumen → revertir → ya no aparece en el resumen → repetir DELETE da 404', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaInicio = fechaDelMes(3);
    const { body: asignacion } = await post(e.base, '/api/vacaciones/asignaciones', {
      legajo: 1,
      fechaInicio,
      cantidadDias: 5,
      autor: 'rrhh.mgomez',
    });
    assert.equal(asignacion.saldoResultante, 5);

    // El resumen del período ve los días de vacaciones antes de revertir.
    const antesDeRevertir = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${e.periodo}`)).json()).dias;
    assert.equal(antesDeRevertir.find((d) => d.fecha === fechaInicio).justificacion?.motivoId, 'vacaciones-anual');

    // Revertir repone el saldo (Acceptance Scenario US4.1).
    const { status: statusDelete, body: reversion } = await post(
      e.base,
      `/api/vacaciones/asignaciones/${asignacion.asignacionId}`,
      { autor: 'rrhh.mgomez' },
      'DELETE',
    );
    assert.equal(statusDelete, 200);
    assert.equal(reversion.saldoResultante, 10);

    // El resumen del período ya no ve la Justificación vigente (vuelve a "Sin fichadas").
    const despuesDeRevertir = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${e.periodo}`)).json()).dias;
    assert.equal(despuesDeRevertir.find((d) => d.fecha === fechaInicio).justificacion, null);

    // Repetir el DELETE sobre la misma asignación → 404.
    const { status: status2 } = await post(
      e.base,
      `/api/vacaciones/asignaciones/${asignacion.asignacionId}`,
      { autor: 'x' },
      'DELETE',
    );
    assert.equal(status2, 404);
  } finally {
    e.close();
  }
});

// spec 015 (FR-017, edge case del spec) — fichadas que llegan sobre un día
// No Laborable marcado Vacaciones no descartan la marca en silencio: el día
// se señala para revisión (mismo tratamiento que 004/012 para Laborable).
test('fichadas sobre un día No Laborable marcado Vacaciones señalan revisión, no lo descartan (FR-017)', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 20);
    const fechaInicio = fechaDelMes(1);
    const asignar = await post(e.base, '/api/vacaciones/asignaciones', {
      legajo: 1,
      fechaInicio,
      cantidadDias: 7,
      autor: 'rrhh',
    });
    assert.equal(asignar.status, 200);

    const fechas = expandirDiasCorridos(fechaInicio, 7);
    const finde = fechas.find((f) => {
      const [y, m, d] = f.split('-').map(Number);
      const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      return diaSemana === 0 || diaSemana === 6; // domingo o sábado
    });
    assert.ok(finde, 'un rango de 7 días corridos siempre incluye al menos un fin de semana');

    e.agregarFichadas([{ legajo: 1, fecha: finde, hora: '09:00:00' }]);

    const detalle = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${e.periodo}`)).json()).dias;
    const diaFinde = detalle.find((d) => d.fecha === finde);
    assert.equal(diaFinde.justificacion?.motivoId, 'vacaciones-anual', 'la marca de vacaciones no se descarta');
    assert.equal(diaFinde.requiereJustificacionRevision, true, 'se señala para revisión, sin descartar en silencio');
  } finally {
    e.close();
  }
});

test('DELETE /api/justificaciones sobre un día de una asignación TODAVÍA vigente rechaza con 409 (guardrail de origen)', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaInicio = fechaDelMes(3);
    const { body: asignacion } = await post(e.base, '/api/vacaciones/asignaciones', {
      legajo: 1,
      fechaInicio,
      cantidadDias: 3,
      autor: 'rrhh',
    });

    const { status } = await post(e.base, '/api/justificaciones', { legajo: 1, fecha: fechaInicio, autor: 'x' }, 'DELETE');
    assert.equal(status, 409);

    // Una vez revertida DESDE su propia Asignación, el día vuelve a estar libre.
    await post(e.base, `/api/vacaciones/asignaciones/${asignacion.asignacionId}`, { autor: 'x' }, 'DELETE');
    const detalle = (await (await fetch(`${e.base}/api/resumen-periodo/1?periodo=${e.periodo}`)).json()).dias;
    assert.equal(detalle.find((d) => d.fecha === fechaInicio).justificacion, null);
  } finally {
    e.close();
  }
});
