import { overlap } from './tiempo.js';

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
