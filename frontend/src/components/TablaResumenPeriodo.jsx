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

// issue #40 — celda "<Días> (<Horas>)"; vacía si los días son cero.
// Minutos → texto largo para los descuentos: "30 min", "1 hora", "4 horas 30 min".
// Formato distinto de 'H:MM' para no confundirlos con las horas presentes (ya
// descontadas de Tarde/Retiros).
function formatoDescuento(min) {
  const m = Number.isInteger(min) && min > 0 ? min : 0;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  const partes = [];
  if (h > 0) partes.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  if (resto > 0 || h === 0) partes.push(`${resto} min`);
  return partes.join(' ');
}

// Con `descuento` (Tarde/Retiros) el tiempo se muestra en negativo y en texto
// largo: "1 (-30 min)". Si no, "<Días> (H:MM)".
function diasYHoras(dias, minutos, descuento = false) {
  if (!dias) return '';
  if (descuento) return `${dias} (${minutos > 0 ? '-' : ''}${formatoDescuento(minutos)})`;
  return `${dias} (${formatoHoras(minutos)})`;
}

// Vacaciones: "7 [02 al 08]"; varios rangos "9 [02 al 08, 20 al 21]"; un día "1 [05]".
function diasConRangos(dias, rangos = []) {
  if (!dias) return '';
  const dia = (fecha) => fecha.slice(8, 10);
  const texto = rangos.map((r) => (r.desde === r.hasta ? dia(r.desde) : `${dia(r.desde)} al ${dia(r.hasta)}`));
  return texto.length > 0 ? `${dias} [${texto.join(', ')}]` : String(dias);
}

const ocultarSiAnomalia =(fila) => (fila.anomalia ? { colSpan: 0 } : {});

export default function TablaResumenPeriodo({ filas, onSeleccionar = null }) {
  if (!filas || filas.length === 0) {
    return <Empty description="No hay empleados esperados en este período." />;
  }

  const columnas = [
    { title: 'Leg', dataIndex: 'legajo', key: 'legajo' },
    { title: 'Empleado', key: 'nombre', render: (_, fila) => fila.nombre ?? '—' },
    {
      title: 'Horas a cobrar',
      key: 'horas',
      render: (_, fila) =>
        fila.anomalia ? <span className="anomalia-mensaje">Anomalía: {fila.anomalia}</span> : formatoHoras(fila.horasTrabajadas),
      onCell: (fila) => (fila.anomalia ? { colSpan: 8 } : {}),
    },
    { title: 'Presentes', key: 'presentes', render: (_, fila) => diasYHoras(fila.completas, fila.horasPor?.presentes), onCell: ocultarSiAnomalia },
    { title: 'Feriados', key: 'feriado', render: (_, fila) => diasYHoras(fila.feriado, fila.horasPor?.feriado), onCell: ocultarSiAnomalia },
    { title: 'Licencia', key: 'licencia', render: (_, fila) => diasYHoras(fila.licencia, fila.horasPor?.licencia), onCell: ocultarSiAnomalia },
    { title: 'Vacaciones', key: 'vacaciones', render: (_, fila) => diasConRangos(fila.vacaciones, fila.rangosVacaciones), onCell: ocultarSiAnomalia },
    { title: 'Tarde', key: 'tarde', render: (_, fila) => diasYHoras(fila.llegadasTarde, fila.descuentoPor?.tarde, true), onCell: ocultarSiAnomalia },
    { title: 'Retiros', key: 'retiros', render: (_, fila) => diasYHoras(fila.retirosAnticipados, fila.descuentoPor?.retiros, true), onCell: ocultarSiAnomalia },
    { title: 'Ausencias', key: 'ausencias', render: (_, fila) => fila.ausencias || '', onCell: ocultarSiAnomalia },
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
