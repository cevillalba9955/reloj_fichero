import { Table, Empty } from 'antd';

// feature 011 (US1) — Tabla de resumen del período: una fila por empleado
// esperado con los acumulados del período. Componente de presentación puro:
// no llama a la API (Principio I). Fila clickeable (US2) cuando no tiene
// anomalía; una anomalía se muestra como un único mensaje que reemplaza los
// acumulados de esa fila (misma idea que el `colSpan` original, vía la técnica
// `onCell` de antd Table).

// Minutos → 'H:MM' para lectura (mismo criterio que TablaFichadasHoy).
function formatoHoras(min) {
  const m = Number.isInteger(min) && min >= 0 ? min : 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const ocultarSiAnomalia = (fila) => (fila.anomalia ? { colSpan: 0 } : {});

export default function TablaResumenPeriodo({ filas, onSeleccionar = null }) {
  if (!filas || filas.length === 0) {
    return <Empty description="No hay empleados esperados en este período." />;
  }

  const columnas = [
    { title: 'Leg', dataIndex: 'legajo', key: 'legajo' },
    { title: 'Empleado', key: 'nombre', render: (_, fila) => fila.nombre ?? '—' },
    {
      title: 'Horas',
      key: 'horas',
      render: (_, fila) =>
        fila.anomalia ? <span className="anomalia-mensaje">Anomalía: {fila.anomalia}</span> : formatoHoras(fila.horasTrabajadas),
      onCell: (fila) => (fila.anomalia ? { colSpan: 8 } : {}),
    },
    { title: 'Presentes', key: 'presentes', render: (_, fila) => fila.completas, onCell: ocultarSiAnomalia },
    { title: 'Ausencias', dataIndex: 'ausencias', key: 'ausencias', onCell: ocultarSiAnomalia },
    { title: 'Feriados', dataIndex: 'feriado', key: 'feriado', onCell: ocultarSiAnomalia },
    { title: 'Licencia', dataIndex: 'licencia', key: 'licencia', onCell: ocultarSiAnomalia },
    { title: 'Tarde', key: 'tarde', render: (_, fila) => fila.llegadasTarde, onCell: ocultarSiAnomalia },
    { title: 'Retiros', key: 'retiros', render: (_, fila) => fila.retirosAnticipados, onCell: ocultarSiAnomalia },
    { title: 'En Curso', key: 'enCurso', render: (_, fila) => fila.incompletas, onCell: ocultarSiAnomalia },
  ];

  return (
    <Table
      aria-label="Resumen del período"
      className="tabla-resumen-periodo"
      size="small"
      bordered
      pagination={false}
      rowKey="legajo"
      columns={columnas}
      dataSource={filas}
      rowClassName={(fila) => (fila.anomalia ? 'fila-resumen anomalia' : 'fila-resumen')}
      onRow={(fila) => {
        const clickeable = Boolean(onSeleccionar) && !fila.anomalia;
        return {
          onClick: clickeable ? () => onSeleccionar(fila) : undefined,
          style: clickeable ? { cursor: 'pointer' } : undefined,
        };
      }}
    />
  );
}
