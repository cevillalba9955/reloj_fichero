import { Clasificacion } from './calendario-mes.js';
import { EstadoJornada } from './jornada.js';
import { esEntradaTarde } from './situacion-dia.js';
import { TipoPausa } from './pausa.js';
import { MotivoVacaciones } from './vacaciones.js';

// feature 011 — Proyección pura del resumen de un período por empleado
// (data-model.md, research.md §1-§2). Deriva la fila de acumulados y el
// detalle día por día de UNA SOLA pasada sobre `resumen.jornadas` filtrado por
// `fecha <= hoy` (FR-008: días futuros no cuentan). La corrección vigente
// prevalece en TODOS los contadores (Clarifications del spec).

// Hora considerada de entrada/salida: la corregida si hay corrección vigente,
// la fichada REAL si no. Nunca la "efectiva" ajustada por tolerancia: el
// ajuste solo afecta el cálculo de horas, no lo que se muestra ni lo que se
// evalúa como llegada tarde (misma regla que construirFilaFichadaHoy, 010).
function entradaConsiderada(jornada) {
  return jornada.correccionVigente
    ? jornada.correccion?.entradaCorregida ?? jornada.entrada?.hora ?? null
    : jornada.entrada?.hora ?? null;
}

function salidaConsiderada(jornada) {
  return jornada.correccionVigente
    ? jornada.correccion?.salidaCorregida ?? jornada.salida?.hora ?? null
    : jornada.salida?.hora ?? null;
}

// jornada: { fecha, clasificacion, estado, entrada, salida, entradaEfectiva,
//   salidaEfectiva, totalDiario, correccionVigente, correccion, pausas }
// (misma forma que resumen.jornadas de calcularEmpleado, 004).
export function esLlegadaTarde(jornada, params) {
  if (jornada.clasificacion !== Clasificacion.LABORABLE) return false;
  return esEntradaTarde(entradaConsiderada(jornada), params);
}

// feature 012 — proyección mínima de la Justificación vigente de un día para
// el detalle/resumen (data-model.md "Proyección en el resumen del período").
function justificacionDe(jornada) {
  if (!jornada.justificacion) return null;
  const { motivoId, etiquetaMotivo, tipoPago } = jornada.justificacion;
  return { motivoId, etiquetaMotivo, tipoPago };
}

// issue #40 — minutos que se dejan de pagar por `minutos` de tardanza/retiro:
// el total diario se trunca hacia abajo a la grilla de 30 min, así que el
// descuento equivalente se redondea hacia arriba a esa grilla (10 min tarde →
// 30 min). Acotado a la jornada esperada.
function descuentoPagado(minutos, jornadaEsperada) {
  if (!(minutos > 0)) return 0;
  return Math.min(jornadaEsperada, Math.ceil(minutos / 30) * 30);
}

// Agrupa fechas 'YYYY-MM-DD' ordenadas en rangos de días corridos consecutivos:
// ['2026-11-02', ..., '2026-11-08'] → [{ desde: '2026-11-02', hasta: '2026-11-08' }].
function agruparRangos(fechas) {
  const rangos = [];
  for (const f of fechas) {
    const ultimo = rangos[rangos.length - 1];
    const siguiente = ultimo ? new Date(`${ultimo.hasta}T00:00:00Z`) : null;
    if (siguiente) siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    if (ultimo && siguiente.toISOString().slice(0, 10) === f) ultimo.hasta = f;
    else rangos.push({ desde: f, hasta: f });
  }
  return rangos;
}

function detalleDeJornada(jornada, params) {
  const pausasVigentes = (jornada.pausas ?? []).filter((p) => p.vigente !== false);
  return {
    fecha: jornada.fecha,
    clasificacion: jornada.clasificacion,
    estado: jornada.estado,
    entrada: entradaConsiderada(jornada),
    salida: salidaConsiderada(jornada),
    horas: jornada.totalDiario ?? 0,
    // Parte de `horas` acreditada como licencia paga (el resto es trabajado).
    horasLicencia: jornada.horasLicencia ?? 0,
    llegadaTarde: esLlegadaTarde(jornada, params),
    corregida: Boolean(jornada.correccionVigente),
    // Motivo de la corrección vigente (FR-027: siempre presente cuando hay
    // corrección). Se expone en el detalle para que el informe de cierre lo
    // muestre junto a la marca "corregida".
    motivoCorreccion: jornada.correccionVigente ? jornada.correccion?.motivo ?? null : null,
    pausas: pausasVigentes.map((p) => ({ desde: p.desde, hasta: p.hasta, tipo: p.tipo ?? TipoPausa.INTERMEDIA })),
    justificacion: justificacionDe(jornada),
    requiereJustificacionRevision: Boolean(jornada.requiereJustificacionRevision),
  };
}

