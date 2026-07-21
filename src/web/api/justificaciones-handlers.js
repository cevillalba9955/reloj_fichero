import { ApiError } from './router.js';
import { hoyLocal } from '../view-model.js';

// feature 012 — Handlers de la API de "Justificación de Ausencias". Delegan
// en el servicio de presentismo (`cargarJustificacion`/`revertirJustificacion`)
// y traducen sus errores `.httpCode` a la forma uniforme `{ error: { codigo,
// mensaje } }`. Ver specs/012-justificacion-ausencias/contracts/web-api.md.

function periodoDe(fecha) {
  return fecha.slice(0, 4) + fecha.slice(5, 7);
}

function exigir(cond, codigo, mensaje) {
  if (!cond) throw new ApiError(400, codigo, mensaje);
}

function validarLegajo(legajo) {
  exigir(Number.isInteger(legajo) && legajo >= 1, 'JUSTIFICACION_INVALIDA', `Legajo inválido "${legajo}"`);
}

function validarFecha(fecha, campo = 'fecha') {
  exigir(
    typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    'JUSTIFICACION_INVALIDA',
    `${campo} inválida "${fecha}" (se espera YYYY-MM-DD)`,
  );
}

// Mapea el `.httpCode` de un error del servicio (contracts/web-api.md) al
// status HTTP correspondiente. Cualquier otro error del dominio (motivo
// inválido, etc.) cae en 400 JUSTIFICACION_INVALIDA.
function relanzarComoApiError(err) {
  // 013-reestructurar-data-periodos (FR-006): PERIODO_CERRADO también aplica
  // acá (alta y reversión de Justificación).
  const status = {
    JUSTIFICACION_NO_APLICABLE: 409,
    RANGO_SIN_DIAS_ELEGIBLES: 409,
    JUSTIFICACION_NO_ENCONTRADA: 404,
    PERIODO_CERRADO: 409,
  }[err.httpCode];
  if (status) throw new ApiError(status, err.httpCode, err.message);
  throw new ApiError(400, 'JUSTIFICACION_INVALIDA', err.message);
}

// 409 EMPLEADO_SIN_CATEGORIA: mismo criterio que fichadas-hoy-handlers.js.
async function exigirCategoriaConfigurada(ctx, legajo, periodo) {
  let resúmenes;
  try {
    resúmenes = await ctx.service.calcularEmpleado(legajo, periodo);
  } catch (err) {
    throw new ApiError(500, 'ERROR_CALCULANDO_JUSTIFICACION', err.message);
  }
  if (resúmenes[0]?.sinCalculo) {
    throw new ApiError(
      409,
      'EMPLEADO_SIN_CATEGORIA',
      `El legajo ${legajo} no tiene categoría de presentismo configurada: ${(resúmenes[0].anomalias ?? []).join('; ')}`,
    );
  }
}

async function exigirCalendarioGenerado(ctx, periodo) {
  const calendario = await ctx.repo.cargarCalendario(periodo);
  if (!calendario) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', `No hay calendario para ${periodo}`);
  }
}

export function registrarRutas(router, ctx) {
  // GET /api/motivos-ausencia → catálogo de motivos activos (para el selector).
  router.add('GET', '/api/motivos-ausencia', async () => {
    const motivos = (ctx.motivosAusenciaConfig?.listarActivos() ?? []).map((m) => ({
      id: m.id,
      etiqueta: m.etiqueta,
      tipoPago: m.tipoPago,
    }));
    return { status: 200, body: { motivos } };
  });

  // POST /api/justificaciones (US1) — día único (`hasta` ausente) o rango
  // `[fecha, hasta]` (FR-003a). Ver contracts/web-api.md para la forma de la
  // respuesta y los códigos de error.
  router.add('POST', '/api/justificaciones', async ({ body }) => {
    const { legajo, fecha, hasta = null, motivoId, autor = null } = body ?? {};
    validarLegajo(legajo);
    validarFecha(fecha);
    if (hasta != null) validarFecha(hasta, 'hasta');
    exigir(
      typeof motivoId === 'string' && motivoId.trim().length > 0,
      'JUSTIFICACION_INVALIDA',
      'El motivo es obligatorio',
    );
    if (hasta != null) {
      exigir(hasta >= fecha, 'JUSTIFICACION_INVALIDA', 'El rango requiere hasta >= fecha');
    }

    const periodo = periodoDe(fecha);
    await exigirCalendarioGenerado(ctx, periodo);
    await exigirCategoriaConfigurada(ctx, legajo, periodo);

    try {
      const resultado = await ctx.service.cargarJustificacion({
        legajo,
        fecha,
        hasta,
        motivoId,
        autor,
        hoy: hoyLocal(),
      });
      return { status: 200, body: resultado };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      relanzarComoApiError(err);
    }
  });

  // DELETE /api/justificaciones (US3) — revierte la Justificación vigente.
  router.add('DELETE', '/api/justificaciones', async ({ body }) => {
    const { legajo, fecha, autor = null } = body ?? {};
    validarLegajo(legajo);
    validarFecha(fecha);

    const periodo = periodoDe(fecha);
    try {
      await ctx.service.revertirJustificacion({ periodo, legajo, fecha, autor });
      return { status: 200, body: { fecha, revertida: true } };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      relanzarComoApiError(err);
    }
  });
}
