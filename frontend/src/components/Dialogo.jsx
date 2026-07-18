import { useEffect, useRef } from 'react';

// feature 010, iteración 2 (FR-018, research.md §8) — Diálogo modal
// reutilizable, mismo patrón div+backdrop que DialogoConfirmarReclasificar
// (007). Escape y click en el backdrop equivalen a Cancelar (`onCerrar`, sin
// efecto alguno); el click dentro del contenido no cierra. Al abrir, el foco
// pasa al contenedor del diálogo.

export default function Dialogo({ etiqueta, onCerrar, children }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    function onKeyDown(ev) {
      if (ev.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCerrar]);

  return (
    <div
      className="dialogo-backdrop"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onCerrar();
      }}
    >
      <div className="dialogo" role="dialog" aria-modal="true" aria-label={etiqueta} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}
