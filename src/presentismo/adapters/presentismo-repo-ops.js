// Operaciones puras sobre el estado persistido de un período
// (calendario + correcciones + pausas). Compartidas por el adaptador en
// memoria y el de archivo, para que ambos se comporten idénticamente
// (garantizado por el test de contrato).

export function estadoVacio() {
  return { calendario: null, correcciones: [], pausas: [] };
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
