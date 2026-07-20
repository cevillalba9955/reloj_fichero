// Operaciones puras sobre el estado persistido de un período
// (calendario + correcciones + pausas). Compartidas por el adaptador en
// memoria y el de archivo, para que ambos se comporten idénticamente
// (garantizado por el test de contrato).

export function estadoVacio() {
  return { calendario: null, correcciones: [], pausas: [], justificaciones: [] };
}

function motivoValido(motivo) {
  return typeof motivo === 'string' && motivo.trim().length > 0;
}

export function setCalendario(state, cal) {
  state.calendario = cal;
}

export function listCorrecciones(state, legajo) {
  const todas = state.correcciones ?? [];
  return legajo == null ? [...todas] : todas.filter((c) => c.legajo === legajo);
}

// Alta de corrección: exige motivo (defensa en profundidad de FR-027) y
// supersede la corrección vigente previa de la misma jornada (una vigente por
// jornada).
export function addCorreccion(state, c) {
  if (!motivoValido(c?.motivo)) {
    throw new Error('presentismo-repo: la corrección requiere un motivo no vacío (FR-027)');
  }
  for (const prev of state.correcciones) {
    if (prev.legajo === c.legajo && prev.fecha === c.fecha && prev.vigente) {
      prev.vigente = false;
    }
  }
  state.correcciones.push({ ...c, vigente: true });
}

export function revertCorreccion(state, legajo, fecha) {
  let encontrada = false;
  for (const c of state.correcciones) {
    if (c.legajo === legajo && c.fecha === fecha && c.vigente) {
      c.vigente = false;
      encontrada = true;
    }
  }
  return encontrada;
}

export function listPausas(state, legajo) {
  const todas = state.pausas ?? [];
  return legajo == null ? [...todas] : todas.filter((p) => p.legajo === legajo);
}

export function addPausa(state, p) {
  if (!motivoValido(p?.motivo)) {
    throw new Error('presentismo-repo: la pausa requiere un motivo no vacío (FR-040)');
  }
  const id = p.id ?? `pausa-${p.legajo}-${p.fecha}-${state.pausas.length + 1}`;
  state.pausas.push({ ...p, id, vigente: true });
  return id;
}

export function revertPausa(state, id) {
  let encontrada = false;
  for (const p of state.pausas) {
    if (p.id === id && p.vigente) {
      p.vigente = false;
      encontrada = true;
    }
  }
  return encontrada;
}

// feature 012 — Justificación de Ausencias: mismo patrón que corrección (una
// vigente por legajo/día; alta supersede la previa como defensa en
// profundidad, aunque el dominio ya la impide con YA_JUSTIFICADO).
export function listJustificaciones(state, legajo) {
  const todas = state.justificaciones ?? [];
  return legajo == null ? [...todas] : todas.filter((j) => j.legajo === legajo);
}

export function addJustificacion(state, j) {
  if (typeof j?.motivoId !== 'string' || j.motivoId.trim() === '') {
    throw new Error('presentismo-repo: la justificación requiere motivoId (FR-003)');
  }
  for (const prev of state.justificaciones) {
    if (prev.legajo === j.legajo && prev.fecha === j.fecha && prev.vigente) {
      prev.vigente = false;
    }
  }
  state.justificaciones.push({ ...j, vigente: true });
}

export function revertJustificacion(state, legajo, fecha, { autor = null, fechaHora = null } = {}) {
  let encontrada = false;
  for (const j of state.justificaciones ?? []) {
    if (j.legajo === legajo && j.fecha === fecha && j.vigente) {
      j.vigente = false;
      j.reversion = { autor, fechaHora: fechaHora ?? new Date().toISOString() };
      encontrada = true;
    }
  }
  return encontrada;
}
