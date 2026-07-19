import { Clasificacion } from './calendario-mes.js';
import { TipoPausa } from './pausa.js';

// Dominio (feature 010): situación del día EN CURSO por empleado. Proyección
// pura y determinista derivada del resultado de jornada de 004 (auto +
// ajustes) y la hora actual del servidor (minutos-del-día). NO reemplaza
// EstadoJornada (estado retrospectivo de cierre): solo tiene sentido mientras
// el día transcurre, y no se persiste (depende de `ahora`). research.md §1.

export const SituacionDia = Object.freeze({
  ESPERANDO: 'ESPERANDO',
  PRESENTE: 'PRESENTE',
  TARDE: 'TARDE',
  AUSENTE: 'AUSENTE',
  COMPLETA: 'Completa',
  RETIRO_ANTICIPADO: 'RETIRO_ANTICIPADO',
  FERIADO_CUMPLIDO: 'Feriado cumplido',
  NO_APLICA: 'No aplica',
  ANOMALIA: 'ANOMALIA',
});

// feature 011 — Predicado compartido de "entrada fuera del margen de
// tolerancia de apertura": lo usan la situación TARDE de hoy (acá) y el conteo
// retrospectivo de llegadas tarde del resumen de período (resumen-periodo.js).
export function esEntradaTarde(entradaHora, params) {
  return entradaHora != null && entradaHora > params.aperturaOficial + params.margenApertura;
}

// `auto` es la salida de calcularJornadaAuto; `ajustado` la de aplicarAjustes
// (trae correccion/pausas vigentes); `ahora` en minutos-del-día. La corrección
// vigente de entrada/salida prevalece sobre la fichada real (FR-009).
export function calcularSituacionHoy({ clasificacion, auto, ajustado, ahora, params }) {
  if (!params) return SituacionDia.ANOMALIA;

  // Días que no penalizan: reflejan el estado de 004, nunca AUSENTE (FR-013).
  if (clasificacion === Clasificacion.NO_LABORABLE) return SituacionDia.NO_APLICA;
  if (clasificacion === Clasificacion.FERIADO) return SituacionDia.FERIADO_CUMPLIDO;

  // US3: un retiro anticipado vigente prevalece como etiqueta visible sobre
  // PRESENTE/Completa (el descuento de horas sigue las reglas de pausa).
  const retiroVigente = (ajustado?.pausas ?? []).some(
    (p) => p.vigente !== false && p.tipo === TipoPausa.RETIRO_ANTICIPADO,
  );
  if (retiroVigente) return SituacionDia.RETIRO_ANTICIPADO;

  const correccion = ajustado?.correccionVigente ? ajustado.correccion : null;
  const entradaHora = correccion?.entradaCorregida ?? auto?.entrada?.hora ?? null;
  const salidaHora = correccion?.salidaCorregida ?? auto?.salida?.hora ?? null;

  if (entradaHora == null) {
    // Sin entrada: ESPERANDO mientras la ventana de entrada siga abierta
    // (límite inclusivo, como enVentana); AUSENTE una vez vencida.
    const finVentanaEntrada = params.ventanaApertura?.[1] ?? params.cierreOficial;
    return ahora > finVentanaEntrada ? SituacionDia.AUSENTE : SituacionDia.ESPERANDO;
  }

  // Entrada fuera del margen de tolerancia de apertura → TARDE, aunque la
  // jornada después cierre (Escenario 3).
  if (esEntradaTarde(entradaHora, params)) {
    return SituacionDia.TARDE;
  }

  return salidaHora != null ? SituacionDia.COMPLETA : SituacionDia.PRESENTE;
}
