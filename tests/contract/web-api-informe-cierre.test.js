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

// ===========================================================================
// 022-informe-primera-quincena-anticipado — emitir el informe de la primera
// quincena (tramo Q1) manualmente sobre un mes QUINCENAL todavía ABIERTO, una
// vez terminada la primera quincena. Ver
// specs/022-informe-primera-quincena-anticipado/contracts/web-api.md.
// ===========================================================================

// `PRESENTISMO_HOY` fija la fecha del servidor para ejercitar la "ventana
// anticipada" de forma determinista, sin depender de en qué día corra la suite.
const HOY_Q1_TERMINADA = `${PER.slice(0, 4)}-${PER.slice(4, 6)}-20`; // día 20: Q1 ya terminó
const HOY_Q1_EN_CURSO = `${PER.slice(0, 4)}-${PER.slice(4, 6)}-10`; // día 10: Q1 en curso
const ENV_ANTICIPADO = { ...ENV_QUINCENAL, PRESENTISMO_HOY: HOY_Q1_TERMINADA };

// caso 19 + 20
test('022 QUINCENAL: POST ?tramo=Q1 sobre período ABIERTO con Q1 terminada → 200 anticipado; GET lo devuelve', async () => {
  const e = await entorno({ envExtra: ENV_ANTICIPADO });
  try {
    const post = await fetch(ruta(e.base, 'Q1'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ autor: 'ana' }),
    });
    assert.equal(post.status, 200);
    const v = await post.json();
    assert.equal(v.sello.tramo, 'Q1');
    assert.equal(v.sello.anticipado, true);
    assert.equal(v.sello.modo, 'manual');
    assert.equal(v.periodoId, `${PER}-Q1`);
    assert.equal(v.obsoleto, false);
    assert.ok(Array.isArray(v.resumen.filas) && v.resumen.filas.length === 2);
    assert.ok(Array.isArray(v.detalle.secciones) && v.detalle.secciones.length === 2);
    assert.ok(v.pendientes && typeof v.pendientes.hayPendientes === 'boolean');
    assert.equal(v.resumen.encabezado.rangoFechas.desde, `${PER.slice(0, 4)}-${PER.slice(4, 6)}-01`);
    assert.equal(v.resumen.encabezado.rangoFechas.hasta, `${PER.slice(0, 4)}-${PER.slice(4, 6)}-15`);

    const get = await fetch(ruta(e.base, 'Q1'));
    assert.equal(get.status, 200);
    const g = await get.json();
    assert.equal(g.sello.anticipado, true);
    assert.equal(g.obsoleto, false);
  } finally {
    e.close();
  }
});

// caso 26 — cuadre del informe anticipado de Q1 vs. "Resumen del Período"
test('022 QUINCENAL: informe anticipado de Q1 cuadra con /resumen-periodo?periodo=<PER>-Q1', async () => {
  const F_Q1 = fechaDelMes(2);
  const e = await entorno({
    envExtra: ENV_ANTICIPADO,
    clasificaciones: { [F_Q1]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: F_Q1, hora: '07:05:00' }],
  });
  try {
    const post = await fetch(ruta(e.base, 'Q1'), { method: 'POST' });
    assert.equal(post.status, 200);
    const inf = await post.json();
    const rp = await fetch(`${e.base}/api/resumen-periodo?periodo=${PER}-Q1`).then((r) => r.json());

    const CONT = ['horasTrabajadas', 'completas', 'incompletas', 'ausencias', 'llegadasTarde', 'retirosAnticipados'];
    for (const filaInf of inf.resumen.filas) {
      const filaRp = rp.filas.find((f) => f.legajo === filaInf.legajo);
      assert.ok(filaRp, `resumen-periodo tiene el legajo ${filaInf.legajo}`);
      for (const c of CONT) {
        assert.equal(filaInf[c] ?? 0, filaRp[c] ?? 0, `legajo ${filaInf.legajo}, contador ${c}`);
      }
    }
    // cuadre interno (SC-002 / SC-003)
    const suma = inf.resumen.filas.reduce((s, f) => s + f.horasTrabajadas, 0);
    assert.equal(Math.round(suma * 100) / 100, inf.resumen.encabezado.totalHoras);
    for (const seccion of inf.detalle.secciones) {
      const fila = inf.resumen.filas.find((f) => f.legajo === seccion.legajo);
      assert.equal(seccion.subtotalHoras, fila.horasTrabajadas, `legajo ${seccion.legajo}`);
    }
  } finally {
    e.close();
  }
});

