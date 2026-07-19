import { ApiError } from './router.js';
import { construirVistaResumenPeriodo, construirDetalleEmpleado, hoyLocal } from '../view-model.js';
import { RosterNoDisponibleError } from '../../roster/active-employees-provider.js';

// feature 011 — Handlers de la API de "Resumen del Período". Solo lectura
// (FR-010): ningún endpoint escribe. Delegan en el servicio de presentismo
// (004/011) y arman las proyecciones de presentación (view-model.js). Ninguna
// respuesta expone datos biométricos ni rawHex (Principio V, FR-011).
// Ver specs/011-resumen-periodo/contracts/web-api.md.

function validarPeriodo(periodo) {
  if (typeof periodo !== 'string' || !/^\d{6}$/.test(periodo)) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Período inválido "${periodo}" (se espera YYYYMM)`);
  }
  const mes = Number(periodo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Mes inválido en "${periodo}"`);
  }
}

async function periodoEfectivo(ctx, query) {
  const periodos = await ctx.repo.listarPeriodos();
  const periodo = query.periodo ?? (periodos.length > 0 ? [...periodos].sort().at(-1) : null);
  if (periodo == null) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', 'No hay ningún período con calendario generado');
  }
  validarPeriodo(periodo);
  const calendario = await ctx.repo.cargarCalendario(periodo);
  if (!calendario) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', `No hay calendario para ${periodo}`);
  }
  return { periodo, periodos };
}

// Legajos esperados, del snapshot local del padrón (mismo criterio best-effort
// que fichadas-hoy-handlers: sin snapshot, la vista se muestra sin filas).
async function legajosEsperados(ctx) {
  try {
    const empleados = await ctx.activeEmployeesProvider.getActiveEmployees();
    return empleados.map((e) => e.legajo);
  } catch (err) {
    if (err instanceof RosterNoDisponibleError) return [];
    throw err;
  }
}

async function nombresPorLegajo(ctx) {
  try {
    const lista = await ctx.categoryProvider.listar();
    return new Map(lista.map((e) => [e.legajo, e.nombre ?? null]));
  } catch {
    return new Map();
  }
}

export function registrarRutas(router, ctx) {
  // GET /api/resumen-periodo[?periodo=YYYYMM] → VistaResumenPeriodo.
  router.add('GET', '/api/resumen-periodo', async ({ query }) => {
    const { periodo, periodos } = await periodoEfectivo(ctx, query);
    const legajos = await legajosEsperados(ctx);
    const nombres = await nombresPorLegajo(ctx);

    let filas;
    try {
      filas = await ctx.service.calcularResumenPeriodo(periodo, legajos, hoyLocal());
    } catch (err) {
      throw new ApiError(500, 'ERROR_CALCULANDO_RESUMEN', err.message);
    }
    const conNombre = filas.map((f) => ({ ...f, nombre: nombres.get(f.legajo) ?? null }));
    return { status: 200, body: construirVistaResumenPeriodo({ periodo, periodos, filas: conNombre }) };
  });

  // GET /api/resumen-periodo/:legajo[?periodo=YYYYMM] → VistaDetalleEmpleado (US2).
  router.add('GET', '/api/resumen-periodo/:legajo', async ({ params, query }) => {
    const legajo = Number(params.legajo);
    if (!Number.isInteger(legajo) || legajo < 1) {
      throw new ApiError(400, 'LEGAJO_INVALIDO', `Legajo inválido "${params.legajo}"`);
    }
    const { periodo } = await periodoEfectivo(ctx, query);
    const nombres = await nombresPorLegajo(ctx);

    let filas;
    try {
      filas = await ctx.service.calcularResumenPeriodo(periodo, [legajo], hoyLocal());
    } catch (err) {
      throw new ApiError(500, 'ERROR_CALCULANDO_RESUMEN', err.message);
    }
    const [fila] = filas;
    if (fila?.anomalia) {
      throw new ApiError(409, 'EMPLEADO_SIN_CATEGORIA', fila.anomalia);
    }
    return {
      status: 200,
      body: construirDetalleEmpleado({
        periodo,
        legajo,
        nombre: nombres.get(legajo) ?? null,
        detalle: fila.detalle,
      }),
    };
  });
}
