// Nombre del día de la semana de una fecha 'YYYY-MM-DD'. Cálculo en UTC (como
// `diaSemanaDe` del backend, src/web/view-model.js) para no depender de la
// zona horaria del navegador.
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function nombreDiaSemana(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
