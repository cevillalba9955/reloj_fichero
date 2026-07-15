// feature 007/008 — Navegación entre meses (US4 feature 007; US3 feature 008).
// Calcula el YYYYMM adyacente y permite volver al último generado. La feature
// 008 acota la navegación: solo se puede pisar un mes ya generado o un mes de la
// frontera generable que entrega el backend; nunca un mes vacío no generable.
// La UI NO decide la contigüidad: deriva el deshabilitado de `periodos` ∪
// `generables` (sin usar la fecha del cliente).

// Devuelve el YYYYMM desplazado `delta` meses respecto de `periodo`.
export function periodoAdyacente(periodo, delta) {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(4, 6));
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function NavegacionMes({ periodo, ultimo, periodos = [], generables = [], onIr }) {
  // Un mes es alcanzable si ya está generado o pertenece a la frontera generable.
  const alcanzable = (p) => periodos.includes(p) || generables.includes(p);
  const siguiente = periodoAdyacente(periodo, 1);
  const anterior = periodoAdyacente(periodo, -1);

  return (
    <nav className="navegacion" aria-label="Navegación de meses">
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
        disabled={!ultimo || periodo === ultimo}
        onClick={() => ultimo && onIr(ultimo)}
      >
        Volver al último ({ultimo ?? '—'})
      </button>
    </nav>
  );
}
