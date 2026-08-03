import { useState } from 'react';
import { Button, Alert, Typography } from 'antd';

// fix vacaciones — Sección "Padrón" de la página Configuración: fuerza
// manualmente la sincronización del padrón (legajo/categoría/nombre/fecha de
// ingreso) desde Oracle, para los casos en que no alcanza con el intento
// automático al iniciar un período (Oracle caído en ese momento, o se corrige
// la config recién después). Componente de presentación puro: el único
// acceso a datos es `cliente` (Principio I).

export default function PanelPadron({ cliente }) {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  async function sincronizar() {
    setSincronizando(true);
    setResultado(null);
    setError(null);
    try {
      const datos = await cliente.sincronizarPadron();
      setResultado(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <div className="panel-padron">
      <Typography.Paragraph>
        Sincroniza el padrón (legajo, categoría, nombre y fecha de ingreso) contra Oracle
        para el período en curso. Se intenta automáticamente al generar el calendario de un
        período nuevo; usá este botón si necesitás forzarlo (por ejemplo, Oracle no
        estaba disponible en ese momento, o se corrigió la configuración recién después).
      </Typography.Paragraph>

      <Button type="primary" onClick={sincronizar} loading={sincronizando}>
        Sincronizar padrón
      </Button>

      {resultado && (
        <Alert
          type="success"
          showIcon
          role="status"
          className="panel-padron-resultado"
          message={`Padrón sincronizado (período ${resultado.periodo}): ${resultado.empleados.length} legajo(s).`}
          style={{ marginTop: 16 }}
        />
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={`No se pudo sincronizar: ${error}`}
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
}
