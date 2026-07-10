// Dominio: Calendario del mes institucional (data-model.md). Único y
// compartido por todas las modalidades. Funciones puras y deterministas.

export const Clasificacion = Object.freeze({
  LABORABLE: 'Laborable',
  NO_LABORABLE: 'No Laborable',
  FERIADO: 'Feriado',
});

const CLASIFICACIONES = new Set(Object.values(Clasificacion));

// Valida 'YYYYMM' y devuelve {anio, mes} o lanza.
export function parsePeriodo(periodo) {
  if (typeof periodo !== 'string' || !/^\d{6}$/.test(periodo)) {
    throw new Error(`calendario-mes: período inválido "${periodo}" (se espera YYYYMM)`);
  }
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new Error(`calendario-mes: mes inválido en "${periodo}"`);
  }
  return { anio, mes };
}

function diasEnMes(anio, mes) {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function fechaISO(anio, mes, dd) {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Día de la semana en UTC (0=domingo..6=sábado), sin efectos de huso/DST.
function diaSemana(anio, mes, dd) {
  return new Date(Date.UTC(anio, mes - 1, dd)).getUTCDay();
}

// Genera (o regenera) el calendario de un mes.
// - esquemaSemanalDias: Set de números de día de semana laborables (0..6).
// - previo: calendario existente cuyas reclasificaciones manuales se preservan
//   (FR-006). Al regenerar, un día con reclasificadoManual conserva su valor.
export function generarCalendario(periodo, esquemaSemanalDias, previo = null) {
  const { anio, mes } = parsePeriodo(periodo);
  const total = diasEnMes(anio, mes);

  const previoPorFecha = new Map();
  if (previo?.dias) {
    for (const d of previo.dias) previoPorFecha.set(d.fecha, d);
  }

  const dias = [];
  for (let dd = 1; dd <= total; dd++) {
    const fecha = fechaISO(anio, mes, dd);
    const esLaborablePorEsquema = esquemaSemanalDias.has(diaSemana(anio, mes, dd));
    const inicial = esLaborablePorEsquema ? Clasificacion.LABORABLE : Clasificacion.NO_LABORABLE;

    const prev = previoPorFecha.get(fecha);
    if (prev?.reclasificadoManual) {
      dias.push({ fecha, dd, clasificacion: prev.clasificacion, reclasificadoManual: true });
    } else {
      dias.push({ fecha, dd, clasificacion: inicial, reclasificadoManual: false });
    }
  }

  return { periodo, esquemaSemanal: [...esquemaSemanalDias].sort(), dias };
}

// Reclasifica un día. Devuelve un NUEVO calendario (inmutable); marca el día
// como reclasificadoManual (FR-004/006). Lanza si la fecha no pertenece al mes
// o la clasificación es inválida.
export function reclasificarDia(calendario, fecha, clasificacion) {
  if (!CLASIFICACIONES.has(clasificacion)) {
    throw new Error(`calendario-mes: clasificación inválida "${clasificacion}"`);
  }
  const idx = calendario.dias.findIndex((d) => d.fecha === fecha);
  if (idx === -1) {
    throw new Error(`calendario-mes: la fecha "${fecha}" no pertenece al período ${calendario.periodo}`);
  }
  const dias = calendario.dias.map((d, i) =>
    i === idx ? { ...d, clasificacion, reclasificadoManual: true } : d
  );
  return { ...calendario, dias };
}

export function diaDe(calendario, fecha) {
  return calendario.dias.find((d) => d.fecha === fecha) ?? null;
}
