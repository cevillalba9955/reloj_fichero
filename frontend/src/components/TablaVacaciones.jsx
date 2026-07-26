import { Table, Empty, Tag, Button } from 'antd';

// spec 015 (US2, FR-008) — Tabla de control de vacaciones anual: una fila
// por legajo activo con su antigüedad, saldo actual y próximo incremento.
// Componente de presentación puro: no llama a la API (Principio I). Un
// legajo sin `fechaIngreso` (Acceptance Scenario US2.3) se señala como
// pendiente, sin bloquear el resto de la tabla. Fila clickeable para abrir
// el detalle/asignación (US1/US2).

export default function TablaVacaciones({ legajos, onSeleccionar = null, onAsignar = null, legajoSeleccionado = null }) {
  if (!legajos || legajos.length === 0) {
    return <Empty description="No hay legajos activos." />;
  }

  const columnas = [
    { title: 'Leg', dataIndex: 'legajo', key: 'legajo' },
    { title: 'Empleado', key: 'nombre', render: (_, fila) => fila.nombre ?? '—' },
    {
      title: 'Antigüedad',
      key: 'antiguedad',
      render: (_, fila) =>
        fila.pendienteFechaIngreso ? (
          <Tag color="warning">Falta fecha de ingreso</Tag>
        ) : (
          `${fila.antiguedadAnios} año(s)`
        ),
    },
    { title: 'Saldo', dataIndex: 'saldo', key: 'saldo' },
    {
      title: 'Próximo incremento',
      key: 'proximoIncremento',
      render: (_, fila) =>
        fila.proximoIncremento
          ? `${fila.proximoIncremento} (+${fila.proximoIncrementoDias} día(s))`
          : '—',
    },
  ];

  if (onAsignar) {
    columnas.push({
      title: 'Acciones',
      key: 'acciones',
      render: (_, fila) => (
        <Button
          size="small"
          onClick={(ev) => {
            ev.stopPropagation();
            onAsignar(fila);
          }}
        >
          Asignar vacaciones
        </Button>
      ),
    });
  }

  return (
    <Table
      aria-label="Control de vacaciones anual"
      className="tabla-vacaciones"
      size="small"
      bordered
      pagination={false}
      rowKey="legajo"
      columns={columnas}
      dataSource={legajos}
      rowClassName={(fila) =>
        [
          'fila-vacaciones',
          fila.pendienteFechaIngreso && 'pendiente',
          fila.legajo === legajoSeleccionado && 'seleccionada',
        ]
          .filter(Boolean)
          .join(' ')
      }
      onRow={(fila) => ({
        onClick: onSeleccionar ? () => onSeleccionar(fila) : undefined,
        style: onSeleccionar ? { cursor: 'pointer' } : undefined,
      })}
    />
  );
}
