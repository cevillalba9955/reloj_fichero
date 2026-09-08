import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearEntornoFichadasHoy, fechaDelMes, mesActualPeriodo } from '../helpers/fichadas-hoy-entorno.js';

// 018-informe-cierre-periodo (T012 / T025 / T031) — Contrato de
// POST y GET /api/calendarios/:periodo/informe-cierre.
// Ver specs/018-informe-cierre-periodo/contracts/web-api.md.

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' },
  { legajo: 9, categoria: 'CATEGORIA_INEXISTENTE', nombre: 'Zoe Anomalía' },
];
const FECHA = fechaDelMes(1); // día 1 del mes en curso: siempre vencido

function entorno(opts = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
    ...opts,
  });
}

async function cerrar(e, periodo = mesActualPeriodo(), rol = null) {
  const headers = { 'content-type': 'application/json' };
  if (rol) headers['X-Apex-Rol'] = rol;
  const res = await fetch(`${e.base}/api/calendarios/${periodo}/cerrar`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ autor: 'ana' }),
  });
  assert.equal(res.status, 200, 'precondición: cerrar el período');
}

test('POST /informe-cierre sobre período abierto → 409 PERIODO_ABIERTO', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`, { method: 'POST' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'PERIODO_ABIERTO');
  } finally {
    e.close();
  }
});

test('POST /informe-cierre con rol lector → 403 ACCESO_DENEGADO', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'acl-informe-'));
  const rolesPath = join(raiz, 'roles.json');
  writeFileSync(rolesPath, JSON.stringify({ rolPorDefecto: 'lector', mapeo: {} }), 'utf8');
  const e = await entorno({ envExtra: { ACL_ROLES_CONFIG: rolesPath } });
  try {
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`, { method: 'POST' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('POST /informe-cierre con período mal formado → 400 PERIODO_INVALIDO', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/calendarios/2026-07/informe-cierre`, { method: 'POST' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PERIODO_INVALIDO');
  } finally {
    e.close();
  }
});

test('GET /informe-cierre de un período con calendario pero sin emitir → 404 INFORME_NO_EMITIDO', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'INFORME_NO_EMITIDO');
  } finally {
    e.close();
  }
});

test('POST /informe-cierre sobre período cerrado → 200 con sello, resumen, detalle y pendientes', async () => {
  const e = await entorno();
  try {
    await cerrar(e);
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autor: 'ana' }),
    });
    assert.equal(res.status, 200);
    const v = await res.json();

    assert.equal(v.periodoId, mesActualPeriodo());
    assert.equal(v.obsoleto, false);
    assert.equal(v.sello.modo, 'manual');
    assert.equal(v.sello.autor, 'ana');
    assert.ok(Array.isArray(v.resumen.filas) && v.resumen.filas.length === 2);
    assert.ok(Array.isArray(v.detalle.secciones) && v.detalle.secciones.length === 2);
    assert.ok(v.pendientes && typeof v.pendientes.hayPendientes === 'boolean');

    // Σ filas.horasTrabajadas === encabezado.totalHoras
    const suma = v.resumen.filas.reduce((s, f) => s + f.horasTrabajadas, 0);
    assert.equal(Math.round(suma * 100) / 100, v.resumen.encabezado.totalHoras);

    // el empleado sin categoría viene señalado como anomalía
    const fila9 = v.resumen.filas.find((f) => f.legajo === 9);
    assert.ok(fila9.anomalia);

    // sin datos biométricos en la respuesta
    assert.ok(!/rawHex|template|huella/i.test(JSON.stringify(v)));
  } finally {
    e.close();
  }
});

test('GET /informe-cierre tras el POST → 200 con la copia guardada', async () => {
  const e = await entorno();
  try {
    await cerrar(e);
    await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`, { method: 'POST' });
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.periodoId, mesActualPeriodo());
    assert.equal(v.obsoleto, false);
    assert.ok(v.sello.emitidoEn);
  } finally {
    e.close();
  }
});

test('cuadre resumen ↔ detalle: subtotalHoras de cada sección = horasTrabajadas de la fila del mismo legajo (SC-002)', async () => {
  const e = await entorno();
  try {
    await cerrar(e);
    const res = await fetch(`${e.base}/api/calendarios/${mesActualPeriodo()}/informe-cierre`, { method: 'POST' });
    const v = await res.json();
    for (const seccion of v.detalle.secciones) {
      const fila = v.resumen.filas.find((f) => f.legajo === seccion.legajo);
      assert.equal(seccion.subtotalHoras, fila.horasTrabajadas, `legajo ${seccion.legajo}`);
    }
  } finally {
    e.close();
  }
});
