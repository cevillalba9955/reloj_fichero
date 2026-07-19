// feature 011 — Cliente de datos de la página "Resumen del Período". Único
// acceso a datos de la UI: habla solo con la API `/api` (Principio I). Mismo
// patrón que fichadas-hoy-client.js / calendario-client.js.

export function crearClienteResumenPeriodo({ fetchImpl, base = '/api' } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

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
    // GET /api/resumen-periodo[?periodo=] → VistaResumenPeriodo
    obtenerResumen(periodo = null) {
      return pedir(periodo ? `/resumen-periodo?periodo=${encodeURIComponent(periodo)}` : '/resumen-periodo');
    },
    // GET /api/resumen-periodo/{legajo}[?periodo=] → VistaDetalleEmpleado (US2)
    obtenerDetalle(legajo, periodo = null) {
      const query = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
      return pedir(`/resumen-periodo/${legajo}${query}`);
    },
  };
}
