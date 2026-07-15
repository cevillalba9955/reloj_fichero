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

// Feature 008 — Integración: flujo de generación contigua desde la API.
// La secuencia generada nunca deja huecos (FR-008). Los períodos se anclan al
// mesActual del servidor para que las guardas sean deterministas en cualquier reloj.

const ESQUEMA = new Set([1, 2, 3, 4, 5]);
let repoDir;
let logDir;
let server;
let base;

function mesActual() {
  const n = new Date();
  return `${String(n.getFullYear()).padStart(4, '0')}${String(n.getMonth() + 1).padStart(2, '0')}`;
}

before(async () => {
  repoDir = mkdtempSync(join(tmpdir(), 'web-genint-repo-'));
  logDir = mkdtempSync(join(tmpdir(), 'web-genint-log-'));
  // Repo vacío: se prueba desde el estado sin ningún calendario (semilla).
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

async function generar(periodo) {
  return fetch(`${base}/api/calendarios/${periodo}/generar`, { method: 'POST' });
}
async function lista() {
  return (await fetch(`${base}/api/calendarios`)).json();
}

// T009 (US1) — semilla y extensión contigua hacia atrás (backfill).
test('semilla: repo vacío ofrece solo el mes actual como generable', async () => {
  const l = await lista();
  assert.deepEqual(l.periodos, []);
  assert.equal(l.ultimo, null);
  assert.deepEqual(l.generables, [mesActual()], 'único generable = mes semilla');
});

test('flujo feliz: generar semilla y luego backfill mes-1 extiende la secuencia', async () => {
  const semilla = mesActual();
  // Generar la semilla (mes actual).
  let res = await generar(semilla);
  assert.equal(res.status, 200);
  let l = await lista();
  assert.deepEqual(l.periodos, [semilla]);

  // Backfill del mes anterior (contiguo hacia atrás).
  const anterior = periodoAnterior(semilla);
  res = await generar(anterior);
  assert.equal(res.status, 200);
  l = await lista();
  assert.deepEqual(l.periodos, [anterior, semilla], 'secuencia contigua sin huecos');
  // La nueva frontera hacia atrás es mes-2; hacia adelante mes+1 es futuro (excluido).
  assert.ok(l.generables.includes(periodoAnterior(anterior)));
  assert.ok(!l.generables.includes(periodoSiguiente(semilla)), 'mes+1 futuro no es generable');
});

// T015 (US2) — impedir saltos y validar backfill; la secuencia queda intacta.
test('saltar un mes hacia atrás es rechazado y no altera la secuencia', async () => {
  const l0 = await lista();
  const min = l0.periodos[0];
  const salto = periodoAnterior(periodoAnterior(min)); // min-2: deja un hueco
  const res = await generar(salto);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.codigo, 'PERIODO_NO_CONTIGUO');
  const l1 = await lista();
  assert.deepEqual(l1.periodos, l0.periodos, 'la secuencia no cambió');
});

test('generar un mes futuro (mes+1 posterior al actual) es rechazado', async () => {
  const semilla = mesActual();
  const futuro = periodoSiguiente(semilla); // posterior al mes actual
  const res = await generar(futuro);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.codigo, 'PERIODO_FUTURO');
});
