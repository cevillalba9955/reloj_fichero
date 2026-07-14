import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearApp } from '../../src/web/server.js';
import { generarCalendario } from '../../src/presentismo/domain/calendario-mes.js';
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
