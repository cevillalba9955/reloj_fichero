import { Table, Empty } from 'antd';
import { formatoHoras, diasYHoras, diasConRangos, diasConFechas, diasDeFechas } from '../utils/formato-resumen.js';

// feature 011 (US1) — Tabla de resumen del período: una fila por empleado
// esperado con los acumulados del período. Componente de presentación puro:
// no llama a la API (Principio I). Fila clickeable (US2) cuando no tiene
// anomalía; una anomalía se muestra como un único mensaje que reemplaza los
// acumulados de esa fila (misma idea que el `colSpan` original, vía la técnica
// `onCell` de antd Table).

// Días pasados con una sola fichada (falta la salida o la entrada): suman 0 horas
// y requieren una corrección manual. Se marca en la fila con los días afectados.
function AdvertenciaSinCorregir({ fechas = [] }) {
  if (fechas.length === 0) return null;
  const dias = diasDeFechas(fechas);
  return (
    <span
      className="marca-revision"
      style={{ color: '#d46b08', fontWeight: 600 }}
      title="Jornada incompleta: falta una fichada y el día no suma horas. Requiere corrección."
      aria-label={`Requiere corrección: jornada incompleta los días ${dias}`}
    >
      {' '}
      ⚠ corregir [{dias}]
    </span>
  );
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
      title: 'Horas a cobrar',
      align: 'center',
      key: 'horas',
      render: (_, fila) =>
        fila.anomalia ? (
          <span className="anomalia-mensaje">Anomalía: {fila.anomalia}</span>
        ) : (
          <>
            {formatoHoras(fila.horasTrabajadas)}
            <AdvertenciaSinCorregir fechas={fila.fechasSinCorregir} />
          </>
        ),
      onCell: (fila) => (fila.anomalia ? { colSpan: 8 } : {}),
    },
    { title: 'Presentes', align: 'right', key: 'presentes', render: (_, fila) => diasYHoras(fila.completas, fila.horasPor?.presentes), onCell: ocultarSiAnomalia },
    { title: 'Feriados', align: 'right', key: 'feriado', render: (_, fila) => diasYHoras(fila.feriado, fila.horasPor?.feriado), onCell: ocultarSiAnomalia },
    { title: 'Licencia', align: 'right', key: 'licencia', render: (_, fila) => diasYHoras(fila.licencia, fila.horasPor?.licencia), onCell: ocultarSiAnomalia },
    { title: 'Vacaciones', key: 'vacaciones', render: (_, fila) => diasConRangos(fila.vacaciones, fila.rangosVacaciones), onCell: ocultarSiAnomalia },
    { title: 'Tarde', key: 'tarde', render: (_, fila) => diasYHoras(fila.llegadasTarde, fila.descuentoPor?.tarde, true), onCell: ocultarSiAnomalia },
    { title: 'Retiros', key: 'retiros', render: (_, fila) => diasYHoras(fila.retirosAnticipados, fila.descuentoPor?.retiros, true), onCell: ocultarSiAnomalia },
    { title: 'Ausencias', key: 'ausencias', render: (_, fila) => diasConFechas(fila.ausencias, fila.fechasAusencias), onCell: ocultarSiAnomalia },
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
