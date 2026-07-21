import { Tag } from 'antd';
import { ESTADOS_CALENDARIO } from '../theme/estados.js';

// feature 007 — Leyenda de claves visuales (US1, FR-006). Un ítem por clave, con
// su etiqueta y descripción textual, para que toda distinción tenga significado
// legible sin depender del color (FR-004). El color del `Tag` es un refuerzo
// visual; `className="clave-${it.clave}"` conserva la distinción por forma
// (borde sólido/discontinuo) definida en estilos-dominio para claves que no
// están en el mapa color+ícono (p. ej. "hoy", "periodo-activo").

export default function Leyenda({ items, ocultarDescripcion = true }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="leyenda" aria-label="Leyenda">
      {items.map((it) => {
        const color = ESTADOS_CALENDARIO[it.clave]?.color;
        return (
          <li key={it.clave} className={`leyenda-item clave-${it.clave}`}>
            <Tag color={color} className="leyenda-muestra-tag">
              {it.etiqueta}
            </Tag>
            {!ocultarDescripcion && <span className="leyenda-desc"> {it.descripcion}</span>}
          </li>
        );
      })}
    </ul>
  );
}
