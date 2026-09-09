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

// ===========================================================================
// 021-informe-asistencia-mensual — el informe mensual unificado (tramo `Mes`)
// también en instalaciones QUINCENAL. Ver
// specs/021-informe-asistencia-mensual/contracts/web-api.md.
// ===========================================================================

const ENV_QUINCENAL = { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' };
const PER = mesActualPeriodo();
const ruta = (base, tramo) =>
  `${base}/api/calendarios/${PER}/informe-cierre${tramo ? `?tramo=${tramo}` : ''}`;

// caso 10 + 11
test('021 QUINCENAL: POST y GET ?tramo=Mes sobre período cerrado → 200, sello.tramo="Mes", periodoId sin sufijo', async () => {
  const e = await entorno({ envExtra: ENV_QUINCENAL });
  try {
    await cerrar(e);
    const post = await fetch(ruta(e.base, 'Mes'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autor: 'ana' }),
    });
    assert.equal(post.status, 200);
    const v = await post.json();
    assert.equal(v.sello.tramo, 'Mes');
    assert.equal(v.periodoId, PER);
    assert.equal(v.obsoleto, false);
    assert.ok(Array.isArray(v.resumen.filas) && Array.isArray(v.detalle.secciones));
    assert.ok(v.pendientes && typeof v.pendientes.hayPendientes === 'boolean');

    const get = await fetch(ruta(e.base, 'Mes'));
    assert.equal(get.status, 200);
    const g = await get.json();
    assert.equal(g.periodoId, PER);
    assert.equal(g.obsoleto, false);
  } finally {
    e.close();
  }
});

// caso 13 — cerrar en QUINCENAL emite Q1, Q2 y Mes automáticamente
test('021 QUINCENAL: al cerrar el período quedan disponibles Q1, Q2 y Mes', async () => {
  const e = await entorno({ envExtra: ENV_QUINCENAL });
  try {
    await cerrar(e);
    for (const tramo of ['Q1', 'Q2', 'Mes']) {
      const res = await fetch(ruta(e.base, tramo));
      assert.equal(res.status, 200, `GET ?tramo=${tramo}`);
      assert.equal((await res.json()).sello.tramo, tramo);
    }
  } finally {
    e.close();
  }
});

// caso 12 + 18 — el mes unifica las quincenas y cuadra
test('021 QUINCENAL: Mes = Q1 + Q2 por empleado y contador, y cuadra resumen↔detalle', async () => {
  const F_Q1 = fechaDelMes(2); // primera quincena
  const F_Q2 = fechaDelMes(17); // segunda quincena
  const e = await entorno({
    envExtra: ENV_QUINCENAL,
    clasificaciones: { [F_Q1]: 'Laborable', [F_Q2]: 'Laborable' },
    fichadas: [
      { legajo: 1, fecha: F_Q1, hora: '07:05:00' },
      { legajo: 1, fecha: F_Q2, hora: '07:05:00' },
    ],
  });
  try {
    await cerrar(e);
    const [q1, q2, mes] = await Promise.all(
      ['Q1', 'Q2', 'Mes'].map((t) => fetch(ruta(e.base, t)).then((r) => r.json())),
    );

    const CONTADORES = [
      'horasTrabajadas',
      'completas',
      'incompletas',
      'ausencias',
      'llegadasTarde',
      'retirosAnticipados',
    ];
    for (const filaMes of mes.resumen.filas) {
      const f1 = q1.resumen.filas.find((f) => f.legajo === filaMes.legajo);
      const f2 = q2.resumen.filas.find((f) => f.legajo === filaMes.legajo);
      for (const c of CONTADORES) {
        assert.equal(
          Math.round((filaMes[c] ?? 0) * 100) / 100,
          Math.round(((f1[c] ?? 0) + (f2[c] ?? 0)) * 100) / 100,
          `legajo ${filaMes.legajo}, contador ${c}`,
        );
      }
    }

    // cuadre del propio informe mensual (SC-002 / SC-003)
    const suma = mes.resumen.filas.reduce((s, f) => s + f.horasTrabajadas, 0);
    assert.equal(Math.round(suma * 100) / 100, mes.resumen.encabezado.totalHoras);
    for (const seccion of mes.detalle.secciones) {
      const fila = mes.resumen.filas.find((f) => f.legajo === seccion.legajo);
      assert.equal(seccion.subtotalHoras, fila.horasTrabajadas, `legajo ${seccion.legajo}`);
    }
  } finally {
    e.close();
  }
});

// caso 14 — rol lector no puede emitir el informe mensual
test('021: POST ?tramo=Mes con rol lector → 403 ACCESO_DENEGADO', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'acl-informe-mes-'));
  const rolesPath = join(raiz, 'roles.json');
  writeFileSync(rolesPath, JSON.stringify({ rolPorDefecto: 'lector', mapeo: {} }), 'utf8');
  const e = await entorno({ envExtra: { ...ENV_QUINCENAL, ACL_ROLES_CONFIG: rolesPath } });
  try {
    const res = await fetch(ruta(e.base, 'Mes'), { method: 'POST' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
    rmSync(raiz, { recursive: true, force: true });
  }
});

// caso 15 — período abierto
test('021: POST ?tramo=Mes sobre período abierto → 409 PERIODO_ABIERTO', async () => {
  const e = await entorno({ envExtra: ENV_QUINCENAL });
  try {
    const res = await fetch(ruta(e.base, 'Mes'), { method: 'POST' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'PERIODO_ABIERTO');
  } finally {
    e.close();
  }
});

// caso 16 — valor de tramo no soportado
test('021 QUINCENAL: ?tramo con valor fuera de {Q1,Q2,Mes} → 400 PERIODO_INVALIDO', async () => {
  const e = await entorno({ envExtra: ENV_QUINCENAL });
  try {
    await cerrar(e);
    const res = await fetch(ruta(e.base, 'Trimestre'), { method: 'POST' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PERIODO_INVALIDO');
  } finally {
    e.close();
  }
});

// caso 17 — MENSUAL: ?tramo=Mes equivale a omitir el query
test('021 MENSUAL: GET ?tramo=Mes devuelve lo mismo que GET sin tramo', async () => {
  const e = await entorno();
  try {
    await cerrar(e);
    await fetch(ruta(e.base), { method: 'POST' }); // emite el Mes
    const [sinTramo, conMes] = await Promise.all([
      fetch(ruta(e.base)).then((r) => r.json()),
      fetch(ruta(e.base, 'Mes')).then((r) => r.json()),
    ]);
    assert.deepEqual(conMes, sinTramo);
  } finally {
    e.close();
  }
});

// US3 — reabrir invalida el informe mensual; volver a cerrar lo regenera
test('021 QUINCENAL: reabrir marca el informe mensual obsoleto; re-cerrar lo regenera', async () => {
  const e = await entorno({ envExtra: ENV_QUINCENAL });
  try {
    await cerrar(e);
    const reab = await fetch(`${e.base}/api/calendarios/${PER}/reabrir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autor: 'ana' }),
    });
    assert.equal(reab.status, 200);

    const obsoleto = await fetch(ruta(e.base, 'Mes')).then((r) => r.json());
    assert.equal(obsoleto.obsoleto, true);

    await cerrar(e);
    const fresco = await fetch(ruta(e.base, 'Mes')).then((r) => r.json());
    assert.equal(fresco.obsoleto, false);
  } finally {
    e.close();
  }
});
