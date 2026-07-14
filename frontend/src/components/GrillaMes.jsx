import CeldaDia from './CeldaDia.jsx';

// feature 007 — Grilla mensual (US1, FR-002). 7 columnas (domingo…sábado, según
// `diaSemana` 0..6). Ubica cada día en su columna dejando huecos iniciales, sin
// inventar días de meses vecinos.

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function GrillaMes({ dias, onReclasificar }) {
  if (!dias || dias.length === 0) return null;
  const offset = dias[0].diaSemana; // huecos antes del día 1
  const huecos = Array.from({ length: offset });

  return (
    <div className="grilla" role="grid" aria-label="Calendario del mes">
      <div className="grilla-encabezado" role="row">
        {DIAS_SEMANA.map((d) => (
          <div key={d} role="columnheader" className="dow">
            {d}
          </div>
        ))}
      </div>
      <div className="grilla-dias" role="rowgroup">
        {huecos.map((_, i) => (
          <div key={`hueco-${i}`} className="celda-vacia" aria-hidden="true" />
        ))}
        {dias.map((dia) => (
          <CeldaDia key={dia.fecha} dia={dia} onReclasificar={onReclasificar} />
        ))}
      </div>
    </div>
  );
}
