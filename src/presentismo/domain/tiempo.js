// Dominio de presentismo — utilidades de tiempo (research.md §2).
// Todas las "horas del día" se representan como minutos-del-día (entero
// 0..1439). Sin librerías de terceros: aritmética exacta y determinista.

const MIN_POR_DIA = 24 * 60;

// Acepta 'HH:MM' o 'HH:MM:SS' (los segundos se truncan al minuto). Devuelve
// minutos-del-día 0..1439. Lanza ante formato o rango inválido.
export function parseHoraMinuto(str) {
  if (typeof str !== 'string') {
    throw new Error(`tiempo: hora no es string: ${str}`);
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(str.trim());
  if (!m) {
    throw new Error(`tiempo: hora con formato inválido "${str}" (se espera HH:MM)`);
  }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) {
    throw new Error(`tiempo: hora fuera de rango "${str}"`);
  }
  return hh * 60 + mm;
}

// Convierte minutos-del-día a 'HH:MM'. Acepta duraciones ≥ 24 h para formatear
// totales (p. ej. jornadas acumuladas no aplican, pero se mantiene robusto).
export function formatHoraMinuto(min) {
  if (!Number.isInteger(min) || min < 0) {
    throw new Error(`tiempo: minutos inválidos ${min}`);
  }
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Minutos de solapamiento entre dos intervalos [a,b] y [c,d] (bordes
// inclusivos en la práctica: si no se solapan, 0).
export function overlap(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Pertenencia a una ventana [ini, fin] con límites INCLUSIVOS (spec, Edge
// Cases: "una fichada a las 07:30 con margen ... sigue dentro").
export function enVentana(min, [ini, fin]) {
  return min >= ini && min <= fin;
}

export { MIN_POR_DIA };
