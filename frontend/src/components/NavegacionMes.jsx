// feature 007 — Navegación entre meses (US4, FR-012). Calcula el YYYYMM
// adyacente y permite volver al mes por defecto (el último generado) con un gesto.

// Devuelve el YYYYMM desplazado `delta` meses respecto de `periodo`.
export function periodoAdyacente(periodo, delta) {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function NavegacionMes({ periodo, ultimo, onIr }) {
  return (
    <nav className="navegacion" aria-label="Navegación de meses">
      <button type="button" aria-label="Mes anterior" onClick={() => onIr(periodoAdyacente(periodo, -1))}>
        ◀
      </button>
      <span className="nav-periodo">{periodo}</span>
      <button type="button" aria-label="Mes siguiente" onClick={() => onIr(periodoAdyacente(periodo, 1))}>
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
