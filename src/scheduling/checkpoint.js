const ESTADOS = {
  PENDIENTE: 'pendiente',
  ABIERTO: 'abierto',
  CERRADO_COMPLETO: 'cerrado_completo',
  CERRADO_VENTANA_VENCIDA: 'cerrado_ventana_vencida',
};

const CERRADOS = new Set([ESTADOS.CERRADO_COMPLETO, ESTADOS.CERRADO_VENTANA_VENCIDA]);

function parseHoraEsperada(horaEsperada) {
  const [horas, minutos] = horaEsperada.split(':').map(Number);
  return horas * 60 + minutos;
}

function minutosDelDia(date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function minutosDeHoraString(horaHHMMSS) {
  const [horas, minutos, segundos] = horaHHMMSS.split(':').map(Number);
  return horas * 60 + minutos + (segundos ?? 0) / 60;
}

// data-model.md §3: ventana de aceptación de un solo lado
// [horaEsperada, horaEsperada + duracionMinutos] y máquina de estados
// pendiente -> abierto -> cerrado_completo | cerrado_ventana_vencida. La
// completitud es un predicado inyectado por el caller (research.md §2/§6):
// este módulo no sabe nada del padrón de empleados activos.
export class Checkpoint {
  constructor({ id, horaEsperada, duracionMinutos = 30 }) {
    this.id = id;
    this.horaEsperada = horaEsperada;
    this.duracionMinutos = duracionMinutos;
    this.estado = ESTADOS.PENDIENTE;
    const base = parseHoraEsperada(horaEsperada);
    this._inicio = base;
    this._fin = base + duracionMinutos;
  }

  _dentroDeVentana(minutos) {
    return minutos >= this._inicio && minutos <= this._fin;
  }

  // Usado por el scheduler para decidir si "now" cae dentro de la ventana.
  estaEnVentanaDeAceptacion(now) {
    return this._dentroDeVentana(minutosDelDia(now));
  }

  // Usado por el store para asociar una Fichada ya decodificada a este
  // checkpoint según su propia hora (research.md §6), independientemente de
  // "now".
  contieneHora(horaHHMMSS) {
    if (!horaHHMMSS) return false;
    return this._dentroDeVentana(minutosDeHoraString(horaHHMMSS));
  }

  // Evalúa y actualiza el estado del checkpoint para el instante "now",
  // dado un predicado de completitud ya calculado externamente (FR-004).
  // Un checkpoint cerrado nunca vuelve a abrirse el mismo día (data-model.md
  // §3, validation rules).
  evaluar(now, completo) {
    if (CERRADOS.has(this.estado)) {
      return this.estado;
    }
    const minutos = minutosDelDia(now);
    if (minutos < this._inicio) {
      this.estado = ESTADOS.PENDIENTE;
      return this.estado;
    }
    this.estado = ESTADOS.ABIERTO;
    if (completo) {
      this.estado = ESTADOS.CERRADO_COMPLETO;
      return this.estado;
    }
    if (minutos > this._fin) {
      this.estado = ESTADOS.CERRADO_VENTANA_VENCIDA;
    }
    return this.estado;
  }

  estaAbierto() {
    return this.estado === ESTADOS.ABIERTO;
  }

  estaCerrado() {
    return CERRADOS.has(this.estado);
  }

  // data-model.md §3: todos los checkpoints se reinician a "pendiente" al
  // empezar el día siguiente (no hay persistencia entre días).
  reiniciar() {
    this.estado = ESTADOS.PENDIENTE;
  }
}

// FR-002 (Clarifications 2026-07-14): un único checkpoint "entrada"
// (~07:00) con ventana de un solo lado de duracionMinutos (30 por defecto).
// El checkpoint "salida" quedó fuera de alcance de esta feature.
export function createDefaultCheckpoints(config = {}) {
  const entrada = config.entrada ?? { horaEsperada: '07:00', duracionMinutos: 30 };
  return [
    new Checkpoint({ id: 'entrada', ...entrada }),
  ];
}
