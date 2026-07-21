import { Typography, Tag } from 'antd';

// feature 007 — Encabezado del período de liquidación activo (US2, FR-008/010).
// Muestra la etiqueta y el rango de fechas; si no hay período activo, lo indica
// explícitamente y la grilla se muestra igual.

export default function EncabezadoPeriodo({ periodoActivo }) {
  if (!periodoActivo) {
    return (
      <div className="periodo-activo sin-periodo" role="status">
        <Tag>Sin período activo</Tag>
      </div>
    );
  }
  return (
    <div className="periodo-activo" role="status">
      <Typography.Text strong className="periodo-etiqueta">
        {periodoActivo.etiqueta}
      </Typography.Text>{' '}
      <Typography.Text className="periodo-rango" type="secondary">
        {periodoActivo.desde} – {periodoActivo.hasta}
      </Typography.Text>
    </div>
  );
}
