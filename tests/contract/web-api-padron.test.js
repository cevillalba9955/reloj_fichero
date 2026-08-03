import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearEntornoFichadasHoy } from '../helpers/fichadas-hoy-entorno.js';

// fix vacaciones — Contrato de POST /api/padron/sincronizar: fuerza la
// sincronización del padrón desde Oracle (botón manual de la página
// Configuración). Sin credenciales Oracle reales en el entorno de test, el
// caso feliz (200) no es ejercitable acá (ver tests/unit/padron-sync.test.js
// para eso, con connectionFactory fake); este contrato cubre el gating de rol
// y que un fallo de Oracle se traduzca en un error prolijo, no un 500 crudo.

function rolesConDefault(rolPorDefecto) {
  const raiz = mkdtempSync(join(tmpdir(), 'acl-roles-padron-'));
  const ruta = join(raiz, 'roles.json');
  writeFileSync(ruta, JSON.stringify({ rolPorDefecto, mapeo: {} }), 'utf8');
  return ruta;
}

test('POST /api/padron/sincronizar sin rol configurador → 403 ACCESO_DENEGADO', async () => {
  const e = await crearEntornoFichadasHoy({ envExtra: { ACL_ROLES_CONFIG: rolesConDefault('editor') } });
  try {
    const res = await fetch(`${e.base}/api/padron/sincronizar`, { method: 'POST' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.codigo, 'ACCESO_DENEGADO');
  } finally {
    e.close();
  }
});

test('POST /api/padron/sincronizar con rol configurador pero sin Oracle configurado → 502 PADRON_SINCRONIZACION_FALLIDA', async () => {
  // El entorno de fichadas-hoy es permisivo por defecto (rolPorDefecto: configurador,
  // tests/helpers/acl-entorno.js) y no define RRHH_ORACLE_*.
  const e = await crearEntornoFichadasHoy();
  try {
    const res = await fetch(`${e.base}/api/padron/sincronizar`, { method: 'POST' });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.codigo, 'PADRON_SINCRONIZACION_FALLIDA');
    assert.match(body.error.mensaje, /Configuración del padrón Oracle inválida/);
  } finally {
    e.close();
  }
});
