// feature 010 — Cliente de datos de la página "Fichadas de Hoy". Es el ÚNICO
// acceso a datos de la UI: habla solo con la API `/api` (Principio I). No
// conoce Oracle, el reloj ni el filesystem del dominio. `fetchImpl` es
// inyectable para tests. Mismo patrón que calendario-client.js.

export function crearClienteFichadasHoy({ fetchImpl, base = '/api' } = {}) {
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

  function post(path, payload) {
    return pedir(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  }

  return {
    // GET /api/fichadas-hoy → VistaFichadasHoy
    obtenerFichadasHoy() {
      return pedir('/fichadas-hoy');
    },
    // POST /api/fichadas-hoy/correcciones → FilaFichadaHoy recalculada (US2)
    corregir(legajo, { fecha, entrada = null, salida = null, autor = null, motivo }) {
      return post('/fichadas-hoy/correcciones', { legajo, fecha, entrada, salida, autor, motivo });
    },
    // POST /api/fichadas-hoy/pausas → FilaFichadaHoy recalculada (US3)
    agregarPausa(legajo, { fecha, desde, hasta, autor = null, motivo }) {
      return post('/fichadas-hoy/pausas', { legajo, fecha, desde, hasta, autor, motivo });
    },
    // POST /api/fichadas-hoy/retiros-anticipados → FilaFichadaHoy recalculada (US3)
    registrarRetiroAnticipado(legajo, { fecha, hora, autor = null, motivo }) {
      return post('/fichadas-hoy/retiros-anticipados', { legajo, fecha, hora, autor, motivo });
    },
    // POST /api/fichadas-hoy/consultar-reloj → { resultado, fichadasNuevas, vista } (US4)
    consultarReloj() {
      return post('/fichadas-hoy/consultar-reloj');
    },
  };
}