// caso 26b — padrón completo y pendientes de los días 1–15 (SC-004 / SC-005)
test('022 QUINCENAL: el informe anticipado cubre todo el padrón y señala los pendientes de Q1', async () => {
  const F_CORR = fechaDelMes(1); // siempre vencido (navegable)
  const F_INCOMPLETA = fechaDelMes(2);
  const e = await entorno({
    envExtra: ENV_ANTICIPADO,
    clasificaciones: { [F_CORR]: 'Laborable', [F_INCOMPLETA]: 'Laborable' },
    // legajo 1: día 2 sólo entrada (jornada incompleta); día 1 sin fichada
    fichadas: [{ legajo: 1, fecha: F_INCOMPLETA, hora: '07:05:00' }],
  });
  try {
    // legajo 1: corrección sobre el día 1 (queda como día con ajuste)
    const corr = await fetch(`${e.base}/api/fichadas-hoy/correcciones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        legajo: 1,
        fecha: F_CORR,
        entrada: '08:00',
        salida: '16:00',
        autor: 'ana',
        motivo: 'olvido de fichada',
      }),
    });
    assert.ok(corr.status === 200 || corr.status === 201, `corrección aplicada (status ${corr.status})`);

    const inf = await fetch(ruta(e.base, 'Q1'), { method: 'POST' }).then((r) => r.json());

    // padrón completo, sin omisiones ni duplicados (SC-004)
    assert.equal(inf.resumen.filas.length, PADRON.length);
    const legajos = inf.resumen.filas.map((f) => f.legajo).sort();
    assert.deepEqual(legajos, [...new Set(legajos)].sort());

    // pendientes de Q1 (SC-005): jornada incompleta, día con ajuste y anomalía
    assert.equal(inf.pendientes.hayPendientes, true);
    assert.ok(
      inf.pendientes.jornadasIncompletas.some((p) => p.legajo === 1 && p.fechas.includes(F_INCOMPLETA)),
      'la jornada incompleta del legajo 1 figura en pendientes',
    );
    assert.ok(
      inf.pendientes.ajustes.some((p) => p.legajo === 1 && p.fechas.includes(F_CORR)),
      'el día con corrección del legajo 1 figura en pendientes',
    );
    assert.ok(
      inf.pendientes.anomalias.some((p) => p.legajo === 9),
      'el empleado sin categoría (legajo 9) figura como anomalía',
    );
  } finally {
    e.close();
  }
});

// caso 21 — la primera quincena todavía no terminó
test('022 QUINCENAL: POST ?tramo=Q1 con Q1 EN CURSO → 409 QUINCENA_EN_CURSO y no escribe nada', async () => {
  const e = await entorno({ envExtra: { ...ENV_QUINCENAL, PRESENTISMO_HOY: HOY_Q1_EN_CURSO } });
  try {
    const res = await fetch(ruta(e.base, 'Q1'), { method: 'POST' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'QUINCENA_EN_CURSO');
    const get = await fetch(ruta(e.base, 'Q1'));
    assert.equal(get.status, 404);
    assert.equal((await get.json()).error.codigo, 'INFORME_NO_EMITIDO');
  } finally {
    e.close();
  }
});

// caso 22 + 23 + 24 — fuera de la ventana anticipada
test('022: ?tramo=Q2 / sin tramo sobre período abierto → 409 PERIODO_ABIERTO; MENSUAL ?tramo=Q1 → 400', async () => {
  const q = await entorno({ envExtra: ENV_ANTICIPADO });
  try {
    const q2 = await fetch(ruta(q.base, 'Q2'), { method: 'POST' });
    assert.equal(q2.status, 409);
    assert.equal((await q2.json()).error.codigo, 'PERIODO_ABIERTO');

    const sin = await fetch(ruta(q.base), { method: 'POST' });
    assert.equal(sin.status, 409);
    assert.equal((await sin.json()).error.codigo, 'PERIODO_ABIERTO');
  } finally {
    q.close();
  }

  const m = await entorno({ envExtra: { PRESENTISMO_HOY: HOY_Q1_TERMINADA } }); // MENSUAL
  try {
    const res = await fetch(ruta(m.base, 'Q1'), { method: 'POST' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PERIODO_INVALIDO');
  } finally {
    m.close();
  }
});

// caso 25 — rol lector no puede emitir el informe anticipado; sí puede leerlo
test('022: POST ?tramo=Q1 anticipado con rol lector → 403 ACCESO_DENEGADO', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'acl-informe-q1-'));
  const rolesPath = join(raiz, 'roles.json');
  writeFileSync(rolesPath, JSON.stringify({ rolPorDefecto: 'lector', mapeo: {} }), 'utf8');
  const e = await entorno({ envExtra: { ...ENV_ANTICIPADO, ACL_ROLES_CONFIG: rolesPath } });
  try {
    const denegado = await fetch(ruta(e.base, 'Q1'), { method: 'POST' });
    assert.equal(denegado.status, 403);
    assert.equal((await denegado.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('022: GET ?tramo=Q1 de una copia anticipada ya emitida → 200 (lectura abierta)', async () => {
  const e = await entorno({ envExtra: ENV_ANTICIPADO });
  try {
    const emit = await fetch(ruta(e.base, 'Q1'), { method: 'POST' });
    assert.equal(emit.status, 200);
    const get = await fetch(ruta(e.base, 'Q1')); // sin header de rol
    assert.equal(get.status, 200);
    assert.equal((await get.json()).sello.anticipado, true);
  } finally {
    e.close();
  }
});

// caso 28 + 30 + 30b — re-emisión; emitir no bloquea correcciones; re-emitir refleja el cambio
test('022: re-emitir anticipado (idempotente sin cambios) y reflejar una corrección posterior', async () => {
  const F_CORR = fechaDelMes(1); // siempre vencido (navegable)
  const e = await entorno({
    envExtra: ENV_ANTICIPADO,
    clasificaciones: { [F_CORR]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: F_CORR, hora: '08:00:00' }], // sólo entrada → 0 horas
  });
  try {
    const v1 = await fetch(ruta(e.base, 'Q1'), { method: 'POST' }).then((r) => r.json());
    const v2 = await fetch(ruta(e.base, 'Q1'), { method: 'POST' }).then((r) => r.json());
    // sin cambios intermedios: mismas cifras, sólo cambia el sello de emisión
    assert.equal(v2.sello.anticipado, true);
    assert.equal(v1.resumen.encabezado.totalHoras, v2.resumen.encabezado.totalHoras);
    assert.notEqual(v1.sello.emitidoEn, v2.sello.emitidoEn);

    const horasAntes = v2.resumen.filas.find((f) => f.legajo === 1).horasTrabajadas;

    // corrección sobre un día 1–15: NO se bloquea (el mes sigue abierto)
    const corr = await fetch(`${e.base}/api/fichadas-hoy/correcciones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        legajo: 1,
        fecha: F_CORR,
        entrada: '08:00',
        salida: '18:00',
        autor: 'ana',
        motivo: 'jornada extendida',
      }),
    });
    assert.ok(corr.status === 200 || corr.status === 201, `corrección aplicada (status ${corr.status})`);

    // sin re-emitir, la copia guardada sigue siendo la previa (no se auto-invalida)
    const sinReemitir = await fetch(ruta(e.base, 'Q1')).then((r) => r.json());
    assert.equal(sinReemitir.resumen.filas.find((f) => f.legajo === 1).horasTrabajadas, horasAntes);

    // re-emitir: la copia nueva refleja la corrección (SC-008)
    const v3 = await fetch(ruta(e.base, 'Q1'), { method: 'POST' }).then((r) => r.json());
    const horasDespues = v3.resumen.filas.find((f) => f.legajo === 1).horasTrabajadas;
    assert.ok(horasDespues > horasAntes, `re-emitir refleja el cambio (${horasAntes} → ${horasDespues})`);
  } finally {
    e.close();
  }
});

// caso 27 — al cerrar el mes, la copia anticipada de Q1 se reemplaza por la de cierre
test('022 QUINCENAL: cerrar el período reemplaza la copia anticipada de Q1 (anticipado=false)', async () => {
  const e = await entorno({ envExtra: ENV_ANTICIPADO });
  try {
    const anticipada = await fetch(ruta(e.base, 'Q1'), { method: 'POST' }).then((r) => r.json());
    assert.equal(anticipada.sello.anticipado, true);

    await cerrar(e);

    const q1 = await fetch(ruta(e.base, 'Q1')).then((r) => r.json());
    assert.equal(q1.sello.anticipado, false);
    assert.equal(q1.sello.modo, 'automatico');
    for (const tramo of ['Q2', 'Mes']) {
      const res = await fetch(ruta(e.base, tramo));
      assert.equal(res.status, 200, `GET ?tramo=${tramo}`);
    }
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
