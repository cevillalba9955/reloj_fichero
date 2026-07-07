const ESTADOS = {
  PENDIENTE: 'pendiente',
  ABIERTO: 'abierto',
  CERRADO_COMPLETO: 'cerrado_completo',
  CERRADO_MARGEN_AGOTADO: 'cerrado_margen_agotado',
};

const CERRADOS = new Set([ESTADOS.CERRADO_COMPLETO, ESTADOS.CERRADO_MARGEN_AGOTADO]);

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

// data-model.md §3: ventana de aceptación (horaEsperada ± margenMinutos) y
// máquina de estados pendiente -> abierto -> cerrado_completo |
// cerrado_margen_agotado. La completitud es un predicado inyectado por el
// caller (research.md §2/§6): este módulo no sabe nada del padrón de
// empleados activos.
export class Checkpoint {
  constructor({ id, horaEsperada, margenMinutos = 30 }) {
    this.id = id;
    this.horaEsperada = horaEsperada;
    this.margenMinutos = margenMinutos;
    this.estado = ESTADOS.PENDIENTE;
    const base = parseHoraEsperada(horaEsperada);
    this._inicio = base - margenMinutos;
    this._fin = base + margenMinutos;
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
      this.estado = ESTADOS.CERRADO_MARGEN_AGOTADO;
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

// FR-002: dos checkpoints por defecto (entrada ~07:00, salida ~16:00),
// configurables en horaEsperada/margenMinutos.
export function createDefaultCheckpoints(config = {}) {
  const entrada = config.entrada ?? { horaEsperada: '07:00', margenMinutos: 30 };
  const salida = config.salida ?? { horaEsperada: '16:00', margenMinutos: 30 };
  return [
    new Checkpoint({ id: 'entrada', ...entrada }),
    new Checkpoint({ id: 'salida', ...salida }),
  ];
}
