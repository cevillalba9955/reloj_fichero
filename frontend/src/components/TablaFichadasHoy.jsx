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

// feature 012 — un día con Justificación `Paga` vigente se etiqueta como
// "LICENCIA" en la columna Situación (en vez de AUSENTE/etc.), para que se
// note de un vistazo que la ausencia está cubierta y paga.
function esLicencia(fila) {
  return fila.justificacion?.tipoPago === 'Paga';
}

// Minutos → 'H:MM' para lectura (el dato viaja en minutos, formato de 004).
function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// iteración 2 (FR-001, research.md §7) — Pausa "principal" del día: la primera
// pausa intermedia ordenada por `desde` (regla de presentación; los retiros
// anticipados tienen su propia situación y no se muestran en estas columnas).
// `adicionales` cuenta las pausas intermedias restantes (indicador +N).
function pausaPrincipalDe(pausas = []) {
  const intermedias = pausas
    .filter((p) => (p.tipo ?? 'intermedia') === 'intermedia')
    .sort((a, b) => a.desde.localeCompare(b.desde));
  if (intermedias.length === 0) return { principal: null, adicionales: 0 };
  return { principal: intermedias[0], adicionales: intermedias.length - 1 };
}

export default function TablaFichadasHoy({
  empleados,
  onCorregir = null,
  onPausaRetiro = null,
  onJustificar = null,
  onRevertirJustificacion = null,
}) {
  if (!empleados || empleados.length === 0) {
    return <p className="fichadas-vacio">No hay empleados esperados para hoy.</p>;
  }
  const conAcciones = Boolean(onCorregir || onPausaRetiro || onJustificar);
  return (
    <table width="100%" border="1" style={{ textAlign: 'center' }} className="tabla-fichadas" aria-label="Fichadas de hoy">
      <thead>
        <tr>
          <th scope="col">Leg</th>
          <th scope="col">Empleado</th>
          <th scope="col">Entrada</th>
          <th scope="col" colSpan="2">Pausa</th>
          <th scope="col">Salida</th>
          <th scope="col">Horas</th>
          <th scope="col">Situación</th>
          {conAcciones && <th scope="col">Acciones</th>}
        </tr>
      </thead>
      <tbody>
        {empleados.map((fila) => {
          const licencia = esLicencia(fila);
          const clave = licencia ? 'licencia' : CLAVE_SITUACION[fila.situacion] ?? 'desconocida';
          const etiquetaSituacion = licencia ? 'LICENCIA' : ETIQUETA_SITUACION[fila.situacion] ?? fila.situacion;
          const { principal, adicionales } = pausaPrincipalDe(fila.pausas);
          return (
            <tr key={fila.legajo} className={`fila-fichada situacion-${clave}`}>
              <td>{fila.legajo}</td>
              <td>{fila.nombre ?? '—'}</td>
              <td>{fila.entrada ?? '—'}</td>
              <td>{principal?.desde ?? '—'}</td>
              <td>
                {principal?.hasta ?? '—'}
                {adicionales > 0 && <span className="pausas-adicionales"> +{adicionales}</span>}
              </td>
              <td>{fila.salida ?? '—'}</td>
              <td>{formatoHoras(fila.horasTrabajadas)}</td>
              <td>
                <span className={`situacion clave-${clave}`}>
                  {!fila.justificacion && etiquetaSituacion}
                  {fila.justificacion && fila.justificacion.etiquetaMotivo}
                </span>
                {fila.correccionVigente && <span className="marca-correccion"> (*)</span>}
                {fila.requiereJustificacionRevision && (
                  <span className="marca-revision" role="alert">
                    {' '}
                    ⚠ revisar: llegaron fichadas sobre un día justificado
                  </span>
                )}
                {fila.anomalias?.length > 0 && (
                  <span className="anomalias"> {fila.anomalias.join('; ')}</span>
                )}
              </td>
              {conAcciones && (
                <td>
                  {onCorregir && fila.situacion !== 'ANOMALIA' && !fila.justificacion && (
                    <button type="button" onClick={() => onCorregir(fila)}>
                      Corregir
                    </button>
                  )}
                  {onPausaRetiro && fila.situacion !== 'ANOMALIA' && fila.entrada != null && (
                    <button type="button" onClick={() => onPausaRetiro(fila)}>
                      Excepcion
                    </button>
                  )}
                  {onJustificar && fila.situacion === 'AUSENTE' && !fila.justificacion && (
                    <button type="button" onClick={() => onJustificar(fila)}>
                      Justificación
                    </button>
                  )}
                  {onRevertirJustificacion && fila.justificacion && (
                    <button type="button" onClick={() => onRevertirJustificacion(fila)}>
                      Revertir justificación
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
