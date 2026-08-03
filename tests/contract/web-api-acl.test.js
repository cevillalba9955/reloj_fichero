import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearEntornoFichadasHoy, fechaDelMes } from '../helpers/fichadas-hoy-entorno.js';
import { CATEGORIAS_DEFAULT, MOTIVOS_DEFAULT } from '../helpers/configuracion-entorno.js';

// feature 016 — Contrato de la API de Control de Acceso.
// Ver specs/016-control-acceso-roles/contracts/web-api-acl.md.

const ROLES_JSON = {
  rolPorDefecto: 'lector',
  mapeo: { RRHH_EDITOR: 'editor', RRHH_ADMIN: 'configurador' },
};

// Entorno con un config/roles.json temporal y controlado (evita depender del
// config/roles.json real de desarrollo del repo), reutilizando el servidor
// completo (padrón + calendario del período actual, feature 010). El rol
// configurador ejercita TODAS las rutas de /api/configuracion/* (incluidas
// escrituras), así que — igual que tests/helpers/configuracion-entorno.js —
// nunca deben apuntar al `.env` ni a los `config/*.json` reales del repo.
async function entornoAcl({ roles = ROLES_JSON, ...resto } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'acl-roles-'));
  const rolesPath = join(raiz, 'roles.json');
  writeFileSync(rolesPath, JSON.stringify(roles, null, 2), 'utf8');
  const rutaEnv = join(raiz, '.env');
  writeFileSync(rutaEnv, '# .env de prueba\nFICHADAS_HOST=10.0.0.5\nFICHADAS_PORT=5005\n', 'utf8');
  const categoriasPath = join(raiz, 'categorias.json');
  writeFileSync(categoriasPath, JSON.stringify(CATEGORIAS_DEFAULT, null, 2), 'utf8');
  const motivosPath = join(raiz, 'motivos-ausencia.json');
  writeFileSync(motivosPath, JSON.stringify(MOTIVOS_DEFAULT, null, 2), 'utf8');

  const e = await crearEntornoFichadasHoy({
    padron: [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }],
    envExtra: {
      ACL_ROLES_CONFIG: rolesPath,
      CONFIGURACION_ENV_PATH: rutaEnv,
      PRESENTISMO_CATEGORIAS_CONFIG: categoriasPath,
      PRESENTISMO_MOTIVOS_AUSENCIA_CONFIG: motivosPath,
      ...(resto.envExtra ?? {}),
    },
    ...resto,
  });

  return {
    ...e,
    close() {
      e.close();
      rmSync(raiz, { recursive: true, force: true });
    },
  };
}

test('GET /api/acl/mi-rol sin header → lector (rolPorDefecto)', async () => {
  const e = await entornoAcl();
  try {
    const res = await fetch(`${e.base}/api/acl/mi-rol`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { rol: 'lector' });
  } finally {
    e.close();
  }
});

