// feature 007/008 — Navegación entre meses (US4 feature 007; US3 feature 008).
// Calcula el YYYYMM adyacente y permite volver al mes en curso (hoy). La feature
// 008 acota la navegación: solo se puede pisar un mes ya generado o un mes de la
// frontera generable que entrega el backend; nunca un mes vacío no generable.
// La UI NO decide la contigüidad: deriva el deshabilitado de `periodos` ∪
// `generables` (sin usar la fecha del cliente; `mesActual` viene del servidor).

// Devuelve el YYYYMM desplazado `delta` meses respecto de `periodo`.
export function periodoAdyacente(periodo, delta) {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function NavegacionMes({ periodo, mesActual = null, periodos = [], generables = [], onIr }) {
  // Un mes es alcanzable si ya está generado o pertenece a la frontera generable.
  const alcanzable = (p) => periodos.includes(p) || generables.includes(p);
  const siguiente = periodoAdyacente(periodo, 1);
  const anterior = periodoAdyacente(periodo, -1);

  // "Volver al mes en curso" es también un control de navegación: respeta la
  // misma garantía (FR-007) y solo se habilita si el mes actual es alcanzable,
  // para no aterrizar en un mes vacío no generable.
  const volverDeshabilitado = !mesActual || periodo === mesActual || !alcanzable(mesActual);

  return (
    <nav className="navegacion" aria-label="Navegación de meses" style={{ justifyContent: 'end' }}>
      <button
        type="button"
        aria-label="Mes anterior"
        disabled={!alcanzable(anterior)}
        onClick={() => onIr(anterior)}
      >
        ◀
      </button>
      <span className="nav-periodo">{periodo}</span>
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={!alcanzable(siguiente)}
        onClick={() => onIr(siguiente)}
      >
        ▶
      </button>
      <button
        type="button"
        className="btn-volver"
        disabled={volverDeshabilitado}
        onClick={() => mesActual && onIr(mesActual)}
      >
        Volver ({mesActual ?? '—'})
      </button>
    </nav>
  );
}
