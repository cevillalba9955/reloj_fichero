// feature 007 — Navegación entre meses (US4, FR-012). Calcula el YYYYMM
// adyacente y permite volver al mes por defecto (el último generado) con un gesto.

// Devuelve el YYYYMM desplazado `delta` meses respecto de `periodo`.
export function periodoAdyacente(periodo, delta) {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Devuelve el YYYYMM del mes actual (hoy).
function periodoHoy() {
  const hoy = new Date();
  return `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

export default function NavegacionMes({ periodo, ultimo, periodos = [], onIr }) {
  const mesActual = periodoHoy();
  const periodicidadSiguiente = periodoAdyacente(periodo, 1);

  // Desactivar "siguiente" si es futuro y no tiene calendario generado
  const siguienteLocked = periodicidadSiguiente > mesActual && !periodos.includes(periodicidadSiguiente);

  return (
    <nav className="navegacion" aria-label="Navegación de meses">
      <button type="button" aria-label="Mes anterior" onClick={() => onIr(periodoAdyacente(periodo, -1))}>
        ◀
      </button>
      <span className="nav-periodo">{periodo}</span>
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={siguienteLocked}
        onClick={() => onIr(periodicidadSiguiente)}
      >
        ▶
      </button>
      <button
        type="button"
        className="btn-volver"
        disabled={!ultimo || periodo === ultimo}
        onClick={() => ultimo && onIr(ultimo)}
      >
        Volver al último ({ultimo ?? '—'})
      </button>
    </nav>
  );
}
