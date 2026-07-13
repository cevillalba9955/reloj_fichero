// Interpreta un valor crudo como legajo válido; devuelve el entero o null.
// Regla única compartida por los adaptadores de padrón (Oracle y archivo):
// entero ≥ 1, mismo dominio que el legajo RS956. Un string debe ser sólo
// dígitos; cualquier otra cosa (decimal, negativo, no numérico) es inválida.
export function interpretarLegajo(raw) {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  return null;
}
