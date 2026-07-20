// feature 012 — Cliente de datos de "Justificación de Ausencias". Único
// acceso a datos de la UI: habla solo con la API `/api` (Principio I). Mismo
// patrón que fichadas-hoy-client.js / resumen-periodo-client.js.

export function crearClienteJustificaciones({ fetchImpl, base = '/api' } = {}) {
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
    // GET /api/motivos-ausencia → { motivos: [{id, etiqueta, tipoPago}] }
    obtenerMotivos() {
      return pedir('/motivos-ausencia');
    },
    // POST /api/justificaciones → { registradas, omitidas, noAplicables }
    crearJustificacion(legajo, { fecha, hasta = null, motivoId, autor = null }) {
      return pedir('/justificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legajo, fecha, hasta, motivoId, autor }),
      });
    },
    // DELETE /api/justificaciones → { fecha, revertida: true }
    revertirJustificacion(legajo, { fecha, autor = null }) {
      return pedir('/justificaciones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legajo, fecha, autor }),
      });
    },
  };
}
