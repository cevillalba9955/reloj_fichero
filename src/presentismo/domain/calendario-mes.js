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

// Desplaza un período 'YYYYMM' en `delta` meses (con cruce de año). Puro y
// determinista; valida con parsePeriodo. Base para la frontera generable
// (feature 008).
export function desplazarPeriodo(periodo, delta) {
  const { anio, mes } = parsePeriodo(periodo);
  // mes-1 lleva a base 0; Date normaliza el desborde de meses y el año.
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${String(d.getUTCFullYear()).padStart(4, '0')}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodoSiguiente(periodo) {
  return desplazarPeriodo(periodo, 1);
}

export function periodoAnterior(periodo) {
  return desplazarPeriodo(periodo, -1);
}

// Período 'YYYYMM' del mes actual según un reloj dado (`now`, inyectable para
// tests; por defecto el reloj real del proceso). Único punto de verdad para
// "el mes en curso" (013-reestructurar-data-periodos, FR-004): reutilizado por
// `src/web/view-model.js` y por los adaptadores de padrón/roster, que deben
// resolverlo en cada llamada (nunca cachearlo a nivel de proceso, un backend
// web es de larga vida).
export function mesActualPeriodo(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
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
//   013-reestructurar-data-periodos (FR-009): el estado de cierre (`cerrado`,
//   `cierre`, `reapertura`) también se preserva al regenerar — regenerar NO es
//   una escritura sobre el período (no se pasa por exigirPeriodoAbierto) ni
//   reabre un período que estaba cerrado.
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

  return {
    periodo,
    esquemaSemanal: [...esquemaSemanalDias].sort(),
    dias,
    cerrado: previo?.cerrado ?? false,
    cierre: previo?.cierre ?? null,
    reapertura: previo?.reapertura ?? null,
  };
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

// 013-reestructurar-data-periodos (US3, data-model.md/research.md §3) — ciclo
// de vida cerrado/abierto de un período. Mismo patrón inmutable que
// `reclasificarDia`: devuelven un calendario NUEVO, nunca mutan el original.
// Cerrar un calendario ya cerrado (o reabrir uno ya abierto) es un no-op
// idempotente a nivel de dominio: no lanza, pero SÍ actualiza `cierre`/
// `reapertura` con el autor/fecha del intento más reciente (edge case del
// spec: evita un "doble cierre" confuso sin bloquear al responsable que repite
// la acción por las dudas). `cierre` no se borra al reabrir: queda como
// historial del último cierre (FR-008).
export function cerrarCalendario(calendario, autor) {
  return { ...calendario, cerrado: true, cierre: { autor: autor ?? null, fechaHora: new Date().toISOString() } };
}

export function reabrirCalendario(calendario, autor) {
  return { ...calendario, cerrado: false, reapertura: { autor: autor ?? null, fechaHora: new Date().toISOString() } };
}

// Único punto que las operaciones de escritura consultan (research.md §4):
// lanza si el período está cerrado, con `err.httpCode = 'PERIODO_CERRADO'`
// para que los handlers web (contracts/web-api.md) y el CLI lo distingan del
// resto de errores de validación sin parsear el mensaje.
export function exigirPeriodoAbierto(calendario) {
  if (calendario?.cerrado === true) {
    const err = new Error(
      `calendario-mes: el período ${calendario.periodo} está cerrado` +
        (calendario.cierre?.fechaHora ? ` desde ${calendario.cierre.fechaHora}` : ''),
    );
    err.httpCode = 'PERIODO_CERRADO';
    throw err;
  }
}
