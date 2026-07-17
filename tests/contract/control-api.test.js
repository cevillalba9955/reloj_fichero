import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorControl } from '../../src/cli/consulta-programada.js';

// T041 (feature 010, US4) — Contrato del servidor de control HTTP local del
// servicio de fichadas (contracts/control-api.md): POST /tick responde 200 con
// { resultado: "ok"|"omitido"|"error", fichadasNuevas, detail }, atado a
// 127.0.0.1. Un ciclo con error del reloj sigue siendo HTTP 200 (el POST /tick
// en sí se ejecutó); la traducción a 502 es responsabilidad de la API web.

async function conControl(tick, fn) {
  const server = await crearServidorControl({ tick, port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('POST /tick — ciclo exitoso → 200 { resultado: "ok", fichadasNuevas, detail }', async () => {
  await conControl(
    async () => ({ resultado: 'success', fichadasNuevas: 3, duracionMs: 12 }),
    async (base) => {
      const res = await fetch(`${base}/tick`, { method: 'POST' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.resultado, 'ok', '"success" del scheduler se publica como "ok"');
      assert.equal(body.fichadasNuevas, 3);
      assert.ok('detail' in body);
    },
  );
});

test('POST /tick — consulta ya en curso → 200 { resultado: "omitido" }', async () => {
  await conControl(
    async () => ({ resultado: 'omitido', fichadasNuevas: 0, detail: 'consulta ya en curso' }),
    async (base) => {
      const body = await (await fetch(`${base}/tick`, { method: 'POST' })).json();
      assert.equal(body.resultado, 'omitido');
      assert.equal(body.fichadasNuevas, 0);
    },
  );
});

test('POST /tick — ciclo con error del reloj → HTTP 200 con resultado "error"', async () => {
  await conControl(
    async () => ({ resultado: 'error', fichadasNuevas: 0, detail: 'timeout de sesión' }),
    async (base) => {
      const res = await fetch(`${base}/tick`, { method: 'POST' });
      assert.equal(res.status, 200, 'el POST en sí funcionó; el ciclo es el que falló');
      const body = await res.json();
      assert.equal(body.resultado, 'error');
      assert.equal(body.detail, 'timeout de sesión');
    },
  );
});

test('el servidor de control está atado a 127.0.0.1 y no expone otras rutas', async () => {
  await conControl(
    async () => ({ resultado: 'success', fichadasNuevas: 0 }),
    async (base) => {
      const getTick = await fetch(`${base}/tick`, { method: 'GET' });
      assert.equal(getTick.status, 404, 'solo POST /tick');
      const otra = await fetch(`${base}/estado`, { method: 'POST' });
      assert.equal(otra.status, 404, 'no se expone getState() por este canal');
    },
  );
});
