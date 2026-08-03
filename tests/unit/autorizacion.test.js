import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverRolActual, exigirRol } from '../../src/web/acl/autorizacion.js';
import { parseRolesConfig } from '../../src/config/roles-config.js';

// feature 016 (Foundational T007/T008) — resolverRolActual: header
// ausente/desconocido/mapeado; exigirRol: rango suficiente/insuficiente para
// cada combinación de rol actual × rol mínimo requerido.

function ctxCon(rolesConfig, aclHeaderRol = 'x-apex-rol') {
  return { rolesConfig, aclHeaderRol };
}

const CONFIG_BASE = parseRolesConfig({
  rolPorDefecto: 'lector',
  mapeo: { RRHH_EDITOR: 'editor', RRHH_ADMIN: 'configurador' },
});

test('resolverRolActual: sin header → rolPorDefecto (lector)', () => {
  const req = { headers: {} };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE)), 'lector');
});

test('resolverRolActual: header con valor no mapeado → rolPorDefecto', () => {
  const req = { headers: { 'x-apex-rol': 'ALGO_DESCONOCIDO' } };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE)), 'lector');
});

test('resolverRolActual: header mapeado a editor', () => {
  const req = { headers: { 'x-apex-rol': 'RRHH_EDITOR' } };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE)), 'editor');
});

test('resolverRolActual: header mapeado a configurador', () => {
  const req = { headers: { 'x-apex-rol': 'RRHH_ADMIN' } };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE)), 'configurador');
});

test('resolverRolActual: header repetido (array) usa el primer valor', () => {
  const req = { headers: { 'x-apex-rol': ['RRHH_ADMIN', 'RRHH_EDITOR'] } };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE)), 'configurador');
});

test('resolverRolActual: respeta el nombre de header configurado', () => {
  const req = { headers: { 'x-otro-header': 'RRHH_EDITOR' } };
  assert.equal(resolverRolActual(req, ctxCon(CONFIG_BASE, 'x-otro-header')), 'editor');
});

function handlerOk() {
  return async () => ({ status: 200, body: { ok: true } });
}

for (const [rolActual, rolMinimo, permitido] of [
  ['lector', 'lector', true],
  ['lector', 'editor', false],
  ['lector', 'configurador', false],
  ['editor', 'lector', true],
  ['editor', 'editor', true],
  ['editor', 'configurador', false],
  ['configurador', 'lector', true],
  ['configurador', 'editor', true],
  ['configurador', 'configurador', true],
]) {
  test(`exigirRol('${rolMinimo}') con rol actual '${rolActual}' → ${permitido ? 'permite' : 'rechaza'}`, async () => {
    const config = parseRolesConfig({ rolPorDefecto: rolActual });
    const ctx = ctxCon(config);
    const envuelto = exigirRol(ctx, rolMinimo, handlerOk());
    const req = { headers: {} };

    if (permitido) {
      const resultado = await envuelto({ req, params: {}, query: {}, body: null });
      assert.deepEqual(resultado, { status: 200, body: { ok: true } });
    } else {
      await assert.rejects(
        () => envuelto({ req, params: {}, query: {}, body: null }),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.codigo, 'ACCESO_DENEGADO');
          return true;
        },
      );
    }
  });
}

test('exigirRol: un rechazo no ejecuta el handler original', async () => {
  let ejecutado = false;
  const config = parseRolesConfig({ rolPorDefecto: 'lector' });
  const envuelto = exigirRol(ctxCon(config), 'editor', async () => {
    ejecutado = true;
    return { status: 200, body: {} };
  });
  await assert.rejects(() => envuelto({ req: { headers: {} } }));
  assert.equal(ejecutado, false);
});
