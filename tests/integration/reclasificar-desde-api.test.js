import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearApp } from '../../src/web/server.js';
import { generarCalendario } from '../../src/presentismo/domain/calendario-mes.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// T029 (feature 007) — Integración: POST reclasificar persiste y el GET
// siguiente refleja el cambio; errores 400/404. Ver contracts/web-api.md.

const ESQUEMA = new Set([1, 2, 3, 4, 5]);
let repoDir;
let logDir;
let server;
let base;

before(async () => {
  repoDir = mkdtempSync(join(tmpdir(), 'web-recl-repo-'));
  logDir = mkdtempSync(join(tmpdir(), 'web-recl-log-'));
  const repo = createFilePresentismoRepository({ repoDir });
  await repo.guardarCalendario(generarCalendario('202607', ESQUEMA));
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

async function post(periodo, payload) {
  return fetch(`${base}/api/calendarios/${periodo}/reclasificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('POST reclasificar persiste y el GET refleja la nueva clasificación', async () => {
  const res = await post('202607', { fecha: '2026-07-06', clasificacion: 'Feriado', autor: 'ui:test' });
  assert.equal(res.status, 200);
  const v = await res.json();
  const dia = v.dias.find((d) => d.fecha === '2026-07-06');
  assert.equal(dia.clasificacion, 'Feriado');
  assert.equal(dia.resaltado, 'feriado');

  // El GET posterior también lo refleja.
  const res2 = await fetch(`${base}/api/calendarios/202607`);
  const v2 = await res2.json();
  assert.equal(v2.dias.find((d) => d.fecha === '2026-07-06').clasificacion, 'Feriado');

  // Persistido en disco con reclasificadoManual: true.
  const state = JSON.parse(readFileSync(join(repoDir, 'P202607', 'calendario.json'), 'utf8'));
  const persistido = state.calendario.dias.find((d) => d.fecha === '2026-07-06');
  assert.equal(persistido.clasificacion, 'Feriado');
  assert.equal(persistido.reclasificadoManual, true);
});

test('POST sobre un período sin calendario → 404', async () => {
  const res = await post('209912', { fecha: '2099-12-01', clasificacion: 'Feriado' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.codigo, 'CALENDARIO_NO_GENERADO');
});

test('POST con clasificación inválida → 400', async () => {
  const res = await post('202607', { fecha: '2026-07-07', clasificacion: 'Vacaciones' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.codigo, 'RECLASIFICACION_INVALIDA');
});

test('POST con fecha fuera del mes → 400', async () => {
  const res = await post('202607', { fecha: '2026-08-01', clasificacion: 'Feriado' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.codigo, 'RECLASIFICACION_INVALIDA');
});
