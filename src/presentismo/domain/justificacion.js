import { Clasificacion } from './calendario-mes.js';
import { EstadoJornada } from './jornada.js';

// Dominio: Justificación de Ausencia (spec 012). Registra el motivo de una
// ausencia sobre un día `Laborable` sin fichadas (pasado) o futuro, con su
// clasificación de pago copiada del catálogo al momento de la carga
// (research.md §6). Funciones puras; la persistencia y la auditoría
// (autor/fecha) las maneja el repositorio (mismo criterio que correccion.js).

export const RazonNoAplicable = Object.freeze({
  NO_LABORABLE: 'NO_LABORABLE',
  CON_FICHADAS: 'CON_FICHADAS',
  YA_JUSTIFICADO: 'YA_JUSTIFICADO',
});

export function justificacionVigenteDe(justificaciones, legajo, fecha) {
  return justificaciones.find((j) => j.vigente && j.legajo === legajo && j.fecha === fecha) ?? null;
}

// dia: { fecha, clasificacion, estado, esFuturo, yaJustificado }. `estado` es
// el EstadoJornada ya calculado (solo relevante para días pasados); ignorado
// para días futuros (FR-001, Clarifications 2026-07-20).
export function clasificarDiaParaJustificar(dia) {
  if (dia.clasificacion !== Clasificacion.LABORABLE) {
    return { fecha: dia.fecha, elegible: false, razon: RazonNoAplicable.NO_LABORABLE };
  }
  if (dia.yaJustificado) {
    return { fecha: dia.fecha, elegible: false, razon: RazonNoAplicable.YA_JUSTIFICADO };
  }
  if (!dia.esFuturo && dia.estado !== EstadoJornada.SIN_FICHADAS) {
    return { fecha: dia.fecha, elegible: false, razon: RazonNoAplicable.CON_FICHADAS };
  }
  return { fecha: dia.fecha, elegible: true };
}

// Expande un rango ya resuelto a información por día (`dias`, en orden) en
// tres listas (FR-003a): `elegibles` (fechas a justificar), `omitidas` (días
// No Laborable/Feriado, se saltean en silencio) y `noAplicables` (con
// fichadas o ya justificados; no bloquean el resto del rango).
export function expandirRangoElegible(dias) {
  const elegibles = [];
  const omitidas = [];
  const noAplicables = [];
  for (const dia of dias) {
    const r = clasificarDiaParaJustificar(dia);
    if (r.elegible) {
      elegibles.push(r.fecha);
    } else if (r.razon === RazonNoAplicable.NO_LABORABLE) {
      omitidas.push({ fecha: r.fecha, razon: r.razon });
    } else {
      noAplicables.push({ fecha: r.fecha, razon: r.razon });
    }
  }
  return { elegibles, omitidas, noAplicables };
}

// Construye el registro de Justificación a persistir (FR-007). `motivo` es
// la entrada YA resuelta del catálogo activo ({id, etiqueta, tipoPago});
// etiqueta y tipoPago se copian al registro y no se re-derivan después
// (edge case "motivo eliminado o desactivado del catálogo").
export function crearJustificacion({ periodo, legajo, fecha, motivo, autor, fechaHora, origenCarga = null }) {
  if (!motivo || typeof motivo.id !== 'string') {
    throw new Error('justificacion: motivo inválido');
  }
  return {
    periodo,
    legajo,
    fecha,
    motivoId: motivo.id,
    etiquetaMotivo: motivo.etiqueta,
    tipoPago: motivo.tipoPago,
    autor: autor ?? null,
    fechaHora: fechaHora ?? new Date().toISOString(),
    vigente: true,
    reversion: null,
    origenCarga,
  };
}
