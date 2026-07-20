import { generarCalendario, reclasificarDia } from '../domain/calendario-mes.js';
import { recortar, tramosParaTipo, fechaEnTramo } from '../domain/periodo-liquidacion.js';
import { calcularJornadaAuto, aplicarAjustes } from '../domain/jornada.js';
import { construirResumen } from '../domain/resumen-presentismo.js';
import { correccionVigenteDe, crearCorreccion } from '../domain/correccion.js';
import { calcularSituacionHoy, SituacionDia } from '../domain/situacion-dia.js';
import { proyectarResumenPeriodo } from '../domain/resumen-periodo.js';
import { parseHoraMinuto } from '../domain/tiempo.js';
import { TipoPausa, normalizarTipoPausa } from '../domain/pausa.js';
import { assertCumplePuerto } from '../ports/index.js';
import { createNullLogger } from '../logging/presentismo-logger.js';

// Minutos-del-día del reloj local del servidor (feature 010, situación "hoy").
function minutosAhora(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

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
    const clasificacionAnterior = actual.dias.find((d) => d.fecha === fecha)?.clasificacion ?? null;
    const nuevo = reclasificarDia(actual, fecha, clasificacion);
    await repo.guardarCalendario(nuevo);
    logger.evento('dia_reclasificado', {
      periodo,
      dia: fecha,
      clasificacionAnterior,
      clasificacion,
      autor: autor ?? null,
    });
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

  // Resuelve la modalidad (params) de un legajo vía su categoría del padrón.
  // modalidad null = anomalía (sin categoría o categoría no configurada).
  async function resolverModalidad(legajo) {
    const { codigoCategoria } = categoryProvider
      ? await categoryProvider.obtenerCategoria(legajo)
      : { codigoCategoria: null };
    const modalidad = codigoCategoria
      ? categoriasConfig.resolverModalidadPorCategoria(codigoCategoria)
      : null;
    return { codigoCategoria, modalidad };
  }

  // US2/US3: calcula el presentismo de un empleado en un período. Devuelve 1
  // resumen (Mensual) o 2 (Quincenal). Categoría ausente o no configurada →
  // resumen con anomalía y sin cálculo automático (FR-035).
  async function calcularEmpleado(legajo, periodo) {
    const calendario = await repo.cargarCalendario(periodo);
    if (!calendario) {
      throw new Error(`presentismo: no existe calendario para ${periodo}; generalo primero`);
    }

    const { codigoCategoria, modalidad } = await resolverModalidad(legajo);

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
        const resultado = aplicarAjustes(auto, { correccion, pausas: pausasDia, params: modalidad });
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

  // feature 010 (US1): proyección del día en curso para la página "Fichadas de
  // hoy". Por cada legajo esperado, reutiliza calcularEmpleado (auto + ajustes,
  // FR-002), ubica la jornada de `fecha` y le aplica calcularSituacionHoy.
  // `ahora` en minutos-del-día (inyectable para tests; default reloj del server).
  async function calcularHoy(periodo, fecha, legajos, { ahora = minutosAhora() } = {}) {
    const calendario = await repo.cargarCalendario(periodo);
    if (!calendario) {
      throw new Error(`presentismo: no existe calendario para ${periodo}; generalo primero`);
    }
    const diaCal = calendario.dias.find((d) => d.fecha === fecha);
    if (!diaCal) {
      throw new Error(`presentismo: la fecha ${fecha} no pertenece al período ${periodo}`);
    }

    const filas = [];
    for (const legajo of legajos) {
      const resúmenes = await calcularEmpleado(legajo, periodo);
      if (resúmenes[0]?.sinCalculo) {
        // Anomalía (FR-014): se muestra distinguida, sin situación normal.
        filas.push({
          legajo,
          jornada: null,
          situacion: SituacionDia.ANOMALIA,
          anomalias: resúmenes[0].anomalias ?? [],
        });
        continue;
      }
      const { modalidad } = await resolverModalidad(legajo);
      let jornada = null;
      for (const r of resúmenes) {
        jornada = r.jornadas?.find((j) => j.fecha === fecha) ?? null;
        if (jornada) break;
      }
      const situacion = jornada
        ? calcularSituacionHoy({
            clasificacion: jornada.clasificacion,
            auto: jornada,
            ajustado: jornada,
            ahora,
            params: modalidad,
          })
        : SituacionDia.NO_APLICA;
      filas.push({ legajo, jornada, situacion, anomalias: [] });
    }
    return { fecha, periodo, diaClasificacion: diaCal.clasificacion, filas };
  }

  // feature 011 (US1): resumen del período por empleado para la página
  // "Resumen del Período". Reutiliza calcularEmpleado (auto + ajustes); para
  // quincenales suma los tramos Q1+Q2 en una fila mensual única concatenando
  // sus jornadas (research.md §3). `hoy` en 'YYYY-MM-DD' (FR-008; inyectable
  // para tests, default hoyLocal del servidor vía el caller). `tramo` (Q1/Q2)
  // recorta el resumen a esa quincena (modo QUINCENAL, FR-013): aplica a TODOS
  // los empleados, sea cual sea su modalidad.
  async function calcularResumenPeriodo(periodo, legajos, hoy, { tramo = null } = {}) {
    const filas = [];
    for (const legajo of legajos) {
      const resúmenes = await calcularEmpleado(legajo, periodo);
      if (resúmenes[0]?.sinCalculo) {
        filas.push({ legajo, anomalia: resúmenes[0].anomalias?.[0] ?? 'sin categoría configurada' });
        continue;
      }
      const params = resúmenes[0].params;
      const jornadas = resúmenes
        .flatMap((r) => r.jornadas ?? [])
        .filter((j) => tramo == null || fechaEnTramo(j.fecha, tramo));
      const proyeccion = proyectarResumenPeriodo({ resumen: { legajo, params, jornadas }, hoy });
      filas.push({ ...proyeccion, anomalia: null });
    }
    return filas;
  }

  async function calcularPlantilla(periodo, legajos) {
    const salida = [];
    for (const legajo of legajos) {
      const r = await calcularEmpleado(legajo, periodo);
      salida.push(...r);
    }
    return salida;
  }

  // US3 (004): corrección manual del total. Feature 010: acepta además la
  // corrección de la hora de entrada y/o salida en 'HH:MM' (research.md §3).
  async function cargarCorreccion({ periodo, legajo, fecha, valorCorregido, entrada, salida, autor, motivo }) {
    const entradaCorregida = entrada != null ? parseHoraMinuto(entrada) : null;
    const salidaCorregida = salida != null ? parseHoraMinuto(salida) : null;
    // Snapshot del valor calculado actual para detectar revisión futura (FR-029).
    const [resumen] = await calcularEmpleado(legajo, periodo).catch(() => [null]);
    const jornadaActual = resumen?.jornadas?.find((j) => j.fecha === fecha) ?? null;
    const valorCalculado = jornadaActual ? jornadaActual.totalDiario : null;
    const correccion = crearCorreccion({
      periodo,
      legajo,
      fecha,
      valorCalculado,
      valorCorregido,
      entradaCorregida,
      salidaCorregida,
      autor,
      motivo,
    });
    await repo.guardarCorreccion(correccion);
    logger.evento('correccion_alta', {
      periodo,
      legajo,
      dia: fecha,
      autor: autor ?? null,
      campos: correccion.camposCorregidos,
    });
    return correccion;
  }

  async function revertirCorreccion({ periodo, legajo, fecha, autor }) {
    await repo.revertirCorreccion(periodo, legajo, fecha);
    logger.evento('correccion_reversion', { periodo, legajo, dia: fecha, autor: autor ?? null });
  }

  // US3 (004): pausa intermedia. Feature 010: acepta `tipo` (default
  // 'intermedia'; 'retiro_anticipado' entra por cargarRetiroAnticipado).
  async function cargarPausa({ periodo, legajo, fecha, desde, hasta, autor, motivo, tipo }) {
    if (!(Number.isInteger(desde) && Number.isInteger(hasta) && desde < hasta)) {
      throw new Error('presentismo: pausa requiere desde < hasta (minutos-del-día)');
    }
    if (typeof motivo !== 'string' || motivo.trim().length === 0) {
      throw new Error('presentismo: la pausa requiere un motivo (FR-040)');
    }
    const tipoPausa = normalizarTipoPausa(tipo);
    const id = await repo.guardarPausa({
      periodo,
      legajo,
      fecha,
      desde,
      hasta,
      tipo: tipoPausa,
      autor: autor ?? null,
      motivo: motivo.trim(),
      fechaHora: new Date().toISOString(),
    });
    // `tipoPausa` (no `tipo`): el spread del logger reserva `tipo` para el
    // nombre del evento NDJSON.
    logger.evento('pausa_alta', { periodo, legajo, dia: fecha, autor: autor ?? null, tipoPausa });
    return id;
  }

  // feature 010 (US3): retiro anticipado = Pausa tipo 'retiro_anticipado' desde
  // la hora de retiro hasta el cierre oficial de la modalidad del empleado ese
  // día (research.md §2). La hora debe ser anterior al cierre (si no, no hay
  // nada "anticipado" que descontar).
  async function cargarRetiroAnticipado({ periodo, legajo, fecha, hora, autor, motivo }) {
    if (!Number.isInteger(hora)) {
      throw new Error('presentismo: el retiro anticipado requiere la hora en minutos-del-día');
    }
    const { modalidad } = await resolverModalidad(legajo);
    if (!modalidad) {
      throw new Error(`presentismo: el legajo ${legajo} no tiene categoría configurada`);
    }
    if (hora >= modalidad.cierreOficial) {
      throw new Error(
        'presentismo: la hora del retiro debe ser anterior al cierre oficial de la jornada',
      );
    }
    return cargarPausa({
      periodo,
      legajo,
      fecha,
      desde: hora,
      hasta: modalidad.cierreOficial,
      autor,
      motivo,
      tipo: TipoPausa.RETIRO_ANTICIPADO,
    });
  }

  async function revertirPausa({ periodo, id, autor }) {
    await repo.revertirPausa(periodo, id);
    logger.evento('pausa_reversion', { periodo, id, autor: autor ?? null });
  }

  return {
    generarCalendario: generarCalendarioMes,
    reclasificarDia: reclasificarDiaMes,
    calcularEmpleado,
    calcularHoy,
    calcularResumenPeriodo,
    calcularPlantilla,
    cargarCorreccion,
    revertirCorreccion,
    cargarPausa,
    cargarRetiroAnticipado,
    revertirPausa,
  };
}
