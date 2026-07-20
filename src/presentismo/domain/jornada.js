import { clamp, enVentana } from './tiempo.js';
import { Clasificacion } from './calendario-mes.js';
import { descuentoPausas } from './pausa.js';

// Dominio: cálculo de una Jornada (Día × empleado). Función pura y
// determinista (FR-023). Reglas consolidadas en research §7. Trabaja en
// minutos-del-día. Este módulo produce el resultado AUTOMÁTICO; correcciones
// manuales y pausas (US3) se aplican encima con aplicarAjustes().

export const EstadoJornada = Object.freeze({
  COMPLETA: 'Completa',
  INCOMPLETA: 'Incompleta',
  SIN_FICHADAS: 'Sin fichadas',
  FERIADO_CUMPLIDO: 'Feriado cumplido',
  NO_APLICA: 'No aplica',
});

function horaEfectivaEntrada(hora, params) {
  return hora <= params.aperturaOficial + params.margenApertura ? params.aperturaOficial : hora;
}

function horaEfectivaSalida(hora, params) {
  return hora >= params.cierreOficial - params.margenCierre ? params.cierreOficial : hora;
}

// fichadas: [{ id, hora:min|null }]. Devuelve el resultado automático de la jornada.
export function calcularJornadaAuto({ clasificacion, fichadas = [], params }) {
  const base = {
    clasificacion,
    entrada: null,
    salida: null,
    entradaEfectiva: null,
    salidaEfectiva: null,
    horasAuto: 0,
    totalDiario: 0,
    sugerencia: null,
    fichadasNoUsadas: [],
    motivo: null,
  };

  if (clasificacion === Clasificacion.NO_LABORABLE) {
    // No aporta jornada; sus fichadas se reportan fuera de calendario a nivel resumen.
    return { ...base, estado: EstadoJornada.NO_APLICA, fichadasNoUsadas: fichadas.map((f) => f.id) };
  }

  if (clasificacion === Clasificacion.FERIADO) {
    // Crédito automático = jornada esperada, sin requerir fichadas (FR-020).
    return {
      ...base,
      estado: EstadoJornada.FERIADO_CUMPLIDO,
      horasAuto: params.jornadaEsperada,
      totalDiario: params.jornadaEsperada,
      fichadasNoUsadas: fichadas.map((f) => f.id),
    };
  }

  // Laborable.
  const conHora = fichadas.filter((f) => Number.isInteger(f.hora));
  if (conHora.length === 0) {
    return { ...base, estado: EstadoJornada.SIN_FICHADAS, motivo: 'sin fichadas' };
  }

  const ordenadas = [...conHora].sort((a, b) => a.hora - b.hora);
  // Entrada: primera dentro de la ventana de apertura.
  const entrada = ordenadas.find((f) => enVentana(f.hora, params.ventanaApertura)) ?? null;
  // Salida: última dentro de la ventana de cierre y posterior a la entrada.
  const salida = entrada
    ? [...ordenadas].reverse().find((f) => enVentana(f.hora, params.ventanaCierre) && f.hora > entrada.hora) ?? null
    : [...ordenadas].reverse().find((f) => enVentana(f.hora, params.ventanaCierre)) ?? null;

  const usadas = new Set();
  if (entrada) usadas.add(entrada.id);
  if (salida) usadas.add(salida.id);
  const fichadasNoUsadas = conHora.filter((f) => !usadas.has(f.id)).map((f) => f.id);

  if (entrada && salida) {
    const entradaEfectiva = horaEfectivaEntrada(entrada.hora, params);
    const salidaEfectiva = horaEfectivaSalida(salida.hora, params);
    const horasAuto = clamp(salidaEfectiva - entradaEfectiva, 0, params.jornadaEsperada);
    return {
      ...base,
      estado: EstadoJornada.COMPLETA,
      entrada,
      salida,
      entradaEfectiva,
      salidaEfectiva,
      horasAuto,
      totalDiario: horasAuto,
      fichadasNoUsadas,
    };
  }

  // Incompleta: falta una punta. Sugerencia no aplicada (FR-015).
  let sugerencia = null;
  let motivo;
  if (entrada && !salida) {
    const entradaEfectiva = horaEfectivaEntrada(entrada.hora, params);
    sugerencia = clamp(params.cierreOficial - entradaEfectiva, 0, params.jornadaEsperada);
    motivo = 'sin salida';
    return {
      ...base,
      estado: EstadoJornada.INCOMPLETA,
      entrada,
      entradaEfectiva,
      sugerencia,
      fichadasNoUsadas,
      motivo,
    };
  }
  if (salida && !entrada) {
    const salidaEfectiva = horaEfectivaSalida(salida.hora, params);
    sugerencia = clamp(salidaEfectiva - params.aperturaOficial, 0, params.jornadaEsperada);
    motivo = 'sin entrada';
    return {
      ...base,
      estado: EstadoJornada.INCOMPLETA,
      salida,
      salidaEfectiva,
      sugerencia,
      fichadasNoUsadas,
      motivo,
    };
  }
  // Ninguna punta cae en su ventana: no se puede anclar una sugerencia.
  return {
    ...base,
    estado: EstadoJornada.INCOMPLETA,
    fichadasNoUsadas,
    motivo: 'sin entrada ni salida en ventana',
  };
}

