import { generarCalendario, reclasificarDia } from '../domain/calendario-mes.js';
import { recortar, tramosParaTipo } from '../domain/periodo-liquidacion.js';
import { calcularJornadaAuto, aplicarAjustes } from '../domain/jornada.js';
import { construirResumen } from '../domain/resumen-presentismo.js';
import { correccionVigenteDe, crearCorreccion } from '../domain/correccion.js';
import { assertCumplePuerto } from '../ports/index.js';
import { createNullLogger } from '../logging/presentismo-logger.js';

// Servicio orquestador del dominio de presentismo (contracts/ports.md).
// Cablea los puertos (fichadas, categoría, repositorio) con el dominio puro.
// Esta primera parte cubre US1 (calendario); US2/US3/US4 amplían el objeto
// devuelto con calcularEmpleado/correcciones/pausas.
export function createCalcularPresentismoService({
  repo,
  categoriasConfig,
  logger = createNullLogger(),
  fichadasProvider = null,
  categoryProvider = null,
}) {
  assertCumplePuerto('PresentismoRepository', repo);
  assertCumplePuerto('PresentismoLogger', logger);

  const esquemaSemanalDias = categoriasConfig.esquemaSemanal;

  // US1: genera (o regenera preservando reclasificaciones) y persiste.
  async function generarCalendarioMes(periodo) {
    const previo = await repo.cargarCalendario(periodo);
    const cal = generarCalendario(periodo, esquemaSemanalDias, previo);
    await repo.guardarCalendario(cal);
    logger.evento('calendario_generado', {
      periodo,
      dias: cal.dias.length,
      regenerado: Boolean(previo),
    });
    return cal;
  }

  // US1: reclasifica un día y persiste. Recalcular es responsabilidad de quien
  // consuma el calendario (el cálculo es derivado y determinista, research §6).
  async function reclasificarDiaMes(periodo, fecha, clasificacion, autor) {
    const actual = await repo.cargarCalendario(periodo);
    if (!actual) {
      throw new Error(`presentismo: no existe calendario para ${periodo}; generalo primero`);
    }
    const nuevo = reclasificarDia(actual, fecha, clasificacion);
    await repo.guardarCalendario(nuevo);
    logger.evento('dia_reclasificado', { periodo, dia: fecha, clasificacion, autor: autor ?? null });
    return nuevo;
  }

  // Agrupa fichadas por fecha; separa las no imputables (sin fecha, FR-008).
  function agruparFichadas(fichadas) {
    const porFecha = new Map();
    const noImputadas = [];
    for (const f of fichadas) {
      if (f.fecha == null) {
        noImputadas.push(f.id);
        continue;
      }
      if (!porFecha.has(f.fecha)) porFecha.set(f.fecha, []);
      porFecha.get(f.fecha).push(f);
    }
    return { porFecha, noImputadas };
  }

  // US2/US3: calcula el presentismo de un empleado en un período. Devuelve 1
  // resumen (Mensual) o 2 (Quincenal). Categoría ausente o no configurada →
  // resumen con anomalía y sin cálculo automático (FR-035).
  async function calcularEmpleado(legajo, periodo) {
    const calendario = await repo.cargarCalendario(periodo);
    if (!calendario) {
      throw new Error(`presentismo: no existe calendario para ${periodo}; generalo primero`);
    }

    const { codigoCategoria } = categoryProvider
      ? await categoryProvider.obtenerCategoria(legajo)
      : { codigoCategoria: null };

    const modalidad = codigoCategoria
      ? categoriasConfig.resolverModalidadPorCategoria(codigoCategoria)
      : null;

    if (!modalidad) {
      const anomalia = codigoCategoria
        ? `categoría "${codigoCategoria}" no configurada`
        : 'empleado sin categoría en el padrón';
      logger.evento('anomalia', { periodo, legajo, motivo: anomalia });
      return [
        {
          legajo,
          periodo,
          tramo: null,
          modalidad: null,
          sinCalculo: true,
          anomalias: [anomalia],
        },
      ];
    }

    const fichadas = fichadasProvider
      ? await fichadasProvider.obtenerFichadasDelMes(legajo, periodo)
      : [];
    const { porFecha, noImputadas } = agruparFichadas(fichadas);

    const correcciones = await repo.listarCorrecciones(periodo, legajo);
    const pausas = await repo.listarPausas(periodo, legajo);

    const resúmenes = [];
    for (const tramo of tramosParaTipo(modalidad.tipo)) {
      const recorte = recortar(calendario, tramo);
      const jornadas = recorte.dias.map((dia) => {
        const fichadasDia = porFecha.get(dia.fecha) ?? [];
        const auto = calcularJornadaAuto({
          clasificacion: dia.clasificacion,
          fichadas: fichadasDia,
          params: modalidad,
        });
        const correccion = correccionVigenteDe(correcciones, legajo, dia.fecha);
        const pausasDia = pausas.filter((p) => p.vigente !== false && p.fecha === dia.fecha);
        const resultado = aplicarAjustes(auto, { correccion, pausas: pausasDia });
        return { dia, resultado };
      });

      const resumen = construirResumen({
        legajo,
        periodo,
        tramo,
        modalidadTipo: modalidad.tipo,
        params: modalidad,
        jornadas,
      });
      if (noImputadas.length > 0) {
        resumen.anomalias.push({ tipo: 'fichadas_no_imputadas', fichadas: noImputadas });
      }
      // Detalle por jornada (US4) disponible para reportes.
      resumen.jornadas = jornadas.map(({ dia, resultado }) => ({ fecha: dia.fecha, ...resultado }));
      resúmenes.push(resumen);

      logger.evento('periodo_calculado', {
        periodo,
        legajo,
        tramo,
        horasTrabajadas: resumen.horasTrabajadas,
        horasEsperadas: resumen.horasEsperadas,
      });
    }
    return resúmenes;
  }

  async function calcularPlantilla(periodo, legajos) {
    const salida = [];
    for (const legajo of legajos) {
      const r = await calcularEmpleado(legajo, periodo);
      salida.push(...r);
    }
    return salida;
  }

  // US3: corrección manual.
  async function cargarCorreccion({ periodo, legajo, fecha, valorCorregido, autor, motivo }) {
    // Snapshot del valor calculado actual para detectar revisión futura (FR-029).
    const [resumen] = await calcularEmpleado(legajo, periodo).catch(() => [null]);
    const jornadaActual = resumen?.jornadas?.find((j) => j.fecha === fecha) ?? null;
    const valorCalculado = jornadaActual ? jornadaActual.totalDiario : null;
    const correccion = crearCorreccion({ periodo, legajo, fecha, valorCalculado, valorCorregido, autor, motivo });
    await repo.guardarCorreccion(correccion);
    logger.evento('correccion_alta', { periodo, legajo, dia: fecha, autor: autor ?? null });
    return correccion;
  }

  async function revertirCorreccion({ periodo, legajo, fecha, autor }) {
    await repo.revertirCorreccion(periodo, legajo, fecha);
    logger.evento('correccion_reversion', { periodo, legajo, dia: fecha, autor: autor ?? null });
  }

  // US3: pausa intermedia.
  async function cargarPausa({ periodo, legajo, fecha, desde, hasta, autor, motivo }) {
    if (!(Number.isInteger(desde) && Number.isInteger(hasta) && desde < hasta)) {
      throw new Error('presentismo: pausa requiere desde < hasta (minutos-del-día)');
    }
    if (typeof motivo !== 'string' || motivo.trim().length === 0) {
      throw new Error('presentismo: la pausa requiere un motivo (FR-040)');
    }
    const id = await repo.guardarPausa({
      periodo,
      legajo,
      fecha,
      desde,
      hasta,
      autor: autor ?? null,
      motivo: motivo.trim(),
      fechaHora: new Date().toISOString(),
    });
    logger.evento('pausa_alta', { periodo, legajo, dia: fecha, autor: autor ?? null });
    return id;
  }

  async function revertirPausa({ periodo, id, autor }) {
    await repo.revertirPausa(periodo, id);
    logger.evento('pausa_reversion', { periodo, id, autor: autor ?? null });
  }

  return {
    generarCalendario: generarCalendarioMes,
    reclasificarDia: reclasificarDiaMes,
    calcularEmpleado,
    calcularPlantilla,
    cargarCorreccion,
    revertirCorreccion,
    cargarPausa,
    revertirPausa,
  };
}
