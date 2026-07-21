import { Select } from 'antd';

// feature 011 (US3) — Selector de período: solo ofrece los períodos con
// calendario generado (FR-002), recibidos del servidor. En modo quincenal
// (FR-013) el servidor manda quincenas 'YYYYMM-Q1'/'YYYYMM-Q2'; el componente
// solo las etiqueta. Componente de presentación puro: no llama a la API
// (Principio I).

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const QUINCENAS = { Q1: '1ra quincena', Q2: '2da quincena' };

// Etiqueta legible de un identificador de período ('YYYYMM' o 'YYYYMM-Q1/Q2').
export function etiquetaPeriodo(periodo) {
  const [mes, quincena] = periodo.split('-');
  const anio = mes.slice(0, 4);
  const nroMes = Number(mes.slice(4, 6));
  const base = `${MESES[nroMes - 1] ?? nroMes} ${anio}`;
  return quincena in QUINCENAS ? `${base} · ${QUINCENAS[quincena]}` : base;
}

export default function SelectorPeriodo({ periodos, periodo, onCambiar }) {
  const opciones = [...periodos]
    .sort()
    .reverse()
    .map((p) => ({ value: p, label: etiquetaPeriodo(p) }));
  return (
    <label className="selector-periodo">
      Período
      <Select
        aria-label="Período"
        value={periodo}
        onChange={(valor) => onCambiar(valor)}
        options={opciones}
        style={{ minWidth: 220 }}
      />
    </label>
  );
}
