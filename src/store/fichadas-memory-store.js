function formatPeriodoFromDate(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
}

// research.md §6 (FR-006): si la hora decodificada de la fichada calza con la
// ventana de aceptación de algún checkpoint, se la asocia a ese checkpoint.
// El fallback al "checkpoint abierto al momento de la descarga" aplica SOLO
// cuando la hora vino `null` (registro que no se pudo decodificar): una
// fichada con hora válida pero fuera de toda ventana (p. ej. una salida de
// ayer descargada durante la ventana de entrada de hoy, cuando el reloj la
// reporta recién a la mañana siguiente) NO se taguea a entrada — queda sin
// checkpoint asignado. Nunca se pierde la fichada: solo cambia su `checkpointId`.
function elegirCheckpoint(checkpoints, hora, now) {
  const porHora = checkpoints.find((cp) => cp.contieneHora(hora));
  if (porHora) return porHora.id;
  if (hora == null) {
    const abierto = checkpoints.find((cp) => cp.estaEnVentanaDeAceptacion(now));
    return abierto ? abierto.id : null;
  }
  return null;
}

function formatDiaLocal(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Día (YYYY-MM-DD) al que pertenece una fichada a efectos de completitud por
// checkpoint: su `fecha` decodificada; si vino `null` (respaldo), el día local
// en que se la recolectó. Se reconstruye desde `recolectadaEn` con componentes
// LOCALES para ser consistente con `fechaServicio` (formatFecha del servicio),
// evitando corrimientos de zona horaria. Se usa para acotar la completitud al
// día en curso, de modo que una fichada de un día anterior (que el store
// conserva, ya que agrupa por período mensual) no marque como "completo" a un
// empleado en el día de hoy.
function diaDeFichada(fichada) {
  return fichada.fecha ?? formatDiaLocal(new Date(fichada.recolectadaEn));
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

  // FR-006 (Clarifications 2026-07-14): fichada que completa a un legajo para
  // un checkpoint EN EL DÍA DE SERVICIO dado (YYYY-MM-DD). Solo cuentan las
  // fichadas de ese día (ver diaDeFichada): así, una fichada de un día previo
  // que sigue en el store no "completa" el checkpoint de hoy. Si `fechaServicio`
  // no se pasa, no se acota por día (compatibilidad). Devuelve la Fichada o null.
  function getFichadaQueCompleta(legajo, checkpointId, fechaServicio) {
    for (const porLegajo of fichadasPorPeriodoYLegajo.values()) {
      const fichadas = porLegajo.get(legajo);
      const match = fichadas?.find(
        (f) =>
          f.checkpointId === checkpointId &&
          (fechaServicio === undefined || diaDeFichada(f) === fechaServicio)
      );
      if (match) return match;
    }
    return null;
  }

  // Predicado booleano de completitud, usado por quien integre el padrón de
  // empleados activos (US2).
  function tieneFichadaValidaParaCheckpoint(legajo, checkpointId, fechaServicio) {
    return getFichadaQueCompleta(legajo, checkpointId, fechaServicio) !== null;
  }

  function getFichadasPorLegajo(legajo) {
    const resultado = [];
    for (const porLegajo of fichadasPorPeriodoYLegajo.values()) {
      const fichadas = porLegajo.get(legajo);
      if (fichadas) resultado.push(...fichadas);
    }
    return resultado;
  }

  return {
    addFichada,
    getPeriodos,
    tieneFichadaValidaParaCheckpoint,
    getFichadaQueCompleta,
    getFichadasPorLegajo,
  };
}
