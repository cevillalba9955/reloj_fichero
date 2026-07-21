import { useEffect, useState } from 'react';
import { Table, Alert, Spin, Button } from 'antd';
import Dialogo from './Dialogo.jsx';

// feature 011 (US2) — Diálogo modal con el detalle día por día de un
// empleado en el período (FR-004/FR-005/FR-006). Pide el detalle al abrirse
// (estados cargando/error); no altera ningún dato (FR-010). Reutiliza el
// componente modal genérico `Dialogo` (feature 010, iteración 2).

function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const columnas = [
  { title: 'Fecha', dataIndex: 'fecha', key: 'fecha' },
  { title: 'Clasificación', dataIndex: 'clasificacion', key: 'clasificacion' },
  { title: 'Entrada', key: 'entrada', render: (_, dia) => dia.entrada ?? '—' },
  { title: 'Salida', key: 'salida', render: (_, dia) => dia.salida ?? '—' },
  { title: 'Horas', key: 'horas', render: (_, dia) => formatoHoras(dia.horas) },
  {
    title: 'Estado',
    key: 'estado',
    render: (_, dia) => {
      const retiro = dia.pausas.some((p) => p.tipo === 'retiro_anticipado');
      return (
        <>
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
        </>
      );
    },
  },
];

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
            <Spin size="small" /> Cargando…
          </p>
        )}

        {estado.tipo === 'error' && (
          <Alert type="error" showIcon role="alert" message={`Ocurrió un error: ${estado.mensaje}`} />
        )}

        {estado.tipo === 'con-datos' && (
          <Table
            className="tabla-detalle-empleado"
            size="small"
            bordered
            pagination={false}
            rowKey="fecha"
            columns={columnas}
            dataSource={estado.detalle.dias}
            rowClassName={(dia) => {
              const clave = {
                Completa: 'completa',
                Incompleta: 'incompleta',
                'Sin fichadas': 'sin-fichadas',
                'Feriado cumplido': 'feriado-cumplido',
                'No aplica': 'no-aplica',
              }[dia.estado] ?? 'desconocido';
              return `fila-dia estado-${clave}`;
            }}
          />
        )}

        <div className="acciones">
          <Button onClick={onCerrar}>Cerrar</Button>
        </div>
      </div>
    </Dialogo>
  );
}
