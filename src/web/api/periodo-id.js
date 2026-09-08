import { ApiError } from './router.js';
import { Tramo } from '../../presentismo/domain/periodo-liquidacion.js';

// Traducción del identificador de período de la API (`YYYYMM` o
// `YYYYMM-Q1` / `YYYYMM-Q2`) ↔ `{ periodoMes, tramo }`, según el modo de
// granularidad de la instalación (`ctx.modoResumenPeriodo`: 'MENSUAL' /
// 'QUINCENAL'). Extraído de resumen-periodo-handlers.js (feature 011) para
// compartirlo con informe-cierre-handlers.js (feature 018) sin duplicar las
// regex ni el default.

export const RE_MES = /^\d{6}$/;
export const RE_QUINCENA = /^(\d{6})-Q([12])$/;

// Descompone el identificador de período en { periodoMes, tramo } validando el
// formato según el modo. `tramo` null = mes completo.
export function parsePeriodoId(id, modo) {
  let periodoMes = null;
  let tramo = null;
  if (typeof id === 'string' && RE_MES.test(id)) {
    periodoMes = id;
  } else if (typeof id === 'string' && modo === 'QUINCENAL' && RE_QUINCENA.test(id)) {
    const [, mes, q] = RE_QUINCENA.exec(id);
    periodoMes = mes;
    tramo = q === '1' ? Tramo.Q1 : Tramo.Q2;
  } else {
    const esperado = modo === 'QUINCENAL' ? 'YYYYMM o YYYYMM-Q1/Q2' : 'YYYYMM';
    throw new ApiError(400, 'PERIODO_INVALIDO', `Período inválido "${id}" (se espera ${esperado})`);
  }
  const nroMes = Number(periodoMes.slice(4, 6));
  if (nroMes < 1 || nroMes > 12) {
    throw new ApiError(400, 'PERIODO_INVALIDO', `Mes inválido en "${id}"`);
  }
  return { periodoMes, tramo };
}

// Períodos seleccionables (FR-002): los generados, expandidos a quincenas en
// modo QUINCENAL.
export function expandirPeriodos(generados, modo) {
  const ordenados = [...generados].sort();
  if (modo !== 'QUINCENAL') return ordenados;
  return ordenados.flatMap((p) => [`${p}-Q1`, `${p}-Q2`]);
}

// Default: el período más reciente (FR-002). En QUINCENAL, la quincena en
// curso si el mes de hoy tiene calendario; si no, la última quincena del
// último mes generado.
export function periodoPorDefecto(generados, modo, hoy) {
  if (generados.length === 0) return null;
  const ultimo = [...generados].sort().at(-1);
  if (modo !== 'QUINCENAL') return ultimo;
  const mesHoy = hoy.slice(0, 4) + hoy.slice(5, 7);
  if (generados.includes(mesHoy)) {
    return `${mesHoy}-${Number(hoy.slice(8, 10)) <= 15 ? 'Q1' : 'Q2'}`;
  }
  return `${ultimo}-Q2`;
}
