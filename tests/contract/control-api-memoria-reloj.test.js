import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidorControl } from '../../src/cli/consulta-programada.js';

// issue #39 — POST /memoria-reloj y POST /limpiar-memoria del control-API.

async function conControl(opts, fn) {
  const server = await crearServidorControl({
    tick: async () => ({ resultado: 'success', fichadasNuevas: 0 }),
    port: 0,
    ...opts,
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const post = (base, path) => fetch(`${base}${path}`, { method: 'POST' }).then(async (r) => [r.status, await r.json()]);

test('POST /memoria-reloj → cantidad de pendientes', async () => {
  await conControl({ contarMemoria: async () => ({ ok: true, pendientes: 7 }) }, async (base) => {
    assert.deepEqual(await post(base, '/memoria-reloj'), [200, { ok: true, pendientes: 7 }]);
  });
});

test('POST /memoria-reloj → fallo del reloj y ciclo en curso se distinguen', async () => {
  await conControl({ contarMemoria: async () => ({ ok: false, motivo: 'sin conexión' }) }, async (base) => {
    assert.deepEqual(await post(base, '/memoria-reloj'), [200, { ok: false, motivo: 'sin conexión' }]);
  });
  await conControl({ contarMemoria: async () => ({ ok: true, omitido: true }) }, async (base) => {
    assert.deepEqual(await post(base, '/memoria-reloj'), [200, { ok: true, omitido: true }]);
  });
});

test('POST /limpiar-memoria → descargó y borró', async () => {
  await conControl(
    { limpiarMemoria: async () => ({ ciclo: { resultado: 'success' }, limpieza: { ok: true, descargadas: 5, borrado: true } }) },
    async (base) => {
      assert.deepEqual(await post(base, '/limpiar-memoria'), [200, { ok: true, borrado: true, fichadasDescargadas: 5 }]);
    },
  );
});

test('POST /limpiar-memoria → si el ciclo falló antes, no borra y devuelve el motivo', async () => {
  await conControl(
    { limpiarMemoria: async () => ({ ciclo: { resultado: 'error', detail: 'persistencia fallida' }, limpieza: null }) },
    async (base) => {
      assert.deepEqual(await post(base, '/limpiar-memoria'), [200, { ok: false, borrado: false, motivo: 'persistencia fallida' }]);
    },
  );
});

test('POST /limpiar-memoria → ciclo en curso: no borra', async () => {
  await conControl(
    { limpiarMemoria: async () => ({ ciclo: { resultado: 'omitido' }, limpieza: null }) },
    async (base) => {
      const [status, body] = await post(base, '/limpiar-memoria');
      assert.equal(status, 200);
      assert.equal(body.ok, false);
      assert.equal(body.borrado, false);
    },
  );
});

test('sin handlers configurados → 501', async () => {
  await conControl({}, async (base) => {
    assert.equal((await post(base, '/memoria-reloj'))[0], 501);
    assert.equal((await post(base, '/limpiar-memoria'))[0], 501);
  });
});
