import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { crearClienteInformeCierre } from '../api/informe-cierre-client.js';
import InformeCierrePrintable from './InformeCierrePrintable.jsx';
import InformeCierreContenido, { descargarInformePdf } from './InformeCierreContenido.jsx';

// 018-informe-cierre-periodo — Acciones del informe de cierre en la página
// "Resumen del Período". Por ahora el informe se genera SOLO automáticamente al
// cerrar el período (no hay botón "Emitir"); acá se puede verlo en pantalla y
// descargarlo como PDF. Si el período está abierto no se muestra ninguna
// acción, sólo una nota. Al montar se consulta la copia guardada (FR-013:
// avisa si quedó desactualizada por una reapertura).

const clientePorDefecto = crearClienteInformeCierre();

export default function AccionInformeCierre({ periodo, cerrado = false, mensual = false, cliente = clientePorDefecto }) {
  const [guardado, setGuardado] = useState(null); // VistaInformeCierre | null
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const contenidoRef = useRef(null);

  const traerGuardado = useCallback(async () => {
    if (!periodo) return;
    try {
      // 021-informe-asistencia-mensual — `mensual` pide el tramo `Mes`
      // unificado (uso desde la página Calendario); sin la prop, el tramo del
      // período seleccionado (uso desde "Resumen del Período", feature 018).
      setGuardado(await (mensual ? cliente.obtenerMensual(periodo) : cliente.obtener(periodo)));
      setError(null);
    } catch (err) {
      // 404 INFORME_NO_EMITIDO es esperable: todavía no se generó.
      if (err.codigo !== 'INFORME_NO_EMITIDO') setError(err.message);
      setGuardado(null);
    }
  }, [cliente, periodo, mensual]);

  useEffect(() => {
    traerGuardado();
  }, [traerGuardado]);

  function descargarPdf() {
    descargarInformePdf(contenidoRef.current, guardado?.periodoId ?? guardado?.sello?.periodoId ?? periodo);
  }

  if (!cerrado) {
    return (
      <div className="accion-informe-cierre">
        <p className="accion-informe-nota">
          El informe de cierre se genera automáticamente al cerrar el período.
        </p>
      </div>
    );
  }

  return (
    <div className="accion-informe-cierre">
      {guardado ? (
        <>
          <Space wrap>
            <Button onClick={() => setAbierto(true)}>Ver informe</Button>
            <Button type="primary" onClick={descargarPdf}>
              Descargar PDF
            </Button>
          </Space>

          {guardado.obsoleto && (
            <Alert
              type="warning"
              showIcon
              role="alert"
              message="El período fue reabierto: el informe quedó desactualizado. Se regenera al volver a cerrar el período."
            />
          )}

          {/* Copia oculta del contenido: la usa "Descargar PDF" para imprimir
              sólo el informe en un iframe aislado, sin abrir el modal. */}
          <div hidden>
            <InformeCierreContenido ref={contenidoRef} vista={guardado} />
          </div>

          {abierto && <InformeCierrePrintable vista={guardado} onCerrar={() => setAbierto(false)} />}
        </>
      ) : (
        <p className="accion-informe-nota">
          El informe de cierre todavía no está disponible; se genera al cerrar el período.
        </p>
      )}

      {error && <Alert type="error" showIcon role="alert" message={`Ocurrió un error: ${error}`} />}
    </div>
  );
}
