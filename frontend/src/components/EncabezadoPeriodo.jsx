// feature 007 — Encabezado del período de liquidación activo (US2, FR-008/010).
// Muestra la etiqueta y el rango de fechas; si no hay período activo, lo indica
// explícitamente y la grilla se muestra igual.

export default function EncabezadoPeriodo({ periodoActivo }) {
  if (!periodoActivo) {
    return (
      <div className="periodo-activo sin-periodo" role="status">
        Sin período activo
      </div>
    );
  }
  return (
    <div className="periodo-activo" role="status">
      <span className="periodo-etiqueta">{periodoActivo.etiqueta}</span>
      <span className="periodo-rango">
        {periodoActivo.desde} – {periodoActivo.hasta}
      </span>
    </div>
  );
}
