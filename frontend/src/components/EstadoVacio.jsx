import { Empty, Button, Typography } from 'antd';

// feature 007/008 — Estado vacío. Se usa cuando no hay ningún calendario
// generado o cuando el mes navegado no tiene calendario. No ofrece reclasificar
// (FR-018). La generación (feature 008) solo se ofrece si el período es
// generable según la frontera que entrega el backend; la UI no decide la regla
// de contigüidad, solo consulta `generables` por pertenencia.

export default function EstadoVacio({ mensaje, periodo = null, generables = [], onGenerar = null }) {
  const lista = Array.isArray(generables) ? generables : [];
  const esGenerable = periodo != null && lista.includes(periodo);
  const hayFrontera = lista.length > 0;

  return (
    <div className="estado-vacio" role="status">
      <Empty description={mensaje}>
        {esGenerable && onGenerar && (
          <Button type="primary" onClick={onGenerar}>
            Generar calendario
          </Button>
        )}

        {periodo != null && !esGenerable && hayFrontera && (
          <Typography.Paragraph className="estado-vacio-hint" type="secondary">
            Para no dejar huecos, primero generá: {lista.join(' o ')}.
          </Typography.Paragraph>
        )}
      </Empty>
    </div>
  );
}
