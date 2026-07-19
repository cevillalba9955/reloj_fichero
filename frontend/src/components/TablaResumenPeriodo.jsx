// feature 011 (US1) — Tabla de resumen del período: una fila por empleado
// esperado con los 7 acumulados (horas, completas, incompletas, ausencias,
// llegadas tarde, retiros anticipados, correcciones). Componente de
// presentación puro: no llama a la API (Principio I). Fila clickeable
// (US2) cuando no tiene anomalía.

// Minutos → 'H:MM' para lectura (mismo criterio que TablaFichadasHoy).
function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export default function TablaResumenPeriodo({ filas, onSeleccionar = null }) {
  if (!filas || filas.length === 0) {
    return <p className="resumen-vacio">No hay empleados esperados en este período.</p>;
  }
  return (
    <table className="tabla-resumen-periodo" aria-label="Resumen del período">
      <thead>
        <tr>
          <th scope="col">Legajo</th>
          <th scope="col">Nombre</th>
          <th scope="col">Horas trabajadas</th>
          <th scope="col">Completas</th>
          <th scope="col">Incompletas</th>
          <th scope="col">Ausencias</th>
          <th scope="col">Llegadas tarde</th>
          <th scope="col">Retiros anticipados</th>
          <th scope="col">Correcciones</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const clickeable = Boolean(onSeleccionar) && !fila.anomalia;
          return (
            <tr
              key={fila.legajo}
              className={fila.anomalia ? 'fila-resumen anomalia' : 'fila-resumen'}
              onClick={clickeable ? () => onSeleccionar(fila) : undefined}
              style={clickeable ? { cursor: 'pointer' } : undefined}
            >
              <td>{fila.legajo}</td>
              <td>{fila.nombre ?? '—'}</td>
              {fila.anomalia ? (
                <td colSpan={7} className="anomalia-mensaje">
                  Anomalía: {fila.anomalia}
                </td>
              ) : (
                <>
                  <td>{formatoHoras(fila.horasTrabajadas)}</td>
                  <td>{fila.completas}</td>
                  <td>{fila.incompletas}</td>
                  <td>{fila.ausencias}</td>
                  <td>{fila.llegadasTarde}</td>
                  <td>{fila.retirosAnticipados}</td>
                  <td>{fila.correcciones}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
