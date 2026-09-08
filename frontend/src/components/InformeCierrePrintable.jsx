import { Button } from 'antd';
import Dialogo from './Dialogo.jsx';
import { etiquetaPeriodo } from './SelectorPeriodo.jsx';

// 018-informe-cierre-periodo — Vista imprimible del informe de cierre: el
// documento apto para imprimir y archivar (FR-011). Muestra el sello de
// emisión, el Informe de Resumen (una fila por empleado + total), el Informe
// de Detalle (día por día, empleado por empleado) y la lista de pendientes.
// Componente de presentación puro: recibe la `vista` ya resuelta (Principio I).

function horas(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function marcasDia(d) {
  const marcas = [];
  if (d.corregida) marcas.push('corregida');
  if (d.llegadaTarde) marcas.push('llegada tarde');
  if (d.pausas?.some((p) => p.tipo === 'retiro_anticipado')) marcas.push('retiro anticipado');
  if (d.justificacion) marcas.push(`${d.justificacion.etiquetaMotivo} (${d.justificacion.tipoPago})`);
  if (d.requiereJustificacionRevision) marcas.push('⚠ revisar');
  return marcas.join(' · ');
}

function TablaResumen({ resumen }) {
  return (
    <table className="informe-tabla informe-resumen">
      <thead>
        <tr>
          <th>Legajo</th>
          <th>Nombre</th>
          <th>Modalidad</th>
          <th>Horas computadas</th>
          <th>Completas</th>
          <th>Incompletas</th>
          <th>Ausencias</th>
          <th>Ll. tarde</th>
          <th>Ret. antic.</th>
          <th>Correcc.</th>
          <th>Feriado</th>
          <th>Licencia</th>
          <th>Vacaciones</th>
        </tr>
      </thead>
      <tbody>
        {resumen.filas.map((f) => (
          <tr key={f.legajo} className={f.anomalia ? 'fila-anomalia' : undefined}>
            <td>{f.legajo}</td>
            <td>{f.nombre ?? '—'}</td>
            <td>{f.modalidad ?? '—'}</td>
            {f.anomalia ? (
              <td colSpan={10} className="celda-anomalia" role="alert">
                Anomalía: {f.anomalia}
              </td>
            ) : (
              <>
                <td>{horas(f.horasTrabajadas)}</td>
                <td>{f.completas}</td>
                <td>{f.incompletas}</td>
                <td>{f.ausencias}</td>
                <td>{f.llegadasTarde}</td>
                <td>{f.retirosAnticipados}</td>
                <td>{f.correcciones}</td>
                <td>{f.feriado}</td>
                <td>{f.licencia}</td>
                <td>{f.vacaciones}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>
            Total ({resumen.encabezado.empleados} empleados)
          </td>
          <td>{horas(resumen.encabezado.totalHoras)}</td>
          <td colSpan={9} />
        </tr>
      </tfoot>
    </table>
  );
}

function SeccionDetalle({ seccion }) {
  return (
    <section className="seccion-empleado">
      <h4>
        {seccion.legajo} — {seccion.nombre ?? 'sin nombre'}
        {seccion.modalidad ? ` (${seccion.modalidad})` : ''}
      </h4>
      {seccion.anomalia ? (
        <p className="celda-anomalia" role="alert">
          Anomalía: {seccion.anomalia}
        </p>
      ) : (
        <>
          <table className="informe-tabla informe-detalle">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Día</th>
                <th>Clasificación</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Pausas</th>
                <th>Horas</th>
                <th>Estado</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {seccion.dias.map((d) => (
                <tr key={d.fecha}>
                  <td>{d.fecha}</td>
                  <td>{d.diaSemana}</td>
                  <td>{d.clasificacion}</td>
                  <td>{d.entrada ?? '—'}</td>
                  <td>{d.salida ?? '—'}</td>
                  <td>
                    {d.pausas?.length
                      ? d.pausas.map((p) => `${p.desde}–${p.hasta}`).join(', ')
                      : '—'}
                  </td>
                  <td>{horas(d.horas)}</td>
                  <td>{d.estado}</td>
                  <td>{marcasDia(d) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtotal-empleado">Subtotal horas: {horas(seccion.subtotalHoras)}</p>
        </>
      )}
    </section>
  );
}

function Pendientes({ pendientes }) {
  if (!pendientes.hayPendientes) {
    return <p className="pendientes-vacio">Sin pendientes de revisión.</p>;
  }
  return (
    <div className="pendientes-lista">
      {pendientes.jornadasIncompletas.length > 0 && (
        <div>
          <h5>Jornadas incompletas</h5>
          <ul>
            {pendientes.jornadasIncompletas.map((p) => (
              <li key={p.legajo}>
                {p.legajo} — {p.nombre ?? 'sin nombre'}: {p.fechas.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendientes.anomalias.length > 0 && (
        <div>
          <h5>Empleados con anomalía</h5>
          <ul>
            {pendientes.anomalias.map((p) => (
              <li key={p.legajo}>
                {p.legajo} — {p.nombre ?? 'sin nombre'}: {p.detalle}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pendientes.ajustes.length > 0 && (
        <div>
          <h5>Días con corrección o justificación</h5>
          <ul>
            {pendientes.ajustes.map((p) => (
              <li key={p.legajo}>
                {p.legajo} — {p.nombre ?? 'sin nombre'}: {p.fechas.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function InformeCierrePrintable({ vista, onCerrar }) {
  const { sello, resumen, detalle, pendientes, obsoleto } = vista;
  const fechaEmision = new Date(sello.emitidoEn).toLocaleString('es-AR');

  return (
    <Dialogo etiqueta={`Informe de cierre — ${etiquetaPeriodo(sello.periodoId)}`} onCerrar={onCerrar}>
      <style>{`
        @media print {
          body > *:not(.dialogo-backdrop) { display: none !important; }
          .dialogo-backdrop { position: static !important; }
          .dialogo-backdrop .ant-modal-mask { display: none !important; }
          .dialogo-backdrop .ant-modal { max-width: 100% !important; top: 0 !important; }
          .informe-cierre-imprimible .no-imprimir { display: none !important; }
          .seccion-empleado { break-inside: avoid; }
        }
      `}</style>
      <div className="informe-cierre-imprimible">
        <header className="informe-sello">
          <h3>Informe de cierre — {etiquetaPeriodo(sello.periodoId)}</h3>
          <p>
            Período <strong>{sello.periodoId}</strong> (tramo {sello.tramo}) ·{' '}
            {resumen.encabezado.rangoFechas.desde} a {resumen.encabezado.rangoFechas.hasta}
          </p>
          <p>
            Emitido el {fechaEmision}
            {sello.autor ? ` por ${sello.autor}` : ''} ({sello.modo})
          </p>
          {obsoleto && (
            <p className="informe-obsoleto" role="alert">
              El período fue reabierto después de esta emisión: el informe está desactualizado, volvé a emitirlo.
            </p>
          )}
        </header>

        <section>
          <h4>Resumen de horas computadas</h4>
          <TablaResumen resumen={resumen} />
        </section>

        <section>
          <h4>Detalle de asistencia</h4>
          {detalle.secciones.map((s) => (
            <SeccionDetalle key={s.legajo} seccion={s} />
          ))}
        </section>

        <section>
          <h4>Pendientes de revisión</h4>
          <Pendientes pendientes={pendientes} />
        </section>

        <div className="acciones no-imprimir">
          <Button type="primary" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button onClick={onCerrar}>Cerrar</Button>
        </div>
      </div>
    </Dialogo>
  );
}
