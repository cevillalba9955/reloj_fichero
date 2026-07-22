import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcpServer } from 'node:net';
import { crearServidorControl } from '../../src/cli/consulta-programada.js';

// feature 014 (US1 T008) — Contrato de POST /probar-conexion del control-API
// (contracts/control-api.md de 014): prueba un host/puerto CANDIDATO con el
// driver aislado (connectSocket), sin persistir ni tocar el scheduler. Nunca
// llama a `tick` (no es un ciclo del reloj real).

async function conControl(fn, { timeoutMs = 300 } = {}) {
  const server = await crearServidorControl({
    tick: async () => ({ resultado: 'success', fichadasNuevas: 0 }),
    port: 0,
    timeoutMs,
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('POST /probar-conexion — host/puerto alcanzable → 200 { ok: true }', async () => {
  const tcp = createTcpServer((socket) => socket.end());
  await new Promise((r) => tcp.listen(0, '127.0.0.1', r));
  try {
    await conControl(async (base) => {
      const res = await fetch(`${base}/probar-conexion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '127.0.0.1', port: tcp.address().port }),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    });
  } finally {
    tcp.close();
  }
});

test('POST /probar-conexion — puerto sin nada escuchando → 200 { ok: false, motivo }', async () => {
  // Puerto 1 (privilegiado, casi seguro sin listener en el entorno de test) →
  // conexión rechazada rápido.
  await conControl(async (base) => {
    const res = await fetch(`${base}/probar-conexion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.ok(typeof body.motivo === 'string' && body.motivo.length > 0);
  });
});

test('POST /probar-conexion — body inválido (falta host/port) → 400', async () => {
  await conControl(async (base) => {
    const res = await fetch(`${base}/probar-conexion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PARAMETROS_INVALIDOS');
  });
});

test('POST /probar-conexion nunca ejecuta un tick real', async () => {
  let tickLlamado = false;
  const server = await crearServidorControl({
    tick: async () => {
      tickLlamado = true;
      return { resultado: 'success', fichadasNuevas: 0 };
    },
    port: 0,
    timeoutMs: 200,
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(`${base}/probar-conexion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1 }),
    });
    assert.equal(tickLlamado, false);
  } finally {
    server.close();
  }
});
