import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  fechaDelMesSiguiente,
} from '../helpers/fichadas-hoy-entorno.js';
import { createFileVacacionesRepository } from '../../src/presentismo/adapters/file-vacaciones-repository.js';
import { calcularIncrementosPendientes } from '../../src/presentismo/domain/vacaciones.js';
import { loadVacacionesConfig } from '../../src/presentismo/config/vacaciones-config.js';
import { hoyLocal } from '../../src/presentismo/domain/calendario-mes.js';

// spec 015 — Contrato de la API de "Control de Vacaciones Anual".
// Ver specs/015-control-vacaciones/contracts/web-api.md.

const PADRON = [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }];

function entorno(extra = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: {},
    incluirMesSiguiente: true,
    ...extra,
  });
}

async function seedSaldo(repoDir, legajo, saldo) {
  const repo = createFileVacacionesRepository({ repoDir });
  await repo.guardarLegajo(legajo, { saldo, ultimoIncrementoAplicado: null, movimientos: [] });
}

test('POST /api/vacaciones/asignaciones → 200, descuenta el saldo (US1, Acceptance Scenario 1)', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaInicio = fechaDelMes(5);
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio, cantidadDias: 7, autor: 'rrhh.mgomez' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.saldoResultante, 3);
    assert.equal(body.fechaInicio, fechaInicio);
    assert.equal(body.cantidadDias, 7);
    assert.ok(body.asignacionId);
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones permite saldo negativo (Acceptance Scenario 2)', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 3);
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 5, autor: 'rrhh' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).saldoResultante, -2);
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones sin fechaInicio → 400 VACACIONES_INVALIDA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, cantidadDias: 5 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'VACACIONES_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones con cantidadDias <= 0 → 400 VACACIONES_INVALIDA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 0 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'VACACIONES_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones sobre un período sin calendario generado → 404 CALENDARIO_NO_GENERADO', async () => {
  // Sin incluirMesSiguiente: el mes siguiente no tiene calendario.
  const e = await crearEntornoFichadasHoy({ padron: PADRON, clasificaciones: {}, incluirMesSiguiente: false });
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(28), cantidadDias: 10, autor: 'rrhh' }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'CALENDARIO_NO_GENERADO');
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones sobre un período cerrado → 409 PERIODO_CERRADO', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const cierre = await fetch(`${e.base}/api/calendarios/${e.periodo}/cerrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: 'x' }),
    });
    assert.equal(cierre.status, 200);

    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 3, autor: 'rrhh' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'PERIODO_CERRADO');
  } finally {
    e.close();
  }
});

test('POST /api/vacaciones/asignaciones sobre un día con Justificación vigente → 409 VACACIONES_SUPERPUESTA listando las fechas', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaConflicto = fechaDelMes(8);
    const justif = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: fechaConflicto, motivoId: 'enfermedad', autor: 'rrhh' }),
    });
    assert.equal(justif.status, 200);

    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 7, autor: 'rrhh' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.codigo, 'VACACIONES_SUPERPUESTA');
    assert.match(body.error.mensaje, new RegExp(fechaConflicto));

    // FR-007: no debe haber quedado ningún registro parcial de esta asignación.
    const repo = createFileVacacionesRepository({ repoDir: e.repoDir });
    assert.deepEqual(await repo.listarAsignaciones(1), []);
  } finally {
    e.close();
  }
});

// research.md §1 (guardrail de origen): el revert genérico de 012 nunca debe
// tocar una Justificación-espejo de vacaciones.
test('DELETE /api/justificaciones sobre un día de una Asignación de Vacaciones vigente → 409 JUSTIFICACION_ES_VACACIONES', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaInicio = fechaDelMes(5);
    const asignar = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio, cantidadDias: 3, autor: 'rrhh' }),
    });
    assert.equal(asignar.status, 200);

    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: fechaInicio, autor: 'x' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_ES_VACACIONES');
  } finally {
    e.close();
  }
});

// US2 (FR-008/FR-009).
const PADRON_US2 = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez', fechaIngreso: '2018-03-01' },
  { legajo: 2, categoria: 'ADMIN', nombre: 'Beto Sin Ingreso', fechaIngreso: null },
];

// spec 015 (US3, T036): estos endpoints aplican el incremento perezoso antes
// de responder — un legajo con fechaIngreso real puede recibir un
// incremento automático al primer GET/POST. Se calcula acá el mismo pendiente
// que debería aplicar el servicio (misma config/hoy), para no hardcodear un
// número que dependa de la fecha real de ejecución de la suite.
function totalIncrementoPendiente(fechaIngreso) {
  const config = loadVacacionesConfig('./config/vacaciones.json');
  const pendientes = calcularIncrementosPendientes({
    fechaIngreso,
    ultimoIncrementoAplicado: null,
    escalaAntiguedad: config.escalaAntiguedad,
    incrementoAnualConfig: config.incrementoAnual,
    hoy: hoyLocal(),
  });
  return pendientes.reduce((acc, c) => acc + c.dias, 0);
}

