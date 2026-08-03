import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearEntornoFichadasHoy, fechaDelMes } from '../helpers/fichadas-hoy-entorno.js';
import { createFileVacacionesRepository } from '../../src/presentismo/adapters/file-vacaciones-repository.js';

// feature 016 — Integración de los Acceptance Scenarios de US1/US2/US3 y del
// Edge Case de rol indeterminado. Ver specs/016-control-acceso-roles/spec.md
// y quickstart.md. Los tests de contrato (web-api-acl.test.js) ya cubren el
// 403 ruta por ruta; acá se verifica el efecto de punta a punta (nada se
// modifica ante un rechazo, y el flujo completo de un rol permitido persiste).

const ROLES_JSON = {
  rolPorDefecto: 'lector',
  mapeo: { RRHH_EDITOR: 'editor', RRHH_ADMIN: 'configurador' },
};

const PADRON = [{ legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' }];

async function entorno() {
  const raizRoles = mkdtempSync(join(tmpdir(), 'acl-int-roles-'));
  const rolesPath = join(raizRoles, 'roles.json');
  writeFileSync(rolesPath, JSON.stringify(ROLES_JSON, null, 2), 'utf8');
  // NUNCA el `.env` real: US3 ejerce PUT /api/configuracion/reloj.
  const rutaEnv = join(raizRoles, '.env');
  writeFileSync(rutaEnv, '# .env de prueba\nFICHADAS_HOST=10.0.0.5\nFICHADAS_PORT=5005\n', 'utf8');

  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    envExtra: { ACL_ROLES_CONFIG: rolesPath, CONFIGURACION_ENV_PATH: rutaEnv },
  });

  return {
    ...e,
    close() {
      e.close();
      rmSync(raizRoles, { recursive: true, force: true });
    },
  };
}

async function seedSaldo(repoDir, legajo, saldo) {
  const repo = createFileVacacionesRepository({ repoDir });
  await repo.guardarLegajo(legajo, { saldo, ultimoIncrementoAplicado: null, movimientos: [] });
}

// --- US1 (P1): Lector ve todo, no modifica nada -----------------------------

test('US1 AS2: rol lector no logra asignar vacaciones — el saldo queda intacto', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 3, autor: 'rrhh' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.codigo, 'ACCESO_DENEGADO');

    const consulta = await fetch(`${e.base}/api/vacaciones/1`);
    assert.equal(consulta.status, 200);
    const body = await consulta.json();
    assert.equal(body.saldo, 10, 'el saldo no debe haberse modificado');
  } finally {
    e.close();
  }
});

test('US1 AS1/AS3: rol lector navega Calendario y no ve Configuración', async () => {
  const e = await entorno();
  try {
    const calendarios = await fetch(`${e.base}/api/calendarios`);
    assert.equal(calendarios.status, 200, 'la lectura sigue disponible para Lector');

    const configuracion = await fetch(`${e.base}/api/configuracion/reloj`);
    assert.equal(configuracion.status, 403);
    assert.equal((await configuracion.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
  }
});

// --- Edge Case: rol indeterminado -------------------------------------------

test('Edge Case: header con valor no mapeado → lector, la app sigue navegable', async () => {
  const e = await entorno();
  try {
    const miRol = await fetch(`${e.base}/api/acl/mi-rol`, { headers: { 'X-Apex-Rol': 'ROL_QUE_NO_EXISTE' } });
    assert.deepEqual(await miRol.json(), { rol: 'lector' });

    const calendarios = await fetch(`${e.base}/api/calendarios`, { headers: { 'X-Apex-Rol': 'ROL_QUE_NO_EXISTE' } });
    assert.equal(calendarios.status, 200, 'sin interrupción de servicio para un rol no mapeado');
  } finally {
    e.close();
  }
});

// --- US2 (P2): Editor completa el ciclo diario ------------------------------

test('US2: rol editor completa una corrección de punta a punta; Configuración sigue vedada', async () => {
  const e = await entorno();
  try {
    const fecha = fechaDelMes(3);
    const res = await fetch(`${e.base}/api/fichadas-hoy/correcciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Apex-Rol': 'RRHH_EDITOR' },
      body: JSON.stringify({ legajo: 1, fecha, entrada: '08:15', autor: 'editor.test', motivo: 'fichada perdida' }),
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.entrada, '08:15');

    const configuracion = await fetch(`${e.base}/api/configuracion/reloj`, { headers: { 'X-Apex-Rol': 'RRHH_EDITOR' } });
    assert.equal(configuracion.status, 403);
  } finally {
    e.close();
  }
});

// --- US3 (P3): Configurador administra Configuración ------------------------

test('US3: rol configurador guarda un cambio en Configuración y persiste', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Apex-Rol': 'RRHH_ADMIN' },
      body: JSON.stringify({ host: '10.0.0.9', port: 5005 }),
    });
    assert.equal(res.status, 200);

    const relectura = await fetch(`${e.base}/api/configuracion/reloj`, { headers: { 'X-Apex-Rol': 'RRHH_ADMIN' } });
    const body = await relectura.json();
    assert.equal(body.host, '10.0.0.9');
  } finally {
    e.close();
  }
});

test('US3: rol configurador también completa operaciones de Editor', async () => {
  const e = await entorno();
  try {
    await seedSaldo(e.repoDir, 1, 10);
    const res = await fetch(`${e.base}/api/vacaciones/asignaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Apex-Rol': 'RRHH_ADMIN' },
      body: JSON.stringify({ legajo: 1, fechaInicio: fechaDelMes(5), cantidadDias: 3, autor: 'admin' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).saldoResultante, 7);
  } finally {
    e.close();
  }
});
