import { ApiError } from './router.js';
import { construirVistaCalendario, hoyLocal } from '../view-model.js';
import { Clasificacion } from '../../presentismo/domain/calendario-mes.js';

// feature 007 — Handlers de la API de calendario. Delegan en el servicio de
// presentismo (feature 004) y arman las proyecciones de presentación. Ninguna
// respuesta expone datos personales, legajos ni fichadas (FR-014).
// Ver contracts/web-api.md.

const CLASIFICACIONES_VALIDAS = new Set(Object.values(Clasificacion));

function validarPeriodo(periodo) {
  if (typeof periodo !== 'string' || !/^\d{6}$/.test(periodo)) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Período inválido "${periodo}" (se espera YYYYMM)`);
  }
  const mes = Number(periodo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Mes inválido en "${periodo}"`);
  }
}

// Arma la VistaCalendarioMes de un período cargando calendario + lista de
// generados. Lanza 404 si el calendario no existe (aún no generado).
async function vistaDe(ctx, periodo, { now = new Date() } = {}) {
  const calendario = await ctx.repo.cargarCalendario(periodo);
  if (!calendario) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', `No hay calendario para ${periodo}`);
  }
  const periodos = await ctx.repo.listarPeriodos();
  return construirVistaCalendario({ calendario, periodos, hoy: hoyLocal(now) });
}

export function registrarRutas(router, ctx) {
  // GET /api/calendarios → { periodos, ultimo }
  router.add('GET', '/api/calendarios', async () => {
    const periodos = await ctx.repo.listarPeriodos();
    const ultimo = periodos.length > 0 ? periodos[periodos.length - 1] : null;
    return { status: 200, body: { periodos, ultimo } };
  });

  // GET /api/calendarios/:periodo → VistaCalendarioMes
  router.add('GET', '/api/calendarios/:periodo', async ({ params }) => {
    validarPeriodo(params.periodo);
    return { status: 200, body: await vistaDe(ctx, params.periodo) };
  });

  // POST /api/calendarios/:periodo/generar — genera el calendario para el período
  router.add('POST', '/api/calendarios/:periodo/generar', async ({ params }) => {
    validarPeriodo(params.periodo);
    try {
      await ctx.service.generarCalendario(params.periodo);
      return { status: 200, body: await vistaDe(ctx, params.periodo) };
    } catch (err) {
      throw new ApiError(500, 'ERROR_GENERANDO_CALENDARIO', err.message);
    }
  });

  // POST /api/calendarios/:periodo/reclasificar (US3) — se registra abajo.
  registrarReclasificar(router, ctx);
}

// US3 (feature 007) — reclasifica un día con la clasificación indicada y
// devuelve la vista actualizada. La confirmación explícita ocurre en el cliente
// (FR-016); acá se valida y se delega en el dominio (FR-017).
function registrarReclasificar(router, ctx) {
  router.add('POST', '/api/calendarios/:periodo/reclasificar', async ({ params, body }) => {
    validarPeriodo(params.periodo);
    const { fecha, clasificacion, autor } = body ?? {};
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new ApiError(400, 'RECLASIFICACION_INVALIDA', 'Falta "fecha" válida (YYYY-MM-DD)');
    }
    if (!CLASIFICACIONES_VALIDAS.has(clasificacion)) {
      throw new ApiError(400, 'RECLASIFICACION_INVALIDA', `Clasificación inválida "${clasificacion}"`);
    }
    try {
      await ctx.service.reclasificarDia(params.periodo, fecha, clasificacion, autor ?? null);
    } catch (err) {
      // El dominio lanza si el calendario no existe o la fecha no pertenece al mes.
      if (/no existe calendario/i.test(err.message)) {
        throw new ApiError(404, 'CALENDARIO_NO_GENERADO', err.message);
      }
      throw new ApiError(400, 'RECLASIFICACION_INVALIDA', err.message);
    }
    return { status: 200, body: await vistaDe(ctx, params.periodo) };
  });
}
