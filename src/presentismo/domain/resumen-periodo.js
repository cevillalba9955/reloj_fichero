import { Clasificacion } from './calendario-mes.js';
import { EstadoJornada } from './jornada.js';
import { esEntradaTarde } from './situacion-dia.js';
import { TipoPausa } from './pausa.js';

// feature 011 — Proyección pura del resumen de un período por empleado
// (data-model.md, research.md §1-§2). Deriva la fila de acumulados y el
// detalle día por día de UNA SOLA pasada sobre `resumen.jornadas` filtrado por
// `fecha <= hoy` (FR-008: días futuros no cuentan). La corrección vigente
// prevalece en TODOS los contadores (Clarifications del spec).

// jornada: { fecha, clasificacion, estado, entrada, salida, entradaEfectiva,
//   salidaEfectiva, totalDiario, correccionVigente, correccion, pausas }
// (misma forma que resumen.jornadas de calcularEmpleado, 004).
export function esLlegadaTarde(jornada, params) {
  if (jornada.clasificacion !== Clasificacion.LABORABLE) return false;
  const entradaConsiderada = jornada.correccionVigente
    ? jornada.correccion?.entradaCorregida ?? jornada.entrada?.hora ?? null
    : jornada.entrada?.hora ?? null;
  return esEntradaTarde(entradaConsiderada, params);
}

function detalleDeJornada(jornada, params) {
  const pausasVigentes = (jornada.pausas ?? []).filter((p) => p.vigente !== false);
  return {
    fecha: jornada.fecha,
    clasificacion: jornada.clasificacion,
    estado: jornada.estado,
    entrada: jornada.entradaEfectiva ?? null,
    salida: jornada.salidaEfectiva ?? null,
    horas: jornada.totalDiario ?? 0,
    llegadaTarde: esLlegadaTarde(jornada, params),
    corregida: Boolean(jornada.correccionVigente),
    pausas: pausasVigentes.map((p) => ({ desde: p.desde, hasta: p.hasta, tipo: p.tipo ?? TipoPausa.INTERMEDIA })),
  };
}

// `resumen` es UN resumen de calcularEmpleado (o la concatenación de tramos
// Q1+Q2 para quincenales, research.md §3): { legajo, params, jornadas }.
// `hoy` es 'YYYY-MM-DD' (corte de días futuros, FR-008).
export function proyectarResumenPeriodo({ resumen, hoy }) {
  const { params } = resumen;
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

  for (const d of detalle) {
    horasTrabajadas += d.horas;
    if (d.estado === EstadoJornada.COMPLETA) completas += 1;
    else if (d.estado === EstadoJornada.INCOMPLETA) incompletas += 1;
    else if (d.estado === EstadoJornada.SIN_FICHADAS) ausencias += 1;
    if (d.llegadaTarde) llegadasTarde += 1;
    if (d.corregida) correcciones += 1;
    if (d.pausas.some((p) => p.tipo === TipoPausa.RETIRO_ANTICIPADO)) retirosAnticipados += 1;
  }

  return {
    legajo: resumen.legajo,
    horasTrabajadas,
    completas,
    incompletas,
    ausencias,
    llegadasTarde,
    retirosAnticipados,
    correcciones,
    detalle,
  };
}
