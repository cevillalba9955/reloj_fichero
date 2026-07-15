import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearApp } from '../../src/web/server.js';
import {
  generarCalendario,
  periodoAnterior,
  periodoSiguiente,
} from '../../src/presentismo/domain/calendario-mes.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// T012 (feature 007) — Contrato de los GET de la API de calendario.
// Ver contracts/web-api.md.

const ESQUEMA = new Set([1, 2, 3, 4, 5]);
let repoDir;
let logDir;
let server;
let base;

async function sembrarCalendario(periodo) {
  const repo = createFilePresentismoRepository({ repoDir });
  await repo.guardarCalendario(generarCalendario(periodo, ESQUEMA));
}

before(async () => {
  repoDir = mkdtempSync(join(tmpdir(), 'web-repo-'));
  logDir = mkdtempSync(join(tmpdir(), 'web-log-'));
  await sembrarCalendario('202606');
  await sembrarCalendario('202607');
  const env = {
    PRESENTISMO_REPO_DIR: repoDir,
    PRESENTISMO_LOG_DIR: logDir,
    PRESENTISMO_CATEGORIAS_CONFIG: './config/categorias.json',
  };
  const app = crearApp({ env });
  server = createServer((req, res) => app(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server?.close();
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(logDir, { recursive: true, force: true });
});

test('GET /api/calendarios devuelve periodos ordenados y el último', async () => {
  const res = await fetch(`${base}/api/calendarios`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.periodos, ['202606', '202607']);
  assert.equal(body.ultimo, '202607');
});

// T006 (feature 008) — el GET expone mesActual y la frontera generable.
test('GET /api/calendarios expone mesActual y generables contiguos', async () => {
  const res = await fetch(`${base}/api/calendarios`);
  const body = await res.json();
  assert.match(body.mesActual, /^\d{6}$/, 'mesActual es YYYYMM');
  assert.ok(Array.isArray(body.generables), 'generables es un array');

  const min = body.periodos[0];
  const max = body.periodos[body.periodos.length - 1];
  // Backfill: min-1 siempre está entre los generables.
  assert.ok(body.generables.includes(periodoAnterior(min)), 'incluye min-1 (backfill)');
  // Frontera hacia adelante: max+1 solo si no es futuro respecto de mesActual.
  const siguiente = periodoSiguiente(max);
  assert.equal(
    body.generables.includes(siguiente),
    siguiente <= body.mesActual,
    'incluye max+1 solo si no es futuro',
  );
  // Ningún generable ya está generado.
  for (const g of body.generables) {
    assert.ok(!body.periodos.includes(g), `generable ${g} no está ya generado`);
  }
  // Orden ascendente.
  assert.deepEqual(body.generables, [...body.generables].sort(), 'generables ordenados');
});

test('GET /api/calendarios/:periodo devuelve la VistaCalendarioMes con todos los días', async () => {
  const res = await fetch(`${base}/api/calendarios/202607`);
  assert.equal(res.status, 200);
  const v = await res.json();
  assert.equal(v.periodo, '202607');
  assert.equal(v.anio, 2026);
  assert.equal(v.mes, 7);
  assert.equal(v.esUltimoGenerado, true);
  assert.equal(v.dias.length, 31);
  assert.equal(v.dias[0].dd, 1);
  // periodoActivo = mes completo (Tramo Mes).
  assert.equal(v.periodoActivo.tramo, 'Mes');
  assert.equal(v.periodoActivo.desde, '2026-07-01');
  assert.equal(v.periodoActivo.hasta, '2026-07-31');
  assert.ok(v.dias.every((d) => d.enPeriodoActivo === true));
  // Leyenda con las 5 claves.
  assert.equal(v.leyenda.length, 5);
});

test('GET /api/calendarios/:periodo — cada día expone resaltado y clasificación (sin datos personales)', async () => {
  const res = await fetch(`${base}/api/calendarios/202607`);
  const v = await res.json();
  const serial = JSON.stringify(v);
  // FR-014: ninguna respuesta contiene legajos, nombres ni fichadas.
  assert.ok(!/legajo|nombre|fichada/i.test(serial));
  for (const d of v.dias) {
    assert.ok(['habil', 'no-laborable', 'feriado'].includes(d.resaltado));
    assert.ok(['Laborable', 'No Laborable', 'Feriado'].includes(d.clasificacion));
    assert.equal(typeof d.diaSemana, 'number');
  }
});

test('GET de un mes pasado → hoy es null (la fecha actual no cae en el mes)', async () => {
  await sembrarCalendario('202001');
  const res = await fetch(`${base}/api/calendarios/202001`);
  const v = await res.json();
  assert.equal(v.hoy, null);
});

test('GET /api/calendarios/:periodo inexistente → 404 CALENDARIO_NO_GENERADO', async () => {
  const res = await fetch(`${base}/api/calendarios/209912`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.codigo, 'CALENDARIO_NO_GENERADO');
});

test('GET /api/calendarios/:periodo mal formado → 400 PERIODO_INVALIDO', async () => {
  const res = await fetch(`${base}/api/calendarios/2026-7`);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.codigo, 'PERIODO_INVALIDO');
});

// ---------------------------------------------------------------------------
// Feature 008 — POST /api/calendarios/:periodo/generar (contigüidad).
// Servidores por-test con períodos anclados al mesActual del servidor, para que
// las guardas sean deterministas en cualquier reloj.
// ---------------------------------------------------------------------------

function mesActual() {
  const n = new Date();
  return `${String(n.getFullYear()).padStart(4, '0')}${String(n.getMonth() + 1).padStart(2, '0')}`;
}

async function crearServidorConPeriodos(periodos) {
  const dir = mkdtempSync(join(tmpdir(), 'web-gen-repo-'));
  const lg = mkdtempSync(join(tmpdir(), 'web-gen-log-'));
  const repo = createFilePresentismoRepository({ repoDir: dir });
  for (const p of periodos) await repo.guardarCalendario(generarCalendario(p, ESQUEMA));
  const env = {
    PRESENTISMO_REPO_DIR: dir,
    PRESENTISMO_LOG_DIR: lg,
    PRESENTISMO_CATEGORIAS_CONFIG: './config/categorias.json',
  };
  const app = crearApp({ env });
  const srv = createServer((req, res) => app(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
  await new Promise((r) => srv.listen(0, r));
  const b = `http://localhost:${srv.address().port}`;
  return {
    base: b,
    close() {
      srv.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(lg, { recursive: true, force: true });
    },
  };
}

// T008 (US1) — generación de un período generable y idempotencia.
test('POST /generar sobre un período generable → 200 y la vista del mes', async () => {
  const semilla = mesActual();
  const s = await crearServidorConPeriodos([semilla]);
  try {
    const generable = periodoAnterior(semilla); // backfill min-1, siempre generable
    const res = await fetch(`${s.base}/api/calendarios/${generable}/generar`, { method: 'POST' });
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.periodo, generable);
    assert.equal(v.dias.length > 0, true);
    // El GET siguiente refleja la secuencia extendida.
    const lista = await (await fetch(`${s.base}/api/calendarios`)).json();
    assert.ok(lista.periodos.includes(generable));
  } finally {
    s.close();
  }
});

test('POST /generar sobre un período ya generado → 200 idempotente (sin duplicar)', async () => {
  const semilla = mesActual();
  const s = await crearServidorConPeriodos([semilla]);
  try {
    const antes = await (await fetch(`${s.base}/api/calendarios`)).json();
    const res = await fetch(`${s.base}/api/calendarios/${semilla}/generar`, { method: 'POST' });
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.periodo, semilla);
    const despues = await (await fetch(`${s.base}/api/calendarios`)).json();
    assert.deepEqual(despues.periodos, antes.periodos, 'la secuencia no cambia');
  } finally {
    s.close();
  }
});

// T014 (US2) — guardas de contigüidad y de futuro.
test('POST /generar sobre un período no contiguo → 409 PERIODO_NO_CONTIGUO', async () => {
  const semilla = mesActual();
  const s = await crearServidorConPeriodos([semilla]);
  try {
    // mesActual-3: es ≤ mesActual pero deja un hueco respecto de [semilla].
    const noContiguo = periodoAnterior(periodoAnterior(periodoAnterior(semilla)));
    const res = await fetch(`${s.base}/api/calendarios/${noContiguo}/generar`, { method: 'POST' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.codigo, 'PERIODO_NO_CONTIGUO');
    // No se generó nada.
    const lista = await (await fetch(`${s.base}/api/calendarios`)).json();
    assert.ok(!lista.periodos.includes(noContiguo));
  } finally {
    s.close();
  }
});

test('POST /generar sobre un período futuro → 409 PERIODO_FUTURO', async () => {
  const semilla = mesActual();
  const s = await crearServidorConPeriodos([semilla]);
  try {
    const futuro = periodoSiguiente(periodoSiguiente(semilla)); // mesActual+2
    const res = await fetch(`${s.base}/api/calendarios/${futuro}/generar`, { method: 'POST' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.codigo, 'PERIODO_FUTURO');
  } finally {
    s.close();
  }
});

test('POST /generar con :periodo mal formado → 400 PERIODO_INVALIDO', async () => {
  const s = await crearServidorConPeriodos([mesActual()]);
  try {
    const res = await fetch(`${s.base}/api/calendarios/2026-7/generar`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.codigo, 'PERIODO_INVALIDO');
  } finally {
    s.close();
  }
});
