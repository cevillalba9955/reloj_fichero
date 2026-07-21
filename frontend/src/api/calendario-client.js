// feature 007 — Cliente de datos del frontend. Es el ÚNICO acceso a datos de la
// UI: habla solo con la API `/api` (Principio I). No conoce Oracle, el reloj ni
// el filesystem del dominio. `fetchImpl` es inyectable para tests.

export function crearClienteCalendario({ fetchImpl, base = '/api' } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function pedir(path, opts) {
    const res = await doFetch(`${base}${path}`, opts);
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
    // GET /api/calendarios → { periodos, ultimo }
    listarCalendarios() {
      return pedir('/calendarios');
    },
    // GET /api/calendarios/:periodo → VistaCalendarioMes
    obtenerCalendario(periodo) {
      return pedir(`/calendarios/${periodo}`);
    },
    // POST /api/calendarios/:periodo/generar → genera calendario para el período
    generarCalendario(periodo) {
      return pedir(`/calendarios/${periodo}/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },
    // POST /api/calendarios/:periodo/reclasificar → VistaCalendarioMes actualizada (US3)
    reclasificar(periodo, { fecha, clasificacion, autor = null }) {
      return pedir(`/calendarios/${periodo}/reclasificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, clasificacion, autor }),
      });
    },
    // 013-reestructurar-data-periodos (US3) — POST /api/calendarios/:periodo/cerrar
    // y /reabrir → VistaCalendarioMes actualizada, con `cerrado` reflejado.
    cerrarPeriodo(periodo, { autor = null } = {}) {
      return pedir(`/calendarios/${periodo}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autor }),
      });
    },
    reabrirPeriodo(periodo, { autor = null } = {}) {
      return pedir(`/calendarios/${periodo}/reabrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autor }),
      });
    },
  };
}
