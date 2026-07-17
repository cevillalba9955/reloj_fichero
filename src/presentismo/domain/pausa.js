import { overlap } from './tiempo.js';

// feature 010 (US3): una Pausa puede ser intermedia (comportamiento de 004,
// default) o representar un retiro anticipado (intervalo desde la hora de
// retiro hasta el cierre oficial, research.md §2). El descuento de horas NO
// distingue tipo; solo la situación del día y los reportes lo usan. Campo
// opcional y retrocompatible: las pausas ya persistidas sin `tipo` son
// intermedias.
export const TipoPausa = Object.freeze({
  INTERMEDIA: 'intermedia',
  RETIRO_ANTICIPADO: 'retiro_anticipado',
});

const TIPOS_VALIDOS = new Set(Object.values(TipoPausa));

export function normalizarTipoPausa(tipo) {
  if (tipo == null) return TipoPausa.INTERMEDIA;
  if (!TIPOS_VALIDOS.has(tipo)) {
    throw new Error(`pausa: tipo inválido "${tipo}" (intermedia | retiro_anticipado)`);
  }
  return tipo;
}

// Dominio: descuento por Pausas intermedias (FR-038/039). Solo aplica cuando
// hay horario efectivo trabajado (entrada y salida efectivas definidas). El
// descuento es la suma de los solapes de cada pausa vigente con
// [entradaEfectiva, salidaEfectiva]. Función pura.
export function descuentoPausas(pausas, entradaEfectiva, salidaEfectiva) {
  if (entradaEfectiva == null || salidaEfectiva == null) return 0;
  let total = 0;
  for (const p of pausas) {
    if (p.vigente === false) continue;
    total += overlap(p.desde, p.hasta, entradaEfectiva, salidaEfectiva);
  }
  return total;
}
