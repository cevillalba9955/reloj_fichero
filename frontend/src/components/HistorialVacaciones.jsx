import { Table, Empty, Button, Tag, Space } from 'antd';

// spec 015 (US2, FR-009; US4, FR-014) — Historial de movimientos de saldo de
// un legajo (incrementos anuales y descuentos/reversiones por asignación),
// cada uno con fecha, cantidad de días y saldo resultante en ese momento
// (Acceptance Scenario US2.2), y la lista de asignaciones con acción para
// revertir una vigente (US4). Componente de presentación: `onRevertir`
// (async) es opcional — sin él, no se ofrece la acción.

const ETIQUETA_TIPO = {
  incremento: 'Incremento anual',
  asignacion: 'Asignación',
  reversion: 'Reversión',
};

export default function HistorialVacaciones({ movimientos, asignaciones = [], onRevertir = null }) {
  const columnasMovimientos = [
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha' },
    { title: 'Tipo', key: 'tipo', render: (_, m) => ETIQUETA_TIPO[m.tipo] ?? m.tipo },
    { title: 'Días', dataIndex: 'dias', key: 'dias' },
    { title: 'Saldo resultante', dataIndex: 'saldoResultante', key: 'saldoResultante' },
  ];

  const columnasAsignaciones = [
    { title: 'Desde', dataIndex: 'fechaInicio', key: 'fechaInicio' },
    { title: 'Hasta', dataIndex: 'fechaFin', key: 'fechaFin' },
    { title: 'Días', dataIndex: 'cantidadDias', key: 'cantidadDias' },
    {
      title: 'Estado',
      key: 'estado',
      render: (_, a) => (a.vigente ? <Tag color="success">Vigente</Tag> : <Tag>Revertida</Tag>),
    },
    {
      title: '',
      key: 'accion',
      render: (_, a) =>
        onRevertir && a.vigente ? (
          <Button size="small" danger onClick={() => onRevertir(a.id)}>
            Revertir
          </Button>
        ) : null,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {movimientos && movimientos.length > 0 ? (
        <Table
          aria-label="Historial de vacaciones"
          className="historial-vacaciones"
          size="small"
          bordered
          pagination={false}
          rowKey={(m, idx) => `${m.tipo}-${m.fecha}-${idx}`}
          columns={columnasMovimientos}
          dataSource={movimientos}
        />
      ) : (
        <Empty description="Sin movimientos registrados." />
      )}

      {asignaciones.length > 0 && (
        <Table
          aria-label="Asignaciones de vacaciones"
          className="asignaciones-vacaciones"
          size="small"
          bordered
          pagination={false}
          rowKey="id"
          columns={columnasAsignaciones}
          dataSource={asignaciones}
        />
      )}
    </Space>
  );
}
