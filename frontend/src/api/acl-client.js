import { fetchConRol } from '../utils/rol-apex.js';

// feature 016 — Cliente de datos del Control de Acceso. Único acceso a
// datos de la UI: habla solo con la API `/api` (Principio I). Mismo patrón
// que configuracion-client.js / resumen-periodo-client.js.

export function crearClienteAcl({ fetchImpl, base = '/api' } = {}) {
  const doFetch = fetchImpl ?? fetchConRol;

  async function pedir(path) {
    const res = await doFetch(`${base}${path}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.error?.mensaje ?? `HTTP ${res.status}`);
      err.status = res.status;
      err.codigo = body?.error?.codigo ?? null;
      throw err;
    }
    return body;
  }

  return {
    obtenerMiRol: () => pedir('/acl/mi-rol'),
  };
}
