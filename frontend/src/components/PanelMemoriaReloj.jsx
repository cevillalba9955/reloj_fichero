import { useCallback, useEffect, useState } from 'react';
import { Button, Alert, Space, Popconfirm } from 'antd';

// issue #39 — Panel "Memoria del reloj": muestra cuántas fichadas hay en la
// memoria del reloj y permite limpiarla. Limpiar primero descarga y guarda las
// fichadas pendientes y recién después borra (el servidor lo garantiza), así
// que no se pierde ninguna. Solo visible para el rol Configurador (la pestaña
// vive en Configuración y la API además lo exige en el servidor).

export default function PanelMemoriaReloj({ cliente }) {
  const [cantidad, setCantidad] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [limpiando, setLimpiando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { fichadasEnMemoria } = await cliente.obtenerMemoriaReloj();
      setCantidad(fichadasEnMemoria);
    } catch (err) {
      setCantidad(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [cliente]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function limpiar() {
    setLimpiando(true);
    setError(null);
    setAviso(null);
    try {
      const { fichadasDescargadas, borrado } = await cliente.limpiarMemoriaReloj();
      setAviso(
        borrado
          ? `Memoria limpiada: ${fichadasDescargadas} fichada(s) guardadas y borradas del reloj.`
          : 'La memoria del reloj ya estaba vacía.',
      );
      await cargar();
    } catch (err) {
      setError(`No se pudo limpiar la memoria: ${err.message}`);
    } finally {
      setLimpiando(false);
    }
  }

  return (
    <div className="panel-memoria-reloj">
      <p role="status">
        {cargando
          ? 'Consultando el reloj…'
          : cantidad == null
            ? 'Fichadas en memoria: no disponible'
            : `Fichadas en memoria: ${cantidad}`}
      </p>
      <Space>
        <Button onClick={cargar} disabled={cargando || limpiando}>
          Actualizar
        </Button>
        <Popconfirm
          title="¿Limpiar la memoria del reloj?"
          description="Se guardan las fichadas pendientes y luego se borran del reloj. No se puede deshacer."
          okText="Limpiar"
          cancelText="Cancelar"
          onConfirm={limpiar}
        >
          <Button danger loading={limpiando} disabled={cargando}>
            Limpiar memoria del reloj
          </Button>
        </Popconfirm>
      </Space>
      {aviso && <Alert type="success" showIcon message={aviso} role="status" style={{ marginTop: 16 }} />}
      {error && <Alert type="error" showIcon message={error} role="alert" style={{ marginTop: 16 }} />}
    </div>
  );
}