test('GET /api/acl/mi-rol con header mapeado a editor → editor', async () => {
  const e = await entornoAcl();
  try {
    const res = await fetch(`${e.base}/api/acl/mi-rol`, { headers: { 'X-Apex-Rol': 'RRHH_EDITOR' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { rol: 'editor' });
  } finally {
    e.close();
  }
});

test('GET /api/acl/mi-rol con header mapeado a configurador → configurador', async () => {
  const e = await entornoAcl();
  try {
    const res = await fetch(`${e.base}/api/acl/mi-rol`, { headers: { 'X-Apex-Rol': 'RRHH_ADMIN' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { rol: 'configurador' });
  } finally {
    e.close();
  }
});

test('GET /api/acl/mi-rol con header de valor no mapeado → lector', async () => {
  const e = await entornoAcl();
  try {
    const res = await fetch(`${e.base}/api/acl/mi-rol`, { headers: { 'X-Apex-Rol': 'NO_EXISTE' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { rol: 'lector' });
  } finally {
    e.close();
  }
});

test('GET /api/acl/mi-rol respeta un rolPorDefecto distinto de lector', async () => {
  const e = await entornoAcl({ roles: { rolPorDefecto: 'editor', mapeo: {} } });
  try {
    const res = await fetch(`${e.base}/api/acl/mi-rol`);
    assert.deepEqual(await res.json(), { rol: 'editor' });
  } finally {
    e.close();
  }
});

// --- 403 ACCESO_DENEGADO con rol lector (US1, T014) ------------------------
// El chequeo de rol ocurre antes que cualquier validación de negocio, así que
// alcanza con un cuerpo/parámetros mínimos: lo que se prueba es el rechazo,
// no el resultado de la operación subyacente.

const RUTAS_REQUIEREN_EDITOR = [
  { metodo: 'POST', ruta: (p) => `/api/calendarios/${p}/generar`, body: {} },
  { metodo: 'POST', ruta: (p) => `/api/calendarios/${p}/cerrar`, body: { autor: 'test' } },
  { metodo: 'POST', ruta: (p) => `/api/calendarios/${p}/reabrir`, body: { autor: 'test' } },
  {
    metodo: 'POST',
    ruta: (p) => `/api/calendarios/${p}/reclasificar`,
    body: { fecha: fechaDelMes(1), clasificacion: 'Feriado' },
  },
  { metodo: 'POST', ruta: () => `/api/fichadas-hoy/correcciones`, body: {} },
  { metodo: 'POST', ruta: () => `/api/fichadas-hoy/pausas`, body: {} },
  { metodo: 'POST', ruta: () => `/api/fichadas-hoy/retiros-anticipados`, body: {} },
  { metodo: 'POST', ruta: () => `/api/fichadas-hoy/consultar-reloj`, body: null },
  { metodo: 'POST', ruta: () => `/api/justificaciones`, body: {} },
  { metodo: 'DELETE', ruta: () => `/api/justificaciones`, body: {} },
  { metodo: 'POST', ruta: () => `/api/vacaciones/asignaciones`, body: {} },
  { metodo: 'DELETE', ruta: () => `/api/vacaciones/asignaciones/id-1`, body: {} },
];

const RUTAS_REQUIEREN_CONFIGURADOR = [
  { metodo: 'GET', ruta: () => `/api/configuracion/reloj` },
  { metodo: 'PUT', ruta: () => `/api/configuracion/reloj`, body: {} },
  { metodo: 'POST', ruta: () => `/api/configuracion/reloj/probar-conexion`, body: {} },
  { metodo: 'GET', ruta: () => `/api/configuracion/motivos-ausencia` },
  { metodo: 'POST', ruta: () => `/api/configuracion/motivos-ausencia`, body: {} },
  { metodo: 'PUT', ruta: () => `/api/configuracion/motivos-ausencia/id-1`, body: {} },
  { metodo: 'GET', ruta: () => `/api/configuracion/categorias` },
  { metodo: 'PUT', ruta: () => `/api/configuracion/categorias/esquema-semanal`, body: {} },
  { metodo: 'POST', ruta: () => `/api/configuracion/categorias/modalidades`, body: {} },
  { metodo: 'PUT', ruta: () => `/api/configuracion/categorias/modalidades/nombre-1`, body: {} },
  { metodo: 'DELETE', ruta: () => `/api/configuracion/categorias/modalidades/nombre-1` },
  { metodo: 'POST', ruta: () => `/api/configuracion/categorias/categorias`, body: {} },
  { metodo: 'PUT', ruta: () => `/api/configuracion/categorias/categorias/codigo-1`, body: {} },
];

async function pedir(base, { metodo, ruta }, periodo, headers = {}) {
  const path = ruta(periodo);
  const opciones = { method: metodo, headers: { 'Content-Type': 'application/json', ...headers } };
  const item = [...RUTAS_REQUIEREN_EDITOR, ...RUTAS_REQUIEREN_CONFIGURADOR].find((r) => r.ruta(periodo) === path);
  if (item && 'body' in item && item.body !== undefined && metodo !== 'GET' && metodo !== 'DELETE') {
    opciones.body = JSON.stringify(item.body);
  } else if (item && item.body !== undefined && metodo === 'DELETE') {
    opciones.body = JSON.stringify(item.body);
  }
  return fetch(`${base}${path}`, opciones);
}

test('rol lector: 403 ACCESO_DENEGADO en cada ruta que requiere editor', async () => {
  const e = await entornoAcl();
  try {
    for (const item of RUTAS_REQUIEREN_EDITOR) {
      const res = await pedir(e.base, item, e.periodo);
      assert.equal(res.status, 403, `${item.metodo} ${item.ruta(e.periodo)} debería ser 403`);
      const body = await res.json();
      assert.equal(body.error.codigo, 'ACCESO_DENEGADO', `${item.metodo} ${item.ruta(e.periodo)}`);
    }
  } finally {
    e.close();
  }
});

test('rol lector: 403 ACCESO_DENEGADO en cada ruta de /api/configuracion (incluidos los GET)', async () => {
  const e = await entornoAcl();
  try {
    for (const item of RUTAS_REQUIEREN_CONFIGURADOR) {
      const res = await pedir(e.base, item, e.periodo);
      assert.equal(res.status, 403, `${item.metodo} ${item.ruta(e.periodo)} debería ser 403`);
      const body = await res.json();
      assert.equal(body.error.codigo, 'ACCESO_DENEGADO', `${item.metodo} ${item.ruta(e.periodo)}`);
    }
  } finally {
    e.close();
  }
});

// --- rol editor: 200 en rutas de escritura, 403 en Configuración (US2, T027) --

test('rol editor: pasa el gate (no 403) en cada ruta que requiere editor', async () => {
  const e = await entornoAcl();
  try {
    for (const item of RUTAS_REQUIEREN_EDITOR) {
      const res = await pedir(e.base, item, e.periodo, { 'X-Apex-Rol': 'RRHH_EDITOR' });
      assert.notEqual(res.status, 403, `${item.metodo} ${item.ruta(e.periodo)} no debería ser 403 para editor`);
    }
  } finally {
    e.close();
  }
});

test('rol editor: 403 ACCESO_DENEGADO en /api/configuracion', async () => {
  const e = await entornoAcl();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, { headers: { 'X-Apex-Rol': 'RRHH_EDITOR' } });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
  }
});

// --- rol configurador: 200 en todo (US3, T030) ------------------------------

test('rol configurador: pasa el gate (no 403) en cada ruta de /api/configuracion', async () => {
  const e = await entornoAcl();
  try {
    for (const item of RUTAS_REQUIEREN_CONFIGURADOR) {
      const res = await pedir(e.base, item, e.periodo, { 'X-Apex-Rol': 'RRHH_ADMIN' });
      assert.notEqual(res.status, 403, `${item.metodo} ${item.ruta(e.periodo)} no debería ser 403 para configurador`);
    }
  } finally {
    e.close();
  }
});

test('rol configurador: pasa el gate (no 403) en cada ruta que requiere editor', async () => {
  const e = await entornoAcl();
  try {
    for (const item of RUTAS_REQUIEREN_EDITOR) {
      const res = await pedir(e.base, item, e.periodo, { 'X-Apex-Rol': 'RRHH_ADMIN' });
      assert.notEqual(res.status, 403, `${item.metodo} ${item.ruta(e.periodo)} no debería ser 403 para configurador`);
    }
  } finally {
    e.close();
  }
});
