// feature 007 — Celda de un día en la grilla (US1/US2/US3). Muestra la
// clasificación con color + un 2º recurso perceptible (etiqueta textual +
// aria-label), FR-003/004. Resalta hábiles/feriados (FR-005), marca hoy por
// forma (FR-007) y distingue la pertenencia al período activo (FR-009).

const ETIQUETA = {
  Laborable: 'Hábil',
  'No Laborable': 'No laborable',
  Feriado: 'Feriado',
};

const OPCIONES = ['Laborable', 'No Laborable', 'Feriado'];

export default function CeldaDia({ dia, onReclasificar }) {
  const etiqueta = ETIQUETA[dia.clasificacion] ?? dia.clasificacion;
  const clases = ['celda', `resaltado-${dia.resaltado}`];
  if (dia.esHoy) clases.push('es-hoy');
  if (dia.enPeriodoActivo) clases.push('en-periodo');

  const aria =
    `Día ${dia.dd}, ${etiqueta}` +
    (dia.esHoy ? ', hoy' : '') +
    (dia.enPeriodoActivo ? ', en período activo' : '');

  return (
    <div
      className={clases.join(' ')}
      role="gridcell"
      aria-label={aria}
      data-fecha={dia.fecha}
      data-clasificacion={dia.clasificacion}
      data-resaltado={dia.resaltado}
      data-es-hoy={dia.esHoy ? 'true' : 'false'}
      data-en-periodo={dia.enPeriodoActivo ? 'true' : 'false'}
    >
      <span className="dia-numero">{dia.dd}</span>
      <span className="dia-clasificacion">{etiqueta}</span>
      {dia.esHoy && (
        <span className="marca-hoy" aria-hidden="true" title="Hoy">
          ●
        </span>
      )}
      {onReclasificar && (
        <div className="reclasificar">
          <label className="sr-only" htmlFor={`recl-${dia.fecha}`}>
            Reclasificar {dia.fecha}
          </label>
          <select
            id={`recl-${dia.fecha}`}
            defaultValue=""
            onChange={(e) => {
              const valor = e.target.value;
              e.target.value = '';
              if (valor && valor !== dia.clasificacion) onReclasificar(dia, valor);
            }}
          >
            <option value="">Reclasificar…</option>
            {OPCIONES.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
