// feature 007 — Estado vacío (US1/US4, FR-011). Se usa cuando no hay ningún
// calendario generado o cuando el mes navegado no tiene calendario. No ofrece la
// acción de reclasificar (FR-018): esta vista no la incluye.

export default function EstadoVacio({ mensaje }) {
  return (
    <div className="estado-vacio" role="status">
      <p>{mensaje}</p>
    </div>
  );
}
