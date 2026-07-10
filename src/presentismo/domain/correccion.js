// Dominio: correcciones manuales (FR-026..030). La corrección vigente de una
// jornada prevalece sobre el valor calculado. Funciones puras; la persistencia
// y la auditoría (autor/fecha/motivo) las maneja el repositorio.

export function correccionVigenteDe(correcciones, legajo, fecha) {
  return correcciones.find((c) => c.vigente && c.legajo === legajo && c.fecha === fecha) ?? null;
}

// Construye el registro de corrección a persistir. Exige motivo (FR-027).
export function crearCorreccion({ periodo, legajo, fecha, valorCalculado, valorCorregido, camposCorregidos, autor, motivo, fechaHora }) {
  if (typeof motivo !== 'string' || motivo.trim().length === 0) {
    throw new Error('correccion: el motivo es obligatorio (FR-027)');
  }
  return {
    periodo,
    legajo,
    fecha,
    valorCalculado: valorCalculado ?? null,
    valorCorregido,
    camposCorregidos: camposCorregidos ?? ['horas'],
    autor: autor ?? null,
    motivo: motivo.trim(),
    fechaHora: fechaHora ?? new Date().toISOString(),
  };
}
