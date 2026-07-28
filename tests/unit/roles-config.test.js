import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRolesConfig, loadRolesConfig } from '../../src/config/roles-config.js';

// feature 016 (Foundational T005/T006) — roles-config.js: carga válida,
// degradación (no fail-fast) ante rolPorDefecto/mapeo inválidos o archivo
// ausente/no-JSON (Edge Case del spec: el sistema sigue funcionando, todo
// cae a "lector").

function rolesTmp(contenido) {
  const raiz = mkdtempSync(join(tmpdir(), 'roles-config-'));
  const ruta = join(raiz, 'roles.json');
  if (contenido !== undefined) writeFileSync(ruta, contenido, 'utf8');
  return { raiz, ruta };
}

test('config vacía: rolPorDefecto es lector y todo mapea a lector', () => {
  const config = parseRolesConfig({});
  assert.equal(config.rolPorDefecto, 'lector');
  assert.equal(config.mapear('CUALQUIERA'), 'lector');
  assert.equal(config.mapear(null), 'lector');
  assert.equal(config.mapear(''), 'lector');
});

test('mapeo válido traduce cada rol de origen a su rol interno', () => {
  const config = parseRolesConfig({
    rolPorDefecto: 'lector',
    mapeo: { RRHH_EDITOR: 'editor', RRHH_ADMIN: 'configurador' },
  });
  assert.equal(config.mapear('RRHH_EDITOR'), 'editor');
  assert.equal(config.mapear('RRHH_ADMIN'), 'configurador');
  assert.equal(config.mapear('RRHH_DESCONOCIDO'), 'lector');
});

test('rolPorDefecto distinto de lector se respeta', () => {
  const config = parseRolesConfig({ rolPorDefecto: 'editor' });
  assert.equal(config.mapear('CUALQUIERA'), 'editor');
});

test('rolPorDefecto inválido no lanza: degrada a lector', () => {
  const config = parseRolesConfig({ rolPorDefecto: 'super-admin' });
  assert.equal(config.rolPorDefecto, 'lector');
});

test('entrada de mapeo con valor inválido se ignora, el resto del mapeo sigue vigente', () => {
  const config = parseRolesConfig({
    mapeo: { RRHH_EDITOR: 'editor', RRHH_ROTO: 'super-admin' },
  });
  assert.equal(config.mapear('RRHH_EDITOR'), 'editor');
  assert.equal(config.mapear('RRHH_ROTO'), 'lector');
});

test('mapeo no-objeto (array) se ignora, no lanza', () => {
  const config = parseRolesConfig({ mapeo: ['no', 'es', 'objeto'] });
  assert.equal(config.mapear('lo-que-sea'), 'lector');
});

test('loadRolesConfig: archivo ausente cae a la configuración por defecto', () => {
  const { raiz, ruta } = rolesTmp();
  try {
    const config = loadRolesConfig(join(raiz, 'no-existe.json'));
    assert.equal(config.rolPorDefecto, 'lector');
    assert.equal(config.mapear('X'), 'lector');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('loadRolesConfig: JSON inválido no lanza, cae a la configuración por defecto', () => {
  const { raiz, ruta } = rolesTmp('{ esto no es json');
  try {
    const config = loadRolesConfig(ruta);
    assert.equal(config.rolPorDefecto, 'lector');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('loadRolesConfig: archivo válido se parsea igual que parseRolesConfig', () => {
  const { raiz, ruta } = rolesTmp(
    JSON.stringify({ rolPorDefecto: 'lector', mapeo: { RRHH_ADMIN: 'configurador' } }),
  );
  try {
    const config = loadRolesConfig(ruta);
    assert.equal(config.mapear('RRHH_ADMIN'), 'configurador');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
