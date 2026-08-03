import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// feature 016 — Helper compartido para tests que NO son sobre control de
// acceso (el resto de las features 007-015): les da un config/roles.json
// permisivo (rolPorDefecto: configurador) para que el comportamiento previo
// a esta feature (sin autenticación, todo permitido) siga siendo el default
// en esos tests, sin que cada uno tenga que conocer ACL_ROLES_CONFIG. Los
// tests que sí ejercitan el control de acceso (tests/contract/web-api-acl.test.js)
// arman su propio config/roles.json restrictivo, explícitamente.

let rutaCacheada = null;

export function rolesPermisivoPath() {
  if (rutaCacheada) return rutaCacheada;
  const raiz = mkdtempSync(join(tmpdir(), 'acl-roles-permisivo-'));
  rutaCacheada = join(raiz, 'roles.json');
  writeFileSync(rutaCacheada, JSON.stringify({ rolPorDefecto: 'configurador', mapeo: {} }), 'utf8');
  return rutaCacheada;
}