// `resumen` es UN resumen de calcularEmpleado (o la concatenación de tramos
// Q1+Q2 para quincenales, research.md §3): { legajo, params, jornadas }.
// `hoy` es 'YYYY-MM-DD' (corte de días futuros, FR-008).
export function proyectarResumenPeriodo({ resumen, hoy }) {
  const { params } = resumen;
  // `params` puede venir como la modalidad completa (`jornadaEsperada`) o como
  // el subconjunto que arma construirResumen (`aperturaOficial`/`cierreOficial`
  // en minutos-del-día). Se resuelve la jornada esperada de cualquiera de los dos.
  const jornadaEsperada =
    params?.jornadaEsperada ?? Math.max(0, (params?.cierreOficial ?? 0) - (params?.aperturaOficial ?? 0));
  const detalle = resumen.jornadas
    .filter((j) => j.fecha <= hoy)
    .map((j) => detalleDeJornada(j, params));

  let horasTrabajadas = 0;
  let completas = 0;
  let incompletas = 0;
  let ausencias = 0;
  let llegadasTarde = 0;
  let retirosAnticipados = 0;
  let correcciones = 0;
  // feature 012 (FR-012): dos columnas nuevas junto a las 7 anteriores.
  // `feriado` cuenta días Feriado del período; `licencia` cuenta días con
  // Justificación `Paga` vigente. Una Justificación `No paga` NO tiene
  // columna propia: sigue sumando a `ausencias` (Clarifications 2026-07-20).
  let feriado = 0;
  let licencia = 0;
  // spec 015 — `vacaciones` cuenta los días con la Justificación-espejo que
  // genera una Asignación de Vacaciones (`MotivoVacaciones.id`, "No paga":
  // sin esta columna propia, quedarían mezclados dentro de `ausencias`).
  let vacaciones = 0;
  const fechasVacaciones = [];
  const fechasAusencias = [];
  // 018 — DENOMINADOR del presentismo: la jornada esperada de cada día
  // LABORABLE del tramo. Los FERIADOS NO cuentan (no son trabajo exigible) y
  // las VACACIONES tampoco (el empleado no debía presentarse). Los días de
  // LICENCIA paga (ART, enfermedad, etc.) SÍ cuentan: eran días laborables en
  // los que se esperaba trabajo. Ver el feedback: "el denominador sigue
  // contemplando el total esperado; el feriado no se cuenta".
  let horasEsperadas = 0;
  // 018 — NUMERADOR del presentismo: SOLO las horas efectivamente trabajadas en
  // días laborables. El crédito fijo de un día de licencia paga o de un feriado
  // NO entra acá (sí en `horasTrabajadas`, que alimenta la columna "Horas" y la
  // liquidación). "solo contabilizar horas trabajadas".
  let horasComputadas = 0;
  // issue #40 — horas (minutos) de los días que cuenta cada columna del resumen,
  // con el mismo criterio de día que su contador. Presentes + Feriados +
  // Licencia (+ En Curso y Vacaciones, sin columna de horas) suman `horasTrabajadas`.
  // Tarde y Retiros no suman horas: muestran los minutos DESCONTADOS por esos
  // días (`descuentoPor`), porque ya están dentro de las horas de Presentes.
  const horasPor = { presentes: 0, ausencias: 0, feriado: 0, licencia: 0 };
  const descuentoPor = { tarde: 0, retiros: 0 };
  const apertura = params?.aperturaOficial ?? 0;

  for (const d of detalle) {
    horasTrabajadas += d.horas;
    const esLicencia = d.justificacion?.tipoPago === 'Paga';
    const esVacaciones = d.justificacion?.motivoId === MotivoVacaciones.id;
    const trabajado = d.estado === EstadoJornada.COMPLETA || d.estado === EstadoJornada.INCOMPLETA;
    if (d.clasificacion === Clasificacion.LABORABLE && !esVacaciones) {
      horasEsperadas += jornadaEsperada;
      // El día de licencia sin fichadas queda en 0 (su crédito no es trabajo);
      // si hubo fichadas reales pese a la justificación, esas horas sí cuentan.
      if (trabajado) horasComputadas += d.horas - d.horasLicencia;
    }
    if (d.clasificacion === Clasificacion.FERIADO) {
      feriado += 1;
      horasPor.feriado += d.horas;
    }
    if (esLicencia) {
      licencia += 1;
      horasPor.licencia += d.horasLicencia;
    }
    if (esVacaciones) {
      vacaciones += 1;
      fechasVacaciones.push(d.fecha);
    }
    if (d.estado === EstadoJornada.COMPLETA) {
      completas += 1;
      horasPor.presentes += d.horas - d.horasLicencia;
    } else if (d.estado === EstadoJornada.INCOMPLETA) incompletas += 1;
    else if (d.estado === EstadoJornada.SIN_FICHADAS && !esLicencia && !esVacaciones) {
      ausencias += 1;
      horasPor.ausencias += d.horas;
      fechasAusencias.push(d.fecha);
    }
    if (d.llegadaTarde) {
      llegadasTarde += 1;
      descuentoPor.tarde += descuentoPagado(d.entrada - apertura, jornadaEsperada);
    }
    if (d.corregida) correcciones += 1;
    const retiros = d.pausas.filter((p) => p.tipo === TipoPausa.RETIRO_ANTICIPADO);
    if (retiros.length > 0) {
      retirosAnticipados += 1;
      const minutosRetiro = retiros.reduce((acc, p) => acc + Math.max(0, p.hasta - p.desde), 0);
      descuentoPor.retiros += descuentoPagado(minutosRetiro, jornadaEsperada);
    }
  }

  return {
    legajo: resumen.legajo,
    horasTrabajadas,
    horasComputadas,
    horasEsperadas,
    // presentismo individual = horas trabajadas / horas esperadas (días
    // laborables del tramo, feriados aparte). 0..1; null sólo si no hubo horas
    // esperadas (todo el tramo No Laborable o de vacaciones). Un tramo entero
    // de licencia paga da 0, no null: se esperaba trabajo y no lo hubo.
    presentismoIndividual: horasEsperadas > 0 ? horasComputadas / horasEsperadas : null,
    completas,
    incompletas,
    ausencias,
    llegadasTarde,
    retirosAnticipados,
    correcciones,
    feriado,
    licencia,
    vacaciones,
    // Rangos de días con vacaciones del período, para mostrar "7 [02 al 08]".
    rangosVacaciones: agruparRangos(fechasVacaciones),
    // Fechas de las ausencias del período, para mostrar "2 [05,12]".
    fechasAusencias,
    horasPor,
    descuentoPor,
    detalle,
  };
}
