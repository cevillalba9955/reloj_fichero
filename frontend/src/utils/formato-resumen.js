// Formato compartido de la grilla de resumen del período: lo usan la solapa
// "Resumen" (TablaResumenPeriodo) y el informe de cierre (InformeCierreContenido)
// para que ambas muestren exactamente lo mismo. Las horas llegan en MINUTOS.

// Minutos → 'H:MM'.
export function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// Minutos → texto largo para los descuentos: "30 min", "1 hora", "4 horas 30 min".
// Formato distinto de 'H:MM' para no confundirlos con las horas presentes (ya
// descontadas de Tarde/Retiros).
export function formatoDescuento(min) {
  const m = Number.isInteger(min) && min > 0 ? min : 0;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  const partes = [];
  if (h > 0) partes.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  if (resto > 0 || h === 0) partes.push(`${resto} min`);
  return partes.join(' ');
}

// Celda "<Días> (<Horas>)"; vacía si los días son cero. Con `descuento`
// (Tarde/Retiros) el tiempo va en negativo y en texto largo: "1 (-30 min)".
// Sin dato de horas (informe emitido antes de existir este formato) se muestra
// solo la cantidad de días, en vez de un engañoso "(0:00)".
export function diasYHoras(dias, minutos, descuento = false) {
  if (!dias) return '';
  if (minutos == null) return String(dias);
  if (descuento) return `${dias} (${minutos > 0 ? '-' : ''}${formatoDescuento(minutos)})`;
  return `${dias} (${formatoHoras(minutos)})`;
}

const diaDelMes = (fecha) => fecha.slice(8, 10);

// Vacaciones: "7 [02 al 08]"; varios rangos "9 [02 al 08, 20 al 21]"; un día "1 [05]".
export function diasConRangos(dias, rangos = []) {
  if (!dias) return '';
  const texto = rangos.map((r) =>
    r.desde === r.hasta ? diaDelMes(r.desde) : `${diaDelMes(r.desde)} al ${diaDelMes(r.hasta)}`,
  );
  return texto.length > 0 ? `${dias} [${texto.join(', ')}]` : String(dias);
}

// Ausencias: "2 [05,12]" (día del mes de cada ausencia).
export function diasConFechas(dias, fechas = []) {
  if (!dias) return '';
  return fechas.length > 0 ? `${dias} [${fechas.map(diaDelMes).join(',')}]` : String(dias);
}

// Días del mes de las jornadas incompletas pasadas: "05,12".
export function diasDeFechas(fechas = []) {
  return fechas.map(diaDelMes).join(',');
}