test('GET /api/vacaciones → 200, lista antigüedad/saldo/próximo incremento; legajo sin fechaIngreso queda pendiente (US2)', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON_US2, clasificaciones: {}, incluirMesSiguiente: true });
  try {
    await seedSaldo(e.repoDir, 1, 5);
    const res = await fetch(`${e.base}/api/vacaciones`);
    assert.equal(res.status, 200);
    const { legajos } = await res.json();

    const legajo1 = legajos.find((l) => l.legajo === 1);
    assert.equal(legajo1.fechaIngreso, '2018-03-01');
    assert.equal(legajo1.saldo, 5 + totalIncrementoPendiente('2018-03-01'));
    assert.equal(legajo1.pendienteFechaIngreso, false);
    assert.ok(Number.isInteger(legajo1.antiguedadAnios));
    assert.match(legajo1.proximoIncremento, /^\d{4}-\d{2}-\d{2}$/);

    const legajo2 = legajos.find((l) => l.legajo === 2);
    assert.equal(legajo2.fechaIngreso, null);
    assert.equal(legajo2.antiguedadAnios, null);
    assert.equal(legajo2.proximoIncremento, null);
    assert.equal(legajo2.pendienteFechaIngreso, true, 'Acceptance Scenario US2.3');
    assert.equal(legajo2.saldo, 0, 'legajo nuevo sin movimientos: saldo implícito 0');
  } finally {
    e.close();
  }
});

test('GET /api/vacaciones/{legajo} → 200, historial de movimientos y asignaciones (US2, Acceptance Scenario 2)', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON_US2, clasificaciones: {}, incluirMesSiguiente: true });
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const fechaInicio = fechaDelMes(5);
    await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio, cantidadDias: 3, autor: 'rrhh' }),
    });

    const res = await fetch(`${e.base}/api/vacaciones/1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const incremento = totalIncrementoPendiente('2018-03-01');
    assert.equal(body.legajo, 1);
    assert.equal(body.saldo, 7 + incremento);
    assert.equal(body.movimientos.length, incremento === 0 ? 1 : 2);
    const asignacion = body.movimientos.find((m) => m.tipo === 'asignacion');
    assert.equal(asignacion.dias, -3);
    assert.equal(asignacion.saldoResultante, 7 + incremento);
    assert.equal(body.asignaciones.length, 1);
    assert.equal(body.asignaciones[0].vigente, true);
  } finally {
    e.close();
  }
});

// US4 (FR-014/FR-015).
test('DELETE /api/vacaciones/asignaciones/{id} → 200, repone el saldo (US4, Acceptance Scenario 1)', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 7);
    const fechaInicio = fechaDelMes(5);
    const asignar = await (
      await fetch(`${e.base}/api/vacaciones/asignaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legajo: 1, fechaInicio, cantidadDias: 5, autor: 'rrhh' }),
      })
    ).json();
    assert.equal(asignar.saldoResultante, 2);

    const res = await fetch(`${e.base}/api/vacaciones/asignaciones/${asignar.asignacionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: 'rrhh.mgomez' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, asignar.asignacionId);
    assert.equal(body.revertida, true);
    assert.equal(body.saldoResultante, 7);
  } finally {
    e.close();
  }
});

test('DELETE /api/vacaciones/asignaciones/{id} sobre un id inexistente o ya revertido → 404 VACACIONES_NO_ENCONTRADA (US4, Acceptance Scenario 2)', async () => {
  const e = await entorno();
  try {
    const resInexistente = await fetch(`${e.base}/api/vacaciones/asignaciones/no-existe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: 'x' }),
    });
    assert.equal(resInexistente.status, 404);
    assert.equal((await resInexistente.json()).error.codigo, 'VACACIONES_NO_ENCONTRADA');

    await seedSaldo(e.repoDir, 1, 5);
    const asignar = await (
      await fetch(`${e.base}/api/vacaciones/asignaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 2, autor: 'rrhh' }),
      })
    ).json();
    await fetch(`${e.base}/api/vacaciones/asignaciones/${asignar.asignacionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: 'x' }),
    });

    const resYaRevertida = await fetch(`${e.base}/api/vacaciones/asignaciones/${asignar.asignacionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autor: 'x' }),
    });
    assert.equal(resYaRevertida.status, 404);
    assert.equal((await resYaRevertida.json()).error.codigo, 'VACACIONES_NO_ENCONTRADA');
  } finally {
    e.close();
  }
});
