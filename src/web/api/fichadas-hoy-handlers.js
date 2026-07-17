import { ApiError } from './router.js';
import { construirVistaFichadasHoy, construirFilaFichadaHoy, hoyLocal } from '../view-model.js';
import { RosterNoDisponibleError } from '../../roster/active-employees-provider.js';
import { parseHoraMinuto } from '../../presentismo/domain/tiempo.js';

// feature 010 — Handlers de la API de la página "Fichadas de Hoy". Delegan en
// el servicio de presentismo (004) y arman las proyecciones de presentación
// (view-model.js). Ninguna respuesta expone datos biométricos ni rawHex
// (Principio V, FR-015). Ver specs/010-fichadas-hoy/contracts/web-api.md.

function periodoDe(fecha) {
  return fecha.slice(0, 4) + fecha.slice(5, 7);
}

function validarFecha(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new ApiError(400, 'FECHA_INVALIDA', `Fecha inválida "${fecha}" (se espera YYYY-MM-DD)`);
  }
}

// Validadores comunes de los POST (todos comparten códigos por operación).
function exigir(cond, codigo, mensaje) {
  if (!cond) throw new ApiError(400, codigo, mensaje);
}

function validarLegajo(legajo, codigo) {
  exigir(Number.isInteger(legajo) && legajo >= 1, codigo, `Legajo inválido "${legajo}"`);
}

function validarMotivo(motivo, codigo) {
  exigir(
    typeof motivo === 'string' && motivo.trim().length > 0,
    codigo,
    'El motivo es obligatorio (FR-004)',
  );
}

function validarFechaCuerpo(fecha, codigo) {
  exigir(
    typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
    codigo,
    `Fecha inválida "${fecha}" (se espera YYYY-MM-DD)`,
  );
}

// 'HH:MM' → minutos-del-día, o null si no vino. Formato inválido → 400.
function parseHoraOpcional(valor, campo, codigo) {
  if (valor == null) return null;
  try {
    return parseHoraMinuto(String(valor));
  } catch {
    throw new ApiError(400, codigo, `${campo} inválida "${valor}" (se espera HH:MM)`);
  }
}

// 409 EMPLEADO_SIN_CATEGORIA: no tiene sentido corregir/ajustar una jornada que
// no se calcula (anomalía FR-014). Lanza 500 si el cálculo mismo falla.
async function exigirCategoriaConfigurada(ctx, legajo, periodo) {
  let resúmenes;
  try {
    resúmenes = await ctx.service.calcularEmpleado(legajo, periodo);
  } catch (err) {
    throw new ApiError(500, 'ERROR_CALCULANDO_FICHADAS_HOY', err.message);
  }
  if (resúmenes[0]?.sinCalculo) {
    throw new ApiError(
      409,
      'EMPLEADO_SIN_CATEGORIA',
      `El legajo ${legajo} no tiene categoría de presentismo configurada: ${(resúmenes[0].anomalias ?? []).join('; ')}`,
    );
  }
}

// Legajos esperados hoy, del snapshot local del padrón (research.md §5). Un
// padrón vacío o aún no sincronizado no es un error HTTP: la página se muestra
// sin filas (la anomalía de configuración se resuelve con `sincronizar-padron`).
async function legajosEsperados(ctx) {
  try {
    const empleados = await ctx.activeEmployeesProvider.getActiveEmployees();
    return empleados.map((e) => e.legajo);
  } catch (err) {
    if (err instanceof RosterNoDisponibleError) return [];
    throw err;
  }
}

// Nombre por legajo desde el mismo snapshot (único dato personal expuesto,
// data-model.md). Best-effort: sin snapshot legible, los nombres quedan null.
async function nombresPorLegajo(ctx) {
  try {
    const lista = await ctx.categoryProvider.listar();
    return new Map(lista.map((e) => [e.legajo, e.nombre ?? null]));
  } catch {
    return new Map();
  }
}

function conNombre(filas, nombres) {
  return filas.map((f) => ({ ...f, nombre: nombres.get(f.legajo) ?? null }));
}

// Arma la VistaFichadasHoy completa de una fecha.
async function vistaHoy(ctx, fecha) {
  const legajos = await legajosEsperados(ctx);
  const nombres = await nombresPorLegajo(ctx);
  let resultado;
  try {
    resultado = await ctx.service.calcularHoy(periodoDe(fecha), fecha, legajos);
  } catch (err) {
    throw new ApiError(500, 'ERROR_CALCULANDO_FICHADAS_HOY', err.message);
  }
  const { periodo, diaClasificacion, filas } = resultado;
  return construirVistaFichadasHoy({
    fecha,
    periodo,
    diaClasificacion,
    filas: conNombre(filas, nombres),
  });
}

// Recalcula y devuelve la FilaFichadaHoy de un solo legajo (respuesta de los
// POST de corrección/pausa/retiro: la UI refresca la fila sin recargar todo).
async function filaDe(ctx, fecha, legajo) {
  const nombres = await nombresPorLegajo(ctx);
  let resultado;
  try {
    resultado = await ctx.service.calcularHoy(periodoDe(fecha), fecha, [legajo]);
  } catch (err) {
    throw new ApiError(500, 'ERROR_CALCULANDO_FICHADAS_HOY', err.message);
  }
  const [fila] = conNombre(resultado.filas, nombres);
  return construirFilaFichadaHoy(fila);
}

