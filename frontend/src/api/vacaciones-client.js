// spec 015 — Cliente de datos de "Control de Vacaciones Anual". Único acceso
// a datos de la UI: habla solo con la API `/api` (Principio I). Mismo patrón
// que justificaciones-client.js.

export function crearClienteVacaciones({ fetchImpl, base = '/api' } = {}) {
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
    // GET /api/vacaciones → { legajos: [{ legajo, fechaIngreso, antiguedadAnios, saldo, proximoIncremento, pendienteFechaIngreso }] }
    listar() {
      return pedir('/vacaciones');
    },
    // GET /api/vacaciones/{legajo} → { legajo, saldo, movimientos, asignaciones }
    consultar(legajo) {
      return pedir(`/vacaciones/${legajo}`);
    },
    // POST /api/vacaciones/asignaciones → { asignacionId, fechaInicio, fechaFin, cantidadDias, saldoResultante }
    asignar({ legajo, fechaInicio, cantidadDias, autor = null }) {
      return pedir('/vacaciones/asignaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legajo, fechaInicio, cantidadDias, autor }),
      });
    },
    // DELETE /api/vacaciones/asignaciones/{id} → { id, revertida: true, saldoResultante }
    revertir(id, { autor = null } = {}) {
      return pedir(`/vacaciones/asignaciones/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autor }),
      });
    },
  };
}
