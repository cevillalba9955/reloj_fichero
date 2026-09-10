import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { crearClienteInformeCierre } from '../api/informe-cierre-client.js';
import InformeCierrePrintable from './InformeCierrePrintable.jsx';
import InformeCierreContenido, { descargarInformePdf } from './InformeCierreContenido.jsx';

// 018-informe-cierre-periodo — Acciones del informe de cierre en la página
// "Resumen del Período". El informe se genera automáticamente al cerrar el
// período; acá se puede verlo en pantalla y descargarlo como PDF. Al montar se
// consulta la copia guardada (FR-013: avisa si quedó desactualizada por una
// reapertura).
//
// 022-informe-primera-quincena-anticipado — con la prop `anticipadoQ1Disponible`
// (el período mostrado es un tramo Q1 de un mes QUINCENAL abierto cuya primera
// quincena ya terminó), se ofrece además emitir MANUALMENTE el informe de la
// primera quincena antes del cierre del mes, y re-emitirlo a demanda. La copia
// anticipada se muestra con un aviso persistente de que el mes sigue abierto.

const clientePorDefecto = crearClienteInformeCierre();

export default function AccionInformeCierre({
  periodo,
  cerrado = false,
  mensual = false,
  anticipadoQ1Disponible = false,
  cliente = clientePorDefecto,
}) {
  const [guardado, setGuardado] = useState(null); // VistaInformeCierre | null
  const [error, setError] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const contenidoRef = useRef(null);

  const traerGuardado = useCallback(async () => {
    if (!periodo) return;
    try {
      // 021-informe-asistencia-mensual — `mensual` pide el tramo `Mes`
      // unificado (uso desde la página Calendario); sin la prop, el tramo del
      // período seleccionado (uso desde "Resumen del Período", features 018/022).
      setGuardado(await (mensual ? cliente.obtenerMensual(periodo) : cliente.obtener(periodo)));
      setError(null);
    } catch (err) {
      // 404 INFORME_NO_EMITIDO es esperable: todavía no se generó / emitió.
      if (err.codigo !== 'INFORME_NO_EMITIDO') setError(err.message);
      setGuardado(null);
    }
  }, [cliente, periodo, mensual]);

  useEffect(() => {
    traerGuardado();
  }, [traerGuardado]);

  // 022 — emisión / re-emisión manual del informe anticipado de la primera
  // quincena (POST ?tramo=Q1 sobre un período abierto; el backend valida la
  // ventana anticipada).
  async function emitirAnticipado() {
    setEmitiendo(true);
    try {
      setGuardado(await cliente.emitir(periodo));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setEmitiendo(false);
    }
  }

  function descargarPdf() {
    descargarInformePdf(contenidoRef.current, guardado?.periodoId ?? guardado?.sello?.periodoId ?? periodo);
  }

  // Vista compartida cuando hay una copia disponible: ver / descargar, más la
  // copia oculta que usa "Descargar PDF" y el modal "Ver informe".
  const verYDescargar = guardado && (
    <>
      <div hidden>
        <InformeCierreContenido ref={contenidoRef} vista={guardado} />
      </div>
      {abierto && <InformeCierrePrintable vista={guardado} onCerrar={() => setAbierto(false)} />}
    </>
  );

  // 022 — período abierto y el período mostrado habilita la emisión anticipada
  // de la primera quincena.
  if (!cerrado && anticipadoQ1Disponible) {
    return (
      <div className="accion-informe-cierre">
        <Alert
          type="info"
          showIcon
          message="Emisión anticipada: el mes sigue abierto; las cifras de la primera quincena pueden cambiar hasta el cierre."
        />
        {guardado ? (
          <>
            <Space wrap>
              <Button onClick={() => setAbierto(true)}>Ver informe</Button>
              <Button type="primary" onClick={descargarPdf}>
                Descargar PDF
              </Button>
              <Button onClick={emitirAnticipado} loading={emitiendo}>
                Re-emitir
              </Button>
            </Space>
            {verYDescargar}
          </>
        ) : (
          <Button type="primary" onClick={emitirAnticipado} loading={emitiendo}>
            Emitir informe de la primera quincena
          </Button>
        )}
        {error && <Alert type="error" showIcon role="alert" message={`Ocurrió un error: ${error}`} />}
      </div>
    );
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