// Aplica ajustes manuales (US3 de 004 + US2 de 010) sobre el resultado
// automático: pausas intermedias (descuento) y corrección manual (prevalece).
// Una corrección de entrada/salida (feature 010) recalcula las horas efectivas
// con las MISMAS funciones del cálculo automático y deriva el total de ellas;
// un valorCorregido explícito sigue prevaleciendo como override del total
// (compat 004). Devuelve un nuevo objeto de jornada con totalDiario final,
// descuentoPausas, correccionVigente y requiereRevision (FR-028/029/038/039).
// `params` (modalidad) solo es necesario cuando la corrección trae
// entrada/salida. Función pura.
// Recalcula `estado` cuando una corrección modifica entrada/salida: una
// jornada auto `Incompleta`/`Sin fichadas` puede quedar `Completa` si la
// corrección aporta la punta que faltaba (la corrección prevalece en TODOS
// los contadores, spec 011 FR-003). Solo aplica a Laborable: Feriado/No
// Laborable conservan su estado especial.
function estadoConCorreccion(auto, entradaEfectiva, salidaEfectiva) {
  if (auto.clasificacion !== Clasificacion.LABORABLE) return auto.estado;
  if (entradaEfectiva != null && salidaEfectiva != null) return EstadoJornada.COMPLETA;
  if (entradaEfectiva != null || salidaEfectiva != null) return EstadoJornada.INCOMPLETA;
  return EstadoJornada.SIN_FICHADAS;
}

export function aplicarAjustes(auto, { correccion = null, pausas = [], params = null } = {}) {
  const corrigeHorario =
    correccion && (correccion.entradaCorregida != null || correccion.salidaCorregida != null);

  if (corrigeHorario) {
    const entradaEfectiva =
      correccion.entradaCorregida != null
        ? params
          ? horaEfectivaEntrada(correccion.entradaCorregida, params)
          : correccion.entradaCorregida
        : auto.entradaEfectiva;
    const salidaEfectiva =
      correccion.salidaCorregida != null
        ? params
          ? horaEfectivaSalida(correccion.salidaCorregida, params)
          : correccion.salidaCorregida
        : auto.salidaEfectiva;

    const descuento = descuentoPausas(pausas, entradaEfectiva, salidaEfectiva);
    // Total derivado: solo con ambas puntas definidas (misma regla que el auto,
    // acotado a la jornada esperada); si falta una, la jornada sigue incompleta.
    let totalDerivado = 0;
    if (entradaEfectiva != null && salidaEfectiva != null) {
      const bruto = Math.max(0, salidaEfectiva - entradaEfectiva);
      totalDerivado = Math.max(
        0,
        (params ? clamp(bruto, 0, params.jornadaEsperada) : bruto) - descuento,
      );
    }
    const requiereRevision =
      correccion.valorCalculado != null && correccion.valorCalculado !== auto.totalDiario;
    return {
      ...auto,
      estado: estadoConCorreccion(auto, entradaEfectiva, salidaEfectiva),
      entradaEfectiva,
      salidaEfectiva,
      descuentoPausas: descuento,
      totalDiario: correccion.valorCorregido != null ? correccion.valorCorregido : totalDerivado,
      correccionVigente: true,
      correccion,
      pausas,
      requiereRevision,
    };
  }

  // Pausas: solo descuentan si hay horario efectivo (Laborable con entrada y
  // salida). En Feriado/Incompleta/Sin fichadas, descuento = 0 (FR-039).
  const descuento = descuentoPausas(pausas, auto.entradaEfectiva, auto.salidaEfectiva);

  if (correccion) {
    // La corrección prevalece sobre el auto para el total (FR-028). Se marca
    // para revisión si el auto por debajo cambió respecto del snapshot (FR-029).
    const requiereRevision =
      correccion.valorCalculado != null && correccion.valorCalculado !== auto.totalDiario;
    return {
      ...auto,
      descuentoPausas: descuento,
      totalDiario: correccion.valorCorregido,
      correccionVigente: true,
      correccion,
      pausas,
      requiereRevision,
    };
  }

  return {
    ...auto,
    descuentoPausas: descuento,
    totalDiario: Math.max(0, auto.totalDiario - descuento),
    correccionVigente: false,
    pausas,
    requiereRevision: false,
  };
}
