import { ApiError } from './router.js';

// spec 015 — Handlers de la API de "Control de Vacaciones Anual". Delegan en
// el servicio de presentismo y traducen sus errores `.httpCode` a la forma
// uniforme `{ error: { codigo, mensaje } }` (mismo patrón que
// justificaciones-handlers.js). Ver contracts/web-api.md.

function exigir(cond, codigo, mensaje) {
  if (!cond) throw new ApiError(400, codigo, mensaje);
}

function validarLegajo(legajo) {
  exigir(Number.isInteger(legajo) && legajo >= 1, 'VACACIONES_INVALIDA', `Legajo inválido "${legajo}"`);
}

// Mapea el `.httpCode` de un error del servicio al status HTTP
// correspondiente (contracts/web-api.md). Cualquier otro error del dominio
// cae en 400 VACACIONES_INVALIDA.
function relanzarComoApiError(err) {
  const status = {
    CALENDARIO_NO_GENERADO: 404,
    PERIODO_CERRADO: 409,
    VACACIONES_SUPERPUESTA: 409,
    VACACIONES_NO_ENCONTRADA: 404,
  }[err.httpCode];
  if (status) {
    const mensaje = err.fechas ? `${err.message} (${err.fechas.join(', ')})` : err.message;
    throw new ApiError(status, err.httpCode, mensaje);
  }
  throw new ApiError(400, 'VACACIONES_INVALIDA', err.message);
}

export function registrarRutas(router, ctx) {
  // GET /api/vacaciones (US2, FR-008) — lista antigüedad/saldo/próximo
  // incremento de cada legajo activo del padrón.
  router.add('GET', '/api/vacaciones', async () => {
    const empleados = await ctx.activeEmployeesProvider.getActiveEmployees();
    const legajos = await ctx.service.listarVacaciones(empleados);
    return { status: 200, body: { legajos } };
  });

  // GET /api/vacaciones/:legajo (US2, FR-009) — historial completo de
  // movimientos y asignaciones de un legajo.
  router.add('GET', '/api/vacaciones/:legajo', async ({ params }) => {
    const legajo = Number(params.legajo);
    validarLegajo(legajo);
    const resultado = await ctx.service.consultarVacaciones(legajo);
    return { status: 200, body: resultado };
  });

  // POST /api/vacaciones/asignaciones (US1) — asigna un período de
  // vacaciones a un legajo.
  router.add('POST', '/api/vacaciones/asignaciones', async ({ body }) => {
    const { legajo, fechaInicio, cantidadDias, autor = null } = body ?? {};
    validarLegajo(legajo);
    exigir(
      typeof fechaInicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio),
      'VACACIONES_INVALIDA',
      `fechaInicio inválida "${fechaInicio}" (se espera YYYY-MM-DD)`,
    );
    exigir(
      Number.isInteger(cantidadDias) && cantidadDias > 0,
      'VACACIONES_INVALIDA',
      'cantidadDias debe ser un entero mayor a 0',
    );

    try {
      const resultado = await ctx.service.asignarVacaciones({ legajo, fechaInicio, cantidadDias, autor });
      return { status: 200, body: resultado };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      relanzarComoApiError(err);
    }
  });

  // DELETE /api/vacaciones/asignaciones/:id (US4) — revierte una Asignación
  // de Vacaciones vigente.
  router.add('DELETE', '/api/vacaciones/asignaciones/:id', async ({ params, body }) => {
    const { id } = params;
    const { autor = null } = body ?? {};
    try {
      const resultado = await ctx.service.revertirAsignacionVacaciones({ id, autor });
      return { status: 200, body: resultado };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      relanzarComoApiError(err);
    }
  });
}
