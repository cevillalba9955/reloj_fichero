import { useEffect, useState } from 'react';
import Dialogo from './Dialogo.jsx';

// feature 011 (US2) — Diálogo modal con el detalle día por día de un
// empleado en el período (FR-004/FR-005/FR-006). Pide el detalle al abrirse
// (estados cargando/error); no altera ningún dato (FR-010). Reutiliza el
// componente modal genérico `Dialogo` (feature 010, iteración 2).

const CLAVE_ESTADO = {
  Completa: 'completa',
  Incompleta: 'incompleta',
  'Sin fichadas': 'sin-fichadas',
  'Feriado cumplido': 'feriado-cumplido',
  'No aplica': 'no-aplica',
};

function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export default function DialogoDetalleEmpleado({ cliente, legajo, nombre, periodo, onCerrar }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });

  useEffect(() => {
    let cancelado = false;
    setEstado({ tipo: 'cargando' });
    cliente
      .obtenerDetalle(legajo, periodo)
      .then((detalle) => {
        if (!cancelado) setEstado({ tipo: 'con-datos', detalle });
      })
      .catch((err) => {
        if (!cancelado) setEstado({ tipo: 'error', mensaje: err.message });
      });
    return () => {
      cancelado = true;
    };
  }, [cliente, legajo, periodo]);

  return (
    <Dialogo etiqueta={`Detalle de fichadas — ${nombre ?? `legajo ${legajo}`}`} onCerrar={onCerrar}>
      <div className="detalle-empleado">
        <h3>Detalle — {nombre ?? `legajo ${legajo}`}</h3>

        {estado.tipo === 'cargando' && (
          <p className="cargando" role="status">
            Cargando…
          </p>
        )}

        {estado.tipo === 'error' && (
          <p className="error" role="alert">
            Ocurrió un error: {estado.mensaje}
          </p>
        )}

        {estado.tipo === 'con-datos' && (
          <table className="tabla-detalle-empleado" border="1">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Clasificación</th>
                <th scope="col">Entrada</th>
                <th scope="col">Salida</th>
                <th scope="col">Horas</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {estado.detalle.dias.map((dia) => {
                const clave = CLAVE_ESTADO[dia.estado] ?? 'desconocido';
                const retiro = dia.pausas.some((p) => p.tipo === 'retiro_anticipado');
                return (
                  <tr key={dia.fecha} className={`fila-dia estado-${clave}`}>
                    <td>{dia.fecha}</td>
                    <td>{dia.clasificacion}</td>
                    <td>{dia.entrada ?? '—'}</td>
                    <td>{dia.salida ?? '—'}</td>
                    <td>{formatoHoras(dia.horas)}</td>
                    <td>
                      {dia.estado}
                      {dia.corregida && <span className="marca-corregida"> (corregida)</span>}
                      {retiro && <span className="marca-retiro"> (retiro anticipado)</span>}
                      {dia.justificacion && (
                        <span className="marca-justificacion">
                          {' '}
                          ({dia.justificacion.etiquetaMotivo}, {dia.justificacion.tipoPago})
                        </span>
                      )}
                      {dia.requiereJustificacionRevision && (
                        <span className="marca-revision" role="alert">
                          {' '}
                          ⚠ revisar
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="acciones">
          <button type="button" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
