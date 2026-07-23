// Dominio: Control de Vacaciones Anual (spec 015). Funciones puras; la
// persistencia del saldo/movimientos/asignaciones vive en
// file-vacaciones-repository.js y su orquestación en
// calcular-presentismo-service.js (mismo criterio que justificacion.js /
// correccion.js: el dominio no conoce autor/fechaHora reales más allá de lo
// que se le pasa).

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Motivo fijo y reservado de la Justificación-espejo que genera cada día de
// una Asignación de Vacaciones (research.md §1): id DISTINTO del `vacaciones`
// del catálogo editable de 012 (que FR-018 deshabilita para nuevas cargas),
// para que nunca haya ambigüedad sobre el origen de un registro.
export const MotivoVacaciones = Object.freeze({ id: 'vacaciones-anual', etiqueta: 'Vacaciones', tipoPago: 'No paga' });

function parseFechaISO(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function formatFechaISO(ms) {
  const d = new Date(ms);
  const anio = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Expande fechaInicio + cantidadDias a la lista completa de fechas
// calendario corridas (research.md §6, FR-002): NO filtra por
// hábil/no-hábil/feriado, a diferencia de expandirRangoElegible (012).
export function expandirDiasCorridos(fechaInicio, cantidadDias) {
  if (!Number.isInteger(cantidadDias) || cantidadDias <= 0) {
    throw new Error(`vacaciones: cantidadDias inválida "${cantidadDias}"`);
  }
  const inicioMs = parseFechaISO(fechaInicio);
  const fechas = [];
  for (let i = 0; i < cantidadDias; i++) {
    fechas.push(formatFechaISO(inicioMs + i * MS_POR_DIA));
  }
  return fechas;
}

// fechaInicio + (cantidadDias - 1) días (data-model.md §5).
export function fechaFinDe(fechaInicio, cantidadDias) {
  const inicioMs = parseFechaISO(fechaInicio);
  return formatFechaISO(inicioMs + (cantidadDias - 1) * MS_POR_DIA);
}

// Antigüedad en años completos de fechaIngreso a fechaReferencia (edge case:
// "cambio de antigüedad dentro del propio año de incremento" — se usa la
// antigüedad A LA FECHA de referencia dada, no la de hoy).
export function calcularAntiguedadAnios(fechaIngreso, fechaReferencia) {
  const [aI, mI, dI] = fechaIngreso.split('-').map(Number);
  const [aR, mR, dR] = fechaReferencia.split('-').map(Number);
  let anios = aR - aI;
  if (mR < mI || (mR === mI && dR < dI)) anios--;
  return Math.max(0, anios);
}

// Días que corresponden por escala de antigüedad: el último tramo cuyo
// aniosMinimos <= aniosAntiguedad (data-model.md §2).
export function diasPorAntiguedad(escalaAntiguedad, aniosAntiguedad) {
  let dias = 0;
  for (const tramo of escalaAntiguedad) {
    if (tramo.aniosMinimos <= aniosAntiguedad) dias = tramo.dias;
  }
  return dias;
}

// Fecha de ciclo de incremento en un año dado, clampeada al último día
// válido de ese mes (research.md §5: el día 29/30/31 se re-evalúa cada año
// contra el mes real, ej. 29/feb en un año no bisiesto → 28/feb).
function fechaCiclo(incrementoAnualConfig, anio) {
  const { mes, dia } = incrementoAnualConfig;
  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const diaEfectivo = Math.min(dia, ultimoDiaDelMes);
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(diaEfectivo).padStart(2, '0')}`;
}

// Próxima fecha (>= fechaReferencia) en que corresponde el incremento anual,
// dado { mes, dia } de config/vacaciones.json (FR-008, US2).
export function proximoIncremento(incrementoAnualConfig, fechaReferencia) {
  const [anioRef] = fechaReferencia.split('-').map(Number);
  const candidatoEsteAnio = fechaCiclo(incrementoAnualConfig, anioRef);
  if (candidatoEsteAnio >= fechaReferencia) return candidatoEsteAnio;
  return fechaCiclo(incrementoAnualConfig, anioRef + 1);
}

// Primer ciclo ESTRICTAMENTE posterior a `fecha` (nunca el mismo día).
function cicloEstrictamenteDespues(incrementoAnualConfig, fecha) {
  return proximoIncremento(incrementoAnualConfig, formatFechaISO(parseFechaISO(fecha) + MS_POR_DIA));
}

// Ciclo más reciente ya alcanzado (<= hoy): si hoy mismo es un ciclo, es hoy;
// si el próximo ciclo todavía no llegó, es el de un año antes de ese.
function cicloMasRecienteAlcanzado(incrementoAnualConfig, hoy) {
  const prox = proximoIncremento(incrementoAnualConfig, hoy);
  if (prox === hoy) return hoy;
  const [anio] = prox.split('-').map(Number);
  return fechaCiclo(incrementoAnualConfig, anio - 1);
}

// spec 015 (US3, research.md §4) — Calcula, de forma pura, los incrementos
// de saldo pendientes de aplicar a un legajo (uno por cada ciclo anual ya
// alcanzado y no aplicado todavía), en orden cronológico. `datosLegajo.
// ultimoIncrementoAplicado` controla la idempotencia: null = el legajo
// nunca recibió un incremento — en ese caso NO se retrocede más allá del
// ciclo más reciente ya alcanzado (edge case "legajo nuevo"/"fechaIngreso
// cargada después de que ya pasó el incremento de este año": nunca se
// aplica retroactivamente más de un ciclo de una vez cuando no había
// antigüedad calculable antes). Si ya había un incremento previo aplicado,
// SÍ se backfillean todos los ciclos consecutivos no aplicados desde
// entonces (research.md §4: "si pasó más de un ciclo sin que nadie
// consultara el sistema"). La antigüedad de cada incremento se calcula A LA
// FECHA DE ESE CICLO, nunca a `hoy` (edge case "cambio de antigüedad dentro
// del propio año").
export function calcularIncrementosPendientes({
  fechaIngreso,
  ultimoIncrementoAplicado,
  escalaAntiguedad,
  incrementoAnualConfig,
  hoy,
}) {
  let piso;
  if (ultimoIncrementoAplicado != null) {
    piso = ultimoIncrementoAplicado;
  } else {
    const masReciente = cicloMasRecienteAlcanzado(incrementoAnualConfig, hoy);
    const [anio] = masReciente.split('-').map(Number);
    piso = fechaCiclo(incrementoAnualConfig, anio - 1);
  }

  const ciclos = [];
  let candidato = cicloEstrictamenteDespues(incrementoAnualConfig, piso);
  while (candidato <= hoy) {
    if (candidato >= fechaIngreso) {
      const antiguedadAnios = calcularAntiguedadAnios(fechaIngreso, candidato);
      ciclos.push({ fecha: candidato, dias: diasPorAntiguedad(escalaAntiguedad, antiguedadAnios), antiguedadAnios });
    }
    candidato = cicloEstrictamenteDespues(incrementoAnualConfig, candidato);
  }
  return ciclos;
}

// Aplicación de movimientos al saldo. Nunca clampea a 0 (FR-004/FR-013): un
// saldo negativo es un valor válido y el incremento se suma tal cual sobre
// el existente, incluso negativo.
export function aplicarIncremento(saldo, dias) {
  return saldo + dias;
}

export function aplicarAsignacion(saldo, cantidadDias) {
  return saldo - cantidadDias;
}

export function aplicarReversion(saldo, cantidadDias) {
  return saldo + cantidadDias;
}

// Construye el registro de MovimientoSaldo (data-model.md §4.1). `dias` ya
// viene con el signo correspondiente (positivo en incremento/reversión,
// negativo en asignación): esta función no lo deriva.
export function construirMovimientoSaldo({
  tipo,
  fecha,
  dias,
  saldoResultante,
  antiguedadAnios = null,
  asignacionId = null,
  autor = null,
}) {
  return { tipo, fecha, dias, saldoResultante, antiguedadAnios, asignacionId, autor };
}

// Construye el registro de Asignación de Vacaciones (data-model.md §5).
export function construirAsignacion({ id, legajo, fechaInicio, cantidadDias, autor = null, fechaHora = null }) {
  return {
    id,
    legajo,
    fechaInicio,
    cantidadDias,
    fechaFin: fechaFinDe(fechaInicio, cantidadDias),
    autor: autor ?? null,
    fechaHora: fechaHora ?? new Date().toISOString(),
    vigente: true,
    reversion: null,
  };
}
