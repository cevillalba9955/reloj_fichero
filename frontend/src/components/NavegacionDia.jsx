// feature 010, iteración 2 (US5, FR-016/FR-017) — Navegación entre días de la
// página "Fichadas de Hoy". Componente de presentación puro (Principio I): los
// destinos navegables vienen del bloque `navegacion` que calcula el servidor
// (research.md §6); un destino null deshabilita el botón (nunca se ofrece un
// día futuro ni un período sin calendario).

export default function NavegacionDia({ navegacion, onNavegar }) {
  if (!navegacion) return null;
  return (
    <nav className="navegacion-dia" aria-label="Navegación de días">
      <button
        type="button"
        disabled={!navegacion.anterior}
        onClick={() => onNavegar(navegacion.anterior)}
      >
        ← Día anterior
      </button>
      <button
        type="button"
        disabled={!navegacion.siguiente}
        onClick={() => onNavegar(navegacion.siguiente)}
      >
        Día siguiente →
      </button>
    </nav>
  );
}
