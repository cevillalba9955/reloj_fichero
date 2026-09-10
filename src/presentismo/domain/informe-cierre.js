import { EstadoJornada } from './jornada.js';

// 018-informe-cierre-periodo — Proyección PURA del informe de cierre de un
// período (data-model.md §2–§5). Recibe las filas que ya devuelve
// `calcularResumenPeriodo` (features 004/011), enriquecidas por el servicio con
// `nombre` y `modalidad`, y arma:
//   - `resumen`: encabezado + una fila por empleado + total general
//   - `detalle`: una sección por empleado con su día por día y el subtotal
//   - `pendientes`: jornadas incompletas, anomalías y días con ajuste
//   - `sello`: identificación del período/tramo + cuándo y quién emitió
// NO recalcula presentismo: todo sale de `filas`. Así el informe no puede
// divergir de la pantalla "Resumen del Período" (SC-008) y el subtotal del
// detalle cuadra con el total del resumen por construcción (SC-002).

// Días del mes 'YYYYMM' (2026-02 → 28: no bisiesto).
function diasDelMes(periodoMes) {
  const anio = Number(periodoMes.slice(0, 4));
  const mes = Number(periodoMes.slice(4, 6));
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// Rango de fechas ISO del tramo. 'Mes' = mes completo; 'Q1' = 1–15;
// 'Q2' = 16–fin de mes. El servicio usa `.hasta` como corte `hoy` para
// `calcularResumenPeriodo`, de modo que el informe cubra TODO el tramo
// (research.md §2).
export function rangoDeTramo(periodoMes, tramo) {
  const pre = `${periodoMes.slice(0, 4)}-${periodoMes.slice(4, 6)}`;
  const ultimo = String(diasDelMes(periodoMes)).padStart(2, '0');
  if (tramo === 'Q1') return { desde: `${pre}-01`, hasta: `${pre}-15` };
  if (tramo === 'Q2') return { desde: `${pre}-16`, hasta: `${pre}-${ultimo}` };
  return { desde: `${pre}-01`, hasta: `${pre}-${ultimo}` };
}

const CONTADORES = [
  'horasTrabajadas',
  'completas',
  'incompletas',
  'ausencias',
  'llegadasTarde',
  'retirosAnticipados',
  'correcciones',
  'feriado',
  'licencia',
  'vacaciones',
];

function filaResumenDe(fila) {
  const salida = { legajo: fila.legajo, nombre: fila.nombre ?? null, modalidad: fila.modalidad ?? null };
  if (fila.anomalia) {
    for (const c of CONTADORES) salida[c] = 0;
    salida.presentismoIndividual = null;
    salida.anomalia = fila.anomalia;
    return salida;
  }
  for (const c of CONTADORES) salida[c] = fila[c] ?? 0;
  // 018 — presentismo individual (ratio 0..1, o null); ya calculado por
  // proyectarResumenPeriodo excluyendo los días de vacaciones.
  salida.presentismoIndividual = fila.presentismoIndividual ?? null;
  salida.anomalia = null;
  return salida;
}

function renglonDe(d) {
  return {
    fecha: d.fecha,
    clasificacion: d.clasificacion,
    estado: d.estado,
    entrada: d.entrada ?? null,
    salida: d.salida ?? null,
    pausas: (d.pausas ?? []).map((p) => ({ desde: p.desde, hasta: p.hasta, tipo: p.tipo })),
    horas: d.horas ?? 0,
    llegadaTarde: Boolean(d.llegadaTarde),
    corregida: Boolean(d.corregida),
    motivoCorreccion: d.motivoCorreccion ?? null,
    justificacion: d.justificacion ?? null,
    requiereJustificacionRevision: Boolean(d.requiereJustificacionRevision),
  };
}

function seccionDetalleDe(fila) {
  const cabecera = { legajo: fila.legajo, nombre: fila.nombre ?? null, modalidad: fila.modalidad ?? null };
  if (fila.anomalia) {
    return { ...cabecera, dias: [], subtotalHoras: 0, anomalia: fila.anomalia };
  }
  const dias = (fila.detalle ?? []).map(renglonDe);
  const subtotalHoras = redondear(dias.reduce((s, d) => s + d.horas, 0));
  return { ...cabecera, dias, subtotalHoras, anomalia: null };
}

// Evita ruido de coma flotante al sumar horas (mismo criterio que el dominio de
// presentismo, que trabaja en cuartos de hora).
function redondear(n) {
  return Math.round(n * 100) / 100;
}

function construirPendientes(filas) {
  const jornadasIncompletas = [];
  const anomalias = [];
  const ajustes = [];

  for (const fila of filas) {
    if (fila.anomalia) {
      anomalias.push({ legajo: fila.legajo, nombre: fila.nombre ?? null, detalle: fila.anomalia });
      continue;
    }
    const dias = fila.detalle ?? [];
    const incompletas = dias.filter((d) => d.estado === EstadoJornada.INCOMPLETA).map((d) => d.fecha);
    if (incompletas.length > 0) {
      jornadasIncompletas.push({ legajo: fila.legajo, nombre: fila.nombre ?? null, fechas: incompletas });
    }
    const conAjuste = dias.filter((d) => d.corregida || d.justificacion != null).map((d) => d.fecha);
    if (conAjuste.length > 0) {
      ajustes.push({ legajo: fila.legajo, nombre: fila.nombre ?? null, fechas: conAjuste });
    }
  }

  return {
    hayPendientes: jornadasIncompletas.length > 0 || anomalias.length > 0 || ajustes.length > 0,
    jornadasIncompletas,
    anomalias,
    ajustes,
  };
}

// `emision` es 'automatico' | 'manual' (va al sello). `granularidad` es
// 'MENSUAL' | 'QUINCENAL' (modo de la instalación, va al encabezado del
// resumen). Son cosas distintas: no confundir con una sola clave `modo`.
// `anticipado` (022-informe-primera-quincena-anticipado): true si el informe se
// emitió sobre un período todavía abierto (informe de la primera quincena
// emitido antes del cierre del mes); false en toda emisión de cierre (default).
export function construirInformeCierre({ filas, periodoId, periodoMes, tramo, emision, granularidad, autor, emitidoEn, rangoFechas, anticipado = false }) {
  const sello = { periodoId, periodoMes, tramo, modo: emision, emitidoEn, autor: autor ?? null, anticipado: Boolean(anticipado) };

  const filasResumen = filas.map(filaResumenDe);
  const totalHoras = redondear(filasResumen.reduce((s, f) => s + f.horasTrabajadas, 0));
  // Totales del pie de la grilla y % de presentismo general (018): las filas
  // con anomalía no aportan (no tienen cálculo).
  const totalAusencias = filas.reduce((s, f) => s + (f.anomalia ? 0 : f.ausencias || 0), 0);
  const totalHorasEsperadas = redondear(filas.reduce((s, f) => s + (f.anomalia ? 0 : f.horasEsperadas || 0), 0));
  // Numerador del presentismo general: SOLO horas efectivamente trabajadas en
  // días laborables (sin el crédito de feriados ni de licencias pagas).
  // Distinto de `totalHoras`, que sí incluye esos créditos y alimenta la
  // columna "Horas". El denominador (`totalHorasEsperadas`) sigue contemplando
  // los días de licencia. `horasComputadas` cae a `horasTrabajadas` si la fila
  // viene de una versión previa sin el campo.
  const totalHorasComputadas = redondear(
    filas.reduce((s, f) => s + (f.anomalia ? 0 : f.horasComputadas ?? f.horasTrabajadas ?? 0), 0),
  );
  // presentismo general = horas computadas / horas esperadas del período. Ratio
  // 0..1 sin redondear (la UI lo formatea como %); null si no hay horas
  // esperadas.
  const presentismoGeneral = totalHorasEsperadas > 0 ? totalHorasComputadas / totalHorasEsperadas : null;

  const resumen = {
    encabezado: {
      periodoId,
      tramo,
      modo: granularidad,
      rangoFechas,
      empleados: filasResumen.length,
      totalHoras,
      totalHorasComputadas,
      totalAusencias,
      totalHorasEsperadas,
      presentismoGeneral,
    },
    filas: filasResumen,
  };

  const detalle = {
    encabezado: { periodoId, tramo, empleados: filas.length },
    secciones: filas.map(seccionDetalleDe),
  };

  return { sello, resumen, detalle, pendientes: construirPendientes(filas) };
}
