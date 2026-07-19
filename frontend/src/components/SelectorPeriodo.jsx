// feature 011 (US3) — Selector de período: solo ofrece los períodos con
// calendario generado (FR-002), recibidos del servidor. Componente de
// presentación puro: no llama a la API (Principio I).

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function etiquetaDe(periodo) {
  const anio = periodo.slice(0, 4);
  const mes = Number(periodo.slice(4, 6));
  return `${MESES[mes - 1] ?? mes} ${anio}`;
}

export default function SelectorPeriodo({ periodos, periodo, onCambiar }) {
  return (
    <label className="selector-periodo">
      Período
      <select value={periodo} onChange={(ev) => onCambiar(ev.target.value)}>
        {[...periodos]
          .sort()
          .reverse()
          .map((p) => (
            <option key={p} value={p}>
              {etiquetaDe(p)}
            </option>
          ))}
      </select>
    </label>
  );
}
