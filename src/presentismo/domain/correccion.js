// Dominio: correcciones manuales (FR-026..030 de 004; extendido por la feature
// 010 para corregir la hora de entrada y/o salida, no solo el total). La
// corrección vigente de una jornada prevalece sobre el valor calculado.
// Funciones puras; la persistencia y la auditoría (autor/fecha/motivo) las
// maneja el repositorio.

export function correccionVigenteDe(correcciones, legajo, fecha) {
  return correcciones.find((c) => c.vigente && c.legajo === legajo && c.fecha === fecha) ?? null;
}

function validarMinutosDelDia(nombre, valor) {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || valor < 0 || valor > 1439) {
    throw new Error(`correccion: ${nombre} debe ser minutos-del-día (0..1439), llegó ${valor}`);
  }
  return valor;
}

// Construye el registro de corrección a persistir. Exige motivo (FR-027) y al
// menos un valor a corregir: total (valorCorregido, compat 004) y/o hora de
// entrada/salida en minutos-del-día (feature 010, research.md §3).
export function crearCorreccion({
  periodo,
  legajo,
  fecha,
  valorCalculado,
  valorCorregido,
  entradaCorregida,
  salidaCorregida,
  camposCorregidos,
  autor,
  motivo,
  fechaHora,
}) {
  if (typeof motivo !== 'string' || motivo.trim().length === 0) {
    throw new Error('correccion: el motivo es obligatorio (FR-027)');
  }
  const entrada = validarMinutosDelDia('entradaCorregida', entradaCorregida);
  const salida = validarMinutosDelDia('salidaCorregida', salidaCorregida);
  const total = valorCorregido ?? null;
  if (total == null && entrada == null && salida == null) {
    throw new Error('correccion: no hay nada que corregir (total, entrada o salida)');
  }

  // camposCorregidos derivados de lo presente, salvo override explícito.
  let campos = camposCorregidos ?? null;
  if (!campos) {
    campos = [];
    if (entrada != null) campos.push('entrada');
    if (salida != null) campos.push('salida');
    if (campos.length === 0) campos = ['horas'];
  }

  return {
    periodo,
    legajo,
    fecha,
    valorCalculado: valorCalculado ?? null,
    valorCorregido: total,
    entradaCorregida: entrada,
    salidaCorregida: salida,
    camposCorregidos: campos,
    autor: autor ?? null,
    motivo: motivo.trim(),
    fechaHora: fechaHora ?? new Date().toISOString(),
  };
}
