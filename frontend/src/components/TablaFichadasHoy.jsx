// feature 010 (US1) — Tabla de fichadas del día: una fila por empleado esperado
// con legajo, nombre, entrada, salida, horas trabajadas y situación. La
// distinción visual de la situación va por clase CSS + texto legible (mismo
// criterio de accesibilidad que Leyenda.jsx: el significado nunca depende solo
// del color). Componente de presentación puro: no llama a la API (Principio I).

const CLAVE_SITUACION = {
  ESPERANDO: 'esperando',
  PRESENTE: 'presente',
  TARDE: 'tarde',
  AUSENTE: 'ausente',
  Completa: 'completa',
  RETIRO_ANTICIPADO: 'retiro-anticipado',
  'Feriado cumplido': 'feriado-cumplido',
  'No aplica': 'no-aplica',
  ANOMALIA: 'anomalia',
};

const ETIQUETA_SITUACION = {
  RETIRO_ANTICIPADO: 'Retiro anticipado',
  ANOMALIA: 'Anomalía',
};

// Minutos → 'H:MM' para lectura (el dato viaja en minutos, formato de 004).
function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export default function TablaFichadasHoy({ empleados, onCorregir = null, onPausaRetiro = null }) {
  if (!empleados || empleados.length === 0) {
    return <p className="fichadas-vacio">No hay empleados esperados para hoy.</p>;
  }
  const conAcciones = Boolean(onCorregir || onPausaRetiro);
  return (
    <table className="tabla-fichadas" aria-label="Fichadas de hoy">
      <thead>
        <tr>
          <th scope="col">Legajo</th>
          <th scope="col">Nombre</th>
          <th scope="col">Entrada</th>
          <th scope="col">Salida</th>
          <th scope="col">Horas trabajadas</th>
          <th scope="col">Situación</th>
          {conAcciones && <th scope="col">Acciones</th>}
        </tr>
      </thead>
      <tbody>
        {empleados.map((fila) => {
          const clave = CLAVE_SITUACION[fila.situacion] ?? 'desconocida';
          return (
            <tr key={fila.legajo} className={`fila-fichada situacion-${clave}`}>
              <td>{fila.legajo}</td>
              <td>{fila.nombre ?? '—'}</td>
              <td>{fila.entrada ?? '—'}</td>
              <td>{fila.salida ?? '—'}</td>
              <td>{formatoHoras(fila.horasTrabajadas)}</td>
              <td>
                <span className={`situacion clave-${clave}`}>
                  {ETIQUETA_SITUACION[fila.situacion] ?? fila.situacion}
                </span>
                {fila.correccionVigente && <span className="marca-correccion"> (corregida)</span>}
                {fila.anomalias?.length > 0 && (
                  <span className="anomalias"> {fila.anomalias.join('; ')}</span>
                )}
              </td>
              {conAcciones && (
                <td>
                  {onCorregir && fila.situacion !== 'ANOMALIA' && (
                    <button type="button" onClick={() => onCorregir(fila)}>
                      Corregir
                    </button>
                  )}
                  {onPausaRetiro && fila.situacion !== 'ANOMALIA' && (
                    <button type="button" onClick={() => onPausaRetiro(fila)}>
                      Pausa / Retiro
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
