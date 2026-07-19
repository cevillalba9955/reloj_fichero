// feature 007 — Leyenda de claves visuales (US1, FR-006). Un ítem por clave, con
// su etiqueta y descripción textual, para que toda distinción tenga significado
// legible sin depender del color (FR-004).

export default function Leyenda({ items, ocultarDescripcion = true }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="leyenda" aria-label="Leyenda">
      {items.map((it) => (
        <li key={it.clave} className={`leyenda-item clave-${it.clave}`}>
          <span className="leyenda-muestra" aria-hidden="true" />
          <span className="leyenda-etiqueta">{it.etiqueta}</span>
          {!ocultarDescripcion && <span className="leyenda-desc">{it.descripcion}</span>}
        </li>
      ))}
    </ul>
  );
}
