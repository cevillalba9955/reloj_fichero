import { ApiError } from './router.js';
import { construirVistaResumenPeriodo, construirDetalleEmpleado, hoyLocal } from '../view-model.js';
import { RosterNoDisponibleError } from '../../roster/active-employees-provider.js';
import { Tramo } from '../../presentismo/domain/periodo-liquidacion.js';

// feature 011 — Handlers de la API de "Resumen del Período". Solo lectura
// (FR-010): ningún endpoint escribe. Delegan en el servicio de presentismo
// (004/011) y arman las proyecciones de presentación (view-model.js). Ninguna
// respuesta expone datos biométricos ni rawHex (Principio V, FR-011).
// Ver specs/011-resumen-periodo/contracts/web-api.md.
//
// Granularidad (FR-013): `ctx.modoResumenPeriodo` (PRESENTISMO_RESUMEN_PERIODO
// en .env) define los períodos seleccionables: MENSUAL ofrece `YYYYMM`;
// QUINCENAL ofrece quincenas `YYYYMM-Q1` / `YYYYMM-Q2`. `YYYYMM` a secas (mes
// completo) se acepta como query en ambos modos.

const RE_MES = /^\d{6}$/;
const RE_QUINCENA = /^(\d{6})-Q([12])$/;

// Descompone el identificador de período en { periodoMes, tramo } validando el
// formato según el modo. `tramo` null = mes completo.
function parsePeriodoId(id, modo) {
  let periodoMes = null;
  let tramo = null;
  if (typeof id === 'string' && RE_MES.test(id)) {
    periodoMes = id;
  } else if (typeof id === 'string' && modo === 'QUINCENAL' && RE_QUINCENA.test(id)) {
    const [, mes, q] = RE_QUINCENA.exec(id);
    periodoMes = mes;
    tramo = q === '1' ? Tramo.Q1 : Tramo.Q2;
  } else {
    const esperado = modo === 'QUINCENAL' ? 'YYYYMM o YYYYMM-Q1/Q2' : 'YYYYMM';
    throw new ApiError(400, 'PERIODO_INVALIDO', `Período inválido "${id}" (se espera ${esperado})`);
  }
  const nroMes = Number(periodoMes.slice(4, 6));
  if (nroMes < 1 || nroMes > 12) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Mes inválido en "${id}"`);
  }
  return { periodoMes, tramo };
}

// Períodos seleccionables (FR-002): los generados, expandidos a quincenas en
// modo QUINCENAL.
function expandirPeriodos(generados, modo) {
  const ordenados = [...generados].sort();
  if (modo !== 'QUINCENAL') return ordenados;
  return ordenados.flatMap((p) => [`${p}-Q1`, `${p}-Q2`]);
}

// Default: el período más reciente (FR-002). En QUINCENAL, la quincena en
// curso si el mes de hoy tiene calendario; si no, la última quincena del
// último mes generado.
function periodoPorDefecto(generados, modo, hoy) {
  if (generados.length === 0) return null;
  const ultimo = [...generados].sort().at(-1);
  if (modo !== 'QUINCENAL') return ultimo;
  const mesHoy = hoy.slice(0, 4) + hoy.slice(5, 7);
  if (generados.includes(mesHoy)) {
    return `${mesHoy}-${Number(hoy.slice(8, 10)) <= 15 ? 'Q1' : 'Q2'}`;
  }
  return `${ultimo}-Q2`;
}

async function periodoEfectivo(ctx, query) {
  const modo = ctx.modoResumenPeriodo ?? 'MENSUAL';
  const generados = await ctx.repo.listarPeriodos();
  const periodo = query.periodo ?? periodoPorDefecto(generados, modo, hoyLocal());
  if (periodo == null) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', 'No hay ningún período con calendario generado');
  }
  const { periodoMes, tramo } = parsePeriodoId(periodo, modo);
  const calendario = await ctx.repo.cargarCalendario(periodoMes);
  if (!calendario) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', `No hay calendario para ${periodoMes}`);
  }
  return { periodo, periodoMes, tramo, periodos: expandirPeriodos(generados, modo) };
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
  // GET /api/resumen-periodo[?periodo=YYYYMM[-Q1|-Q2]] → VistaResumenPeriodo.
  router.add('GET', '/api/resumen-periodo', async ({ query }) => {
    const { periodo, periodoMes, tramo, periodos } = await periodoEfectivo(ctx, query);
    const legajos = await legajosEsperados(ctx);
    const nombres = await nombresPorLegajo(ctx);

    let filas;
    try {
      filas = await ctx.service.calcularResumenPeriodo(periodoMes, legajos, hoyLocal(), { tramo });
    } catch (err) {
      throw new ApiError(500, 'ERROR_CALCULANDO_RESUMEN', err.message);
    }
    const conNombre = filas.map((f) => ({ ...f, nombre: nombres.get(f.legajo) ?? null }));
    return { status: 200, body: construirVistaResumenPeriodo({ periodo, periodos, filas: conNombre }) };
  });

  // GET /api/resumen-periodo/:legajo[?periodo=YYYYMM[-Q1|-Q2]] → VistaDetalleEmpleado (US2).
  router.add('GET', '/api/resumen-periodo/:legajo', async ({ params, query }) => {
    const legajo = Number(params.legajo);
    if (!Number.isInteger(legajo) || legajo < 1) {
      throw new ApiError(400, 'LEGAJO_INVALIDO', `Legajo inválido "${params.legajo}"`);
    }
    const { periodo, periodoMes, tramo } = await periodoEfectivo(ctx, query);
    const nombres = await nombresPorLegajo(ctx);

    let filas;
    try {
      filas = await ctx.service.calcularResumenPeriodo(periodoMes, [legajo], hoyLocal(), { tramo });
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
