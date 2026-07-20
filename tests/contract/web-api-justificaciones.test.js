import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  fechaDelMesSiguiente,
} from '../helpers/fichadas-hoy-entorno.js';

// T013/T022/T027 (feature 012) — Contrato de GET /api/motivos-ausencia,
// POST /api/justificaciones y DELETE /api/justificaciones. Ver
// specs/012-justificacion-ausencias/contracts/web-api.md.

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' },
  { legajo: 9, categoria: 'CATEGORIA_INEXISTENTE', nombre: 'Zoe Anomalía' },
];

const FECHA_SIN_FICHADAS = fechaDelMes(3);
const FECHA_CON_FICHADAS = fechaDelMes(1);
const FECHA_NO_LABORABLE = fechaDelMes(4);
const FECHA_FUTURA = fechaDelMesSiguiente(2);

function entorno(extra = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: {
      [FECHA_SIN_FICHADAS]: 'Laborable',
      [FECHA_CON_FICHADAS]: 'Laborable',
      [FECHA_NO_LABORABLE]: 'No Laborable',
      [FECHA_FUTURA]: 'Laborable',
    },
    fichadas: [{ legajo: 1, fecha: FECHA_CON_FICHADAS, hora: '07:05:00' }],
    incluirMesSiguiente: true,
    ...extra,
  });
}

test('GET /api/motivos-ausencia → 200 con el catálogo de 9 motivos activos', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/motivos-ausencia`);
    assert.equal(res.status, 200);
    const { motivos } = await res.json();
    assert.equal(motivos.length, 9);
    const vacaciones = motivos.find((m) => m.id === 'vacaciones');
    assert.equal(vacaciones.tipoPago, 'Paga');
    const sinAviso = motivos.find((m) => m.id === 'sin_aviso');
    assert.equal(sinAviso.tipoPago, 'No paga');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones — día único Sin fichadas → 200 registrada Paga', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS, motivoId: 'enfermedad', autor: 'rrhh' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.registradas.length, 1);
    assert.equal(body.registradas[0].tipoPago, 'Paga');
    assert.deepEqual(body.omitidas, []);
    assert.deepEqual(body.noAplicables, []);
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones sin motivoId → 400 JUSTIFICACION_INVALIDA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones con motivoId inexistente → 400 JUSTIFICACION_INVALIDA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS, motivoId: 'no_existe' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones sobre día único con fichadas → 409 JUSTIFICACION_NO_APLICABLE', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_CON_FICHADAS, motivoId: 'vacaciones' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_NO_APLICABLE');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones sobre día único No Laborable → 409 JUSTIFICACION_NO_APLICABLE', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_NO_LABORABLE, motivoId: 'vacaciones' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_NO_APLICABLE');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones — período sin calendario generado → 404 CALENDARIO_NO_GENERADO', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: '2099-01-05', motivoId: 'vacaciones' }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'CALENDARIO_NO_GENERADO');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones — legajo sin categoría configurada → 409 EMPLEADO_SIN_CATEGORIA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 9, fecha: FECHA_SIN_FICHADAS, motivoId: 'vacaciones' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'EMPLEADO_SIN_CATEGORIA');
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones sobre un día futuro → 200 registrada (licencia planificada)', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_FUTURA, motivoId: 'vacaciones' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.registradas[0].fecha, FECHA_FUTURA);
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones con rango → registra Laborables, omite No Laborable, informa no aplicables', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legajo: 1,
        fecha: FECHA_SIN_FICHADAS,
        hasta: FECHA_NO_LABORABLE,
        motivoId: 'vacaciones',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.registradas.length >= 1);
    assert.ok(body.omitidas.some((o) => o.fecha === FECHA_NO_LABORABLE && o.razon === 'NO_LABORABLE'));
  } finally {
    e.close();
  }
});

test('POST /api/justificaciones — rango sin ningún día elegible → 409 RANGO_SIN_DIAS_ELEGIBLES', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legajo: 1,
        fecha: FECHA_NO_LABORABLE,
        hasta: FECHA_NO_LABORABLE,
        motivoId: 'vacaciones',
      }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'RANGO_SIN_DIAS_ELEGIBLES');
  } finally {
    e.close();
  }
});

test('DELETE /api/justificaciones revierte la vigente → 200; segunda vez → 404', async () => {
  const e = await entorno();
  try {
    await fetch(`${e.base}/api/justificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS, motivoId: 'vacaciones' }),
    });
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS, autor: 'rrhh' }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { fecha: FECHA_SIN_FICHADAS, revertida: true });

    const res2 = await fetch(`${e.base}/api/justificaciones`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fecha: FECHA_SIN_FICHADAS }),
    });
    assert.equal(res2.status, 404);
    assert.equal((await res2.json()).error.codigo, 'JUSTIFICACION_NO_ENCONTRADA');
  } finally {
    e.close();
  }
});

test('DELETE /api/justificaciones sin legajo/fecha → 400 JUSTIFICACION_INVALIDA', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/justificaciones`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'JUSTIFICACION_INVALIDA');
  } finally {
    e.close();
  }
});
