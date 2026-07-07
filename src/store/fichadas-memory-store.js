function formatPeriodoFromDate(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
}

// research.md §6: si la hora decodificada de la fichada calza con la
// ventana de aceptación de algún checkpoint, se la asocia a ese checkpoint;
// si no (o si la hora es null), se la asocia al checkpoint que estaba
// abierto al momento de la descarga; si ninguno lo estaba, queda sin
// checkpoint asignado (nunca se pierde la fichada).
function elegirCheckpoint(checkpoints, hora, now) {
  const porHora = checkpoints.find((cp) => cp.contieneHora(hora));
  if (porHora) return porHora.id;
  const abierto = checkpoints.find((cp) => cp.estaEnVentanaDeAceptacion(now));
  return abierto ? abierto.id : null;
}

// data-model.md §1, §2, §4: store en memoria de Empleado/Fichada/Período.
// research.md §9 (FR-017): deduplica por rawHex antes de agregar cualquier
// fichada, ya que el reloj no borra fichadas y las vuelve a reportar como
// pendientes en ciclos de sondeo posteriores.
export function createFichadasMemoryStore() {
  const rawHexVistos = new Set();
  // periodoId -> legajo -> Fichada[]
  const fichadasPorPeriodoYLegajo = new Map();

  function addFichada(fichadaParseada, { checkpoints = [], now = new Date() } = {}) {
    if (rawHexVistos.has(fichadaParseada.rawHex)) {
      return { agregada: false, motivo: 'duplicada' };
    }
    rawHexVistos.add(fichadaParseada.rawHex);

    const periodoAproximado = !fichadaParseada.fecha;
    const periodo = fichadaParseada.fecha
      ? fichadaParseada.fecha.slice(0, 7)
      : formatPeriodoFromDate(now);
    const checkpointId = elegirCheckpoint(checkpoints, fichadaParseada.hora, now);

    const fichada = {
      legajo: fichadaParseada.legajo,
      metodo: fichadaParseada.metodo,
      fecha: fichadaParseada.fecha,
      hora: fichadaParseada.hora,
      rawHex: fichadaParseada.rawHex,
      periodo,
      periodoAproximado,
      checkpointId,
      recolectadaEn: now.toISOString(),
    };

    if (!fichadasPorPeriodoYLegajo.has(periodo)) {
      fichadasPorPeriodoYLegajo.set(periodo, new Map());
    }
    const porLegajo = fichadasPorPeriodoYLegajo.get(periodo);
    if (!porLegajo.has(fichada.legajo)) {
      porLegajo.set(fichada.legajo, []);
    }
    porLegajo.get(fichada.legajo).push(fichada);

    return { agregada: true, fichada };
  }

  // data-model.md §4: vista agregada por período+legajo, base de
  // getState().periodos.
  function getPeriodos() {
    const periodos = [];
    for (const [periodoId, porLegajo] of fichadasPorPeriodoYLegajo) {
      for (const [legajo, fichadas] of porLegajo) {
        periodos.push({ id: periodoId, legajo, fichadas: [...fichadas] });
      }
    }
    return periodos;
  }

  // FR-006: predicado de completitud para un legajo en un checkpoint dado,
  // usado por quien integre el padrón de empleados activos (US2).
  function tieneFichadaValidaParaCheckpoint(legajo, checkpointId) {
    for (const porLegajo of fichadasPorPeriodoYLegajo.values()) {
      const fichadas = porLegajo.get(legajo);
      if (fichadas?.some((f) => f.checkpointId === checkpointId)) {
        return true;
      }
    }
    return false;
  }

  function getFichadasPorLegajo(legajo) {
    const resultado = [];
    for (const porLegajo of fichadasPorPeriodoYLegajo.values()) {
      const fichadas = porLegajo.get(legajo);
      if (fichadas) resultado.push(...fichadas);
    }
    return resultado;
  }

  return { addFichada, getPeriodos, tieneFichadaValidaParaCheckpoint, getFichadasPorLegajo };
}
