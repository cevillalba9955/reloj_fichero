import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  fechaDelMesSiguiente,
} from '../helpers/fichadas-hoy-entorno.js';

// T014/T028/T033 (feature 012) — Integración: registrar (día/rango, Paga/No
// paga), revertir y volver a cargar, y los edge cases de fichadas tardías y
// reclasificación sobre un día justificado.

const PADRON = [{ legajo: 1, categoria: 'ADMIN', nombre: 'Carla Justificada' }];

const FECHA_PAGA = fechaDelMes(3);
const FECHA_NO_PAGA = fechaDelMes(6);

function entorno(extra = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA_PAGA]: 'Laborable', [FECHA_NO_PAGA]: 'Laborable' },
    ...extra,
  });
}

async function post(base, path, body, method = 'POST') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('US1: Justificación Paga acredita jornada esperada; No paga sigue en saldo negativo', async () => {
  const e = await entorno();
  try {
    await post(e.base, '/api/justificaciones', { legajo: 1, fecha: FECHA_PAGA, motivoId: 'enfermedad' });
    await post(e.base, '/api/justificaciones', { legajo: 1, fecha: FECHA_NO_PAGA, motivoId: 'sin_aviso' });

    const detalle = (await (await fetch(`${e.base}/api/resumen-periodo/1`)).json()).dias;
    const paga = detalle.find((d) => d.fecha === FECHA_PAGA);
    const noPaga = detalle.find((d) => d.fecha === FECHA_NO_PAGA);
    assert.equal(paga.horas, 540, 'Paga acredita la jornada esperada completa (minutos)');
    assert.equal(noPaga.horas, 0);

    const fila = (await (await fetch(`${e.base}/api/resumen-periodo`)).json()).filas.find((f) => f.legajo === 1);
    assert.equal(fila.licencia, 1);
    assert.ok(fila.ausencias >= 1, 'la No paga sigue contando dentro de ausencias, no en licencia');
  } finally {
    e.close();
  }
});

test('US1 + US3: rango de fechas futuras y reversión con recarga posterior', async () => {
  const e = await entorno({ incluirMesSiguiente: true });
  const desde = fechaDelMesSiguiente(2);
  const hasta = fechaDelMesSiguiente(3);
  try {
    const { status, body } = await post(e.base, '/api/justificaciones', {
      legajo: 1,
      fecha: desde,
      hasta,
      motivoId: 'examen',
    });
    assert.equal(status, 200);
    assert.ok(body.registradas.length >= 1);

    // US3: revertir uno de los días registrados y volver a cargar otro motivo.
    const primerDia = body.registradas[0].fecha;
    const del = await post(e.base, '/api/justificaciones', { legajo: 1, fecha: primerDia, autor: 'x' }, 'DELETE');
    assert.equal(del.status, 200);

    const recarga = await post(e.base, '/api/justificaciones', {
      legajo: 1,
      fecha: primerDia,
      motivoId: 'matrimonio',
    });
    assert.equal(recarga.status, 200, 'tras revertir se puede cargar un motivo nuevo sobre el mismo día (FR-009)');
    assert.equal(recarga.body.registradas[0].motivoId, 'matrimonio');
  } finally {
    e.close();
  }
});

test('edge case: fichadas que llegan después de justificar señalan requiereJustificacionRevision', async () => {
  const e = await entorno();
  try {
    await post(e.base, '/api/justificaciones', { legajo: 1, fecha: FECHA_PAGA, motivoId: 'enfermedad' });
    e.agregarFichadas([{ legajo: 1, fecha: FECHA_PAGA, hora: '07:10:00' }]);

    const detalle = (await (await fetch(`${e.base}/api/resumen-periodo/1`)).json()).dias;
    const dia = detalle.find((d) => d.fecha === FECHA_PAGA);
    assert.equal(dia.requiereJustificacionRevision, true, 'se señala en vez de descartar en silencio');
    assert.ok(dia.justificacion, 'la Justificación original sigue visible');
  } finally {
    e.close();
  }
});

test('DELETE sobre un día sin Justificación vigente → 404, no rompe el resumen', async () => {
  const e = await entorno();
  try {
    const del = await post(e.base, '/api/justificaciones', { legajo: 1, fecha: FECHA_PAGA }, 'DELETE');
    assert.equal(del.status, 404);
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    assert.equal(res.status, 200);
  } finally {
    e.close();
  }
});
