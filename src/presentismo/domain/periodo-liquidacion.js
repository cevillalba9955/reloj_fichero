// Dominio: Período de liquidación como recorte DERIVADO del Calendario del mes
// (research §6). No se persiste: es función pura del calendario + modalidad.

export const Tramo = Object.freeze({ MES: 'Mes', Q1: 'Q1', Q2: 'Q2' });

// Tramos que corresponden a un tipo de modalidad.
export function tramosParaTipo(tipo) {
  return tipo === 'Quincenal' ? [Tramo.Q1, Tramo.Q2] : [Tramo.MES];
}

function diaEnTramo(dd, tramo) {
  if (tramo === Tramo.MES) return true;
  if (tramo === Tramo.Q1) return dd <= 15; // primera quincena: 1–15
  if (tramo === Tramo.Q2) return dd >= 16; // segunda quincena: 16–fin
  throw new Error(`periodo-liquidacion: tramo inválido "${tramo}"`);
}

// Recorta el calendario a los días del tramo.
export function recortar(calendario, tramo) {
  const dias = calendario.dias.filter((d) => diaEnTramo(d.dd, tramo));
  return { periodo: calendario.periodo, tramo, dias };
}