export function registrarRutas(router, ctx) {
  // GET /api/fichadas-hoy → VistaFichadasHoy del día actual del servidor.
  // `?fecha=YYYY-MM-DD` solo para pruebas/soporte (alcance: el día en curso).
  router.add('GET', '/api/fichadas-hoy', async ({ query }) => {
    const fecha = query.fecha ?? hoyLocal();
    validarFecha(fecha);
    return { status: 200, body: await vistaHoy(ctx, fecha) };
  });

  // POST /api/fichadas-hoy/correcciones (US2) — corrige entrada/salida (HH:MM)
  // y/o el total (compat 004), con motivo obligatorio. Devuelve la fila
  // recalculada. Delegan en service.cargarCorreccion (auditoría de 004).
  router.add('POST', '/api/fichadas-hoy/correcciones', async ({ body }) => {
    const { legajo, fecha, entrada = null, salida = null, totalHoras = null, autor = null, motivo } = body ?? {};
    validarLegajo(legajo, 'CORRECCION_INVALIDA');
    validarFechaCuerpo(fecha, 'CORRECCION_INVALIDA');
    validarMotivo(motivo, 'CORRECCION_INVALIDA');
    parseHoraOpcional(entrada, 'Hora de entrada', 'CORRECCION_INVALIDA');
    parseHoraOpcional(salida, 'Hora de salida', 'CORRECCION_INVALIDA');
    exigir(
      entrada != null || salida != null || totalHoras != null,
      'CORRECCION_INVALIDA',
      'Nada que corregir: indicá entrada, salida o totalHoras',
    );

    const periodo = periodoDe(fecha);
    await exigirCategoriaConfigurada(ctx, legajo, periodo);

    try {
      await ctx.service.cargarCorreccion({
        periodo,
        legajo,
        fecha,
        valorCorregido: totalHoras,
        entrada,
        salida,
        autor,
        motivo,
      });
    } catch (err) {
      throw new ApiError(400, 'CORRECCION_INVALIDA', err.message);
    }
    return { status: 200, body: await filaDe(ctx, fecha, legajo) };
  });

  // POST /api/fichadas-hoy/pausas (US3) — pausa intermedia [desde, hasta] con
  // motivo obligatorio; descuenta solo el solape con la jornada efectiva.
  router.add('POST', '/api/fichadas-hoy/pausas', async ({ body }) => {
    const { legajo, fecha, desde, hasta, autor = null, motivo } = body ?? {};
    validarLegajo(legajo, 'PAUSA_INVALIDA');
    validarFechaCuerpo(fecha, 'PAUSA_INVALIDA');
    validarMotivo(motivo, 'PAUSA_INVALIDA');
    const desdeMin = parseHoraOpcional(desde, 'Hora "desde"', 'PAUSA_INVALIDA');
    const hastaMin = parseHoraOpcional(hasta, 'Hora "hasta"', 'PAUSA_INVALIDA');
    exigir(desdeMin != null && hastaMin != null, 'PAUSA_INVALIDA', 'Faltan "desde" y/o "hasta" (HH:MM)');
    exigir(desdeMin < hastaMin, 'PAUSA_INVALIDA', 'La pausa requiere desde < hasta');

    const periodo = periodoDe(fecha);
    await exigirCategoriaConfigurada(ctx, legajo, periodo);

    try {
      await ctx.service.cargarPausa({
        periodo,
        legajo,
        fecha,
        desde: desdeMin,
        hasta: hastaMin,
        autor,
        motivo,
      });
    } catch (err) {
      throw new ApiError(400, 'PAUSA_INVALIDA', err.message);
    }
    return { status: 200, body: await filaDe(ctx, fecha, legajo) };
  });

  // POST /api/fichadas-hoy/retiros-anticipados (US3) — construye una Pausa
  // tipo 'retiro_anticipado' desde `hora` hasta el cierre oficial del día.
  router.add('POST', '/api/fichadas-hoy/retiros-anticipados', async ({ body }) => {
    const { legajo, fecha, hora, autor = null, motivo } = body ?? {};
    validarLegajo(legajo, 'RETIRO_INVALIDO');
    validarFechaCuerpo(fecha, 'RETIRO_INVALIDO');
    validarMotivo(motivo, 'RETIRO_INVALIDO');
    const horaMin = parseHoraOpcional(hora, 'Hora del retiro', 'RETIRO_INVALIDO');
    exigir(horaMin != null, 'RETIRO_INVALIDO', 'Falta la "hora" del retiro (HH:MM)');

    const periodo = periodoDe(fecha);
    await exigirCategoriaConfigurada(ctx, legajo, periodo);

    try {
      await ctx.service.cargarRetiroAnticipado({
        periodo,
        legajo,
        fecha,
        hora: horaMin,
        autor,
        motivo,
      });
    } catch (err) {
      throw new ApiError(400, 'RETIRO_INVALIDO', err.message);
    }
    return { status: 200, body: await filaDe(ctx, fecha, legajo) };
  });

  // POST /api/fichadas-hoy/consultar-reloj (US4) — NO toca el scheduler en este
  // proceso (research.md §4): pide un ciclo por HTTP local al servicio de
  // fichadas (único dueño de la conexión al reloj, Principio III). El sink del
  // scheduler persiste ANTES de responder el /tick, así que la vista
  // recalculada ya incluye las fichadas nuevas.
  router.add('POST', '/api/fichadas-hoy/consultar-reloj', async () => {
    const r = await ctx.consultarReloj.consultar();
    if (!r.ok || r.resultado === 'error') {
      throw new ApiError(
        502,
        'ERROR_CONSULTANDO_RELOJ',
        r.ok ? r.detail ?? 'el ciclo de consulta al reloj terminó en error' : r.motivo,
      );
    }
    const fecha = hoyLocal();
    return {
      status: 200,
      body: {
        resultado: r.resultado,
        fichadasNuevas: r.fichadasNuevas,
        vista: await vistaHoy(ctx, fecha),
      },
    };
  });
}
