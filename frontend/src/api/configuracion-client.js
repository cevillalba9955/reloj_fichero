// feature 014 — Cliente de datos de la página "Configuración". Único acceso
// a datos de la UI: habla solo con la API `/api` (Principio I). Mismo patrón
// que resumen-periodo-client.js / fichadas-hoy-client.js.

export function crearClienteConfiguracion({ fetchImpl, base = '/api' } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function pedir(path, opciones) {
    const res = await doFetch(`${base}${path}`, opciones);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.error?.mensaje ?? `HTTP ${res.status}`);
      err.status = res.status;
      err.codigo = body?.error?.codigo ?? null;
      throw err;
    }
    return body;
  }

  function conCuerpo(method) {
    return (path, cuerpo) =>
      pedir(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
  }

  const post = conCuerpo('POST');
  const put = conCuerpo('PUT');

  return {
    // Reloj y servicio (US1, US4)
    obtenerReloj: () => pedir('/configuracion/reloj'),
    guardarReloj: (cambios) => put('/configuracion/reloj', cambios),
    probarConexionReloj: (host, port) => post('/configuracion/reloj/probar-conexion', { host, port }),

    // Motivos de ausencia (US2)
    obtenerMotivos: () => pedir('/configuracion/motivos-ausencia'),
    crearMotivo: (motivo) => post('/configuracion/motivos-ausencia', motivo),
    editarMotivo: (id, cambios) => put(`/configuracion/motivos-ausencia/${encodeURIComponent(id)}`, cambios),

    // Categorías, modalidades y esquema semanal (US3)
    obtenerCategorias: () => pedir('/configuracion/categorias'),
    guardarEsquemaSemanal: (dias) => put('/configuracion/categorias/esquema-semanal', { dias }),
    crearModalidad: (modalidad) => post('/configuracion/categorias/modalidades', modalidad),
    editarModalidad: (nombre, cambios) => put(`/configuracion/categorias/modalidades/${encodeURIComponent(nombre)}`, cambios),
    eliminarModalidad: (nombre) => pedir(`/configuracion/categorias/modalidades/${encodeURIComponent(nombre)}`, { method: 'DELETE' }),
    crearCategoria: (categoria) => post('/configuracion/categorias/categorias', categoria),
    editarCategoria: (codigo, cambios) => put(`/configuracion/categorias/categorias/${encodeURIComponent(codigo)}`, cambios),
  };
}
