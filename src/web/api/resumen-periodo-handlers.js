import { ApiError } from './router.js';
import { construirVistaResumenPeriodo, construirDetalleEmpleado, hoyLocal } from '../view-model.js';
import { RosterNoDisponibleError } from '../../roster/active-employees-provider.js';
import { Tramo } from '../../presentismo/domain/periodo-liquidacion.js';
import { parsePeriodoId, expandirPeriodos, periodoPorDefecto } from './periodo-id.js';

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
  return {
    periodo,
    periodoMes,
    tramo,
    periodos: expandirPeriodos(generados, modo),
    // 018-informe-cierre-periodo — la página usa este flag para habilitar la
    // acción "Emitir informe de cierre" sólo sobre un período cerrado.
    cerrado: Boolean(calendario.cerrado),
  };
}

// `hoy` cae dentro del período mostrado (mes completo, o la quincena
// correspondiente en modo QUINCENAL). Los acumulados de un período "en
// curso" todavía no reflejan sus días futuros (FR-008 de resumen-periodo.js:
// `proyectarResumenPeriodo` filtra `fecha <= hoy`) — la UI usa este flag para
// avisarlo, no para cambiar el cálculo.
function periodoIncluyeHoy(periodoMes, tramo, hoy) {
  const mesHoy = hoy.slice(0, 4) + hoy.slice(5, 7);
  if (periodoMes !== mesHoy) return false;
  if (tramo == null) return true;
  const tramoHoy = Number(hoy.slice(8, 10)) <= 15 ? Tramo.Q1 : Tramo.Q2;
  return tramo === tramoHoy;
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
    const { periodo, periodoMes, tramo, periodos, cerrado } = await periodoEfectivo(ctx, query);
    const legajos = await legajosEsperados(ctx);
    const nombres = await nombresPorLegajo(ctx);
    const hoy = hoyLocal();

    let filas;
    try {
      filas = await ctx.service.calcularResumenPeriodo(periodoMes, legajos, hoy, { tramo });
    } catch (err) {
      throw new ApiError(500, 'ERROR_CALCULANDO_RESUMEN', err.message);
    }
    const conNombre = filas.map((f) => ({ ...f, nombre: nombres.get(f.legajo) ?? null }));
    const enCurso = periodoIncluyeHoy(periodoMes, tramo, hoy);
    return { status: 200, body: construirVistaResumenPeriodo({ periodo, periodos, filas: conNombre, enCurso, cerrado }) };
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
