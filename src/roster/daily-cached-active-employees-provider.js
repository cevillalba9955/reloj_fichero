import { RosterNoDisponibleError, assertActiveEmployeesProvider } from './active-employees-provider.js';

// contracts/daily-roster-cache-contract.md + data-model.md §3
// (FR-007/FR-008/FR-011/FR-014). Decorator que envuelve a cualquier
// `ActiveEmployeesProvider` (en esta feature, el de Oracle) y le agrega la
// política temporal del padrón, manteniendo intacto el contrato
// `getActiveEmployees() -> Promise<Empleado[]>` (FR-001/FR-006): el servicio
// 002 no distingue si está o no.
//
// - Una consulta CON ÉXITO por día de servicio (FR-014): fijado el snapshot
//   del día, las llamadas siguientes lo devuelven sin tocar `inner`.
// - Respaldo (FR-008): ante fallo o vacío, si hay un snapshot previo (de hoy
//   o de días anteriores) se sirve ese, registrando su antigüedad.
// - Vacío = no disponible (FR-011): nunca se fija como snapshot ni consume el
//   éxito del día; se reintenta.
// - Sin snapshot previo (FR-007): rechaza con RosterNoDisponibleError; nunca
//   devuelve [] como sustituto de un error.

function formatFecha(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function createDailyCachedActiveEmployeesProvider({ inner, now = () => new Date(), logger = null }) {
  assertActiveEmployeesProvider(inner);

  // Snapshot del último padrón válido: { empleados, obtenidoEn: Date, fechaServicio }.
  let snapshot = null;
  // Día de servicio (YYYY-MM-DD) cuya obtención ya tuvo ÉXITO (absorbente
  // dentro del día — FR-014). null mientras el éxito del día no ocurrió.
  let diaObtenido = null;
  // Promesa en vuelo para no disparar dos consultas concurrentes (reentrancy).
  let enVuelo = null;

  function servirRespaldoOFallar(errParaLanzar) {
    if (snapshot) {
      logger?.logEvento({
        evento: 'padron_respaldo',
        cantidadLegajos: snapshot.empleados.length,
        obtenidoEn: snapshot.obtenidoEn.toISOString(),
      });
      return snapshot.empleados;
    }
    throw errParaLanzar instanceof RosterNoDisponibleError
      ? errParaLanzar
      : new RosterNoDisponibleError('Padrón de RRHH no disponible y sin respaldo válido previo');
  }

  async function obtener(hoy) {
    const t0 = Date.now();
    let empleados;
    try {
      empleados = await inner.getActiveEmployees();
    } catch (err) {
      logger?.logEvento({
        evento: 'padron_error',
        duracionMs: Date.now() - t0,
        detail: err?.categoria ?? null,
      });
      return servirRespaldoOFallar(err);
    }

    const duracionMs = Date.now() - t0;
    if (!Array.isArray(empleados) || empleados.length === 0) {
      // Vacío exitoso: se trata como fuente no disponible (FR-011). No fija
      // snapshot ni consume el éxito del día → se reintentará.
      logger?.logEvento({ evento: 'padron_vacio', cantidadLegajos: 0, duracionMs });
      return servirRespaldoOFallar(
        new RosterNoDisponibleError('El padrón de RRHH devolvió 0 legajos activos')
      );
    }

    // Éxito fresco: fija el snapshot del día.
    const obtenidoEn = now();
    snapshot = { empleados, obtenidoEn, fechaServicio: hoy };
    diaObtenido = hoy;
    logger?.logEvento({
      evento: 'padron_fresco',
      cantidadLegajos: empleados.length,
      duracionMs,
      obtenidoEn: obtenidoEn.toISOString(),
    });
    return empleados;
  }

  async function getActiveEmployees() {
    const hoy = formatFecha(now());

    // Éxito del día ya logrado: servir el snapshot sin tocar `inner` (FR-014).
    if (diaObtenido === hoy && snapshot) {
      return snapshot.empleados;
    }

    // Reentrancy: compartir la consulta en vuelo.
    if (enVuelo) return enVuelo;

    enVuelo = obtener(hoy).finally(() => {
      enVuelo = null;
    });
    return enVuelo;
  }

  const provider = { getActiveEmployees };
  assertActiveEmployeesProvider(provider);
  return provider;
}
