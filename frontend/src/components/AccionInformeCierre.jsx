import { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Button, Space } from 'antd';
import { RolContext } from '../contexto/RolContext.jsx';
import { crearClienteInformeCierre } from '../api/informe-cierre-client.js';
import InformeCierrePrintable from './InformeCierrePrintable.jsx';

// 018-informe-cierre-periodo — Acción "Emitir / ver informe de cierre" para la
// página "Resumen del Período". Sólo tiene sentido sobre un período CERRADO
// (FR-002): si el período está abierto, el botón de emitir queda deshabilitado.
// Al montar consulta la copia guardada (si existe) para poder ofrecer "Ver" y
// avisar cuando quedó desactualizada por una reapertura (FR-013).

const clientePorDefecto = crearClienteInformeCierre();

export default function AccionInformeCierre({ periodo, cerrado = false, cliente = clientePorDefecto }) {
  const rol = useContext(RolContext);
  const puedeEmitir = rol?.puede ? rol.puede('editor') : true;

  const [guardado, setGuardado] = useState(null); // VistaInformeCierre | null
  const [error, setError] = useState(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const traerGuardado = useCallback(async () => {
    if (!periodo) return;
    try {
      setGuardado(await cliente.obtener(periodo));
      setError(null);
    } catch (err) {
      // 404 INFORME_NO_EMITIDO es esperable: todavía no se emitió.
      if (err.codigo !== 'INFORME_NO_EMITIDO') setError(err.message);
      setGuardado(null);
    }
  }, [cliente, periodo]);

  useEffect(() => {
    traerGuardado();
  }, [traerGuardado]);

  async function emitir() {
    setEmitiendo(true);
    setError(null);
    try {
      const vista = await cliente.emitir(periodo);
      setGuardado(vista);
      setAbierto(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setEmitiendo(false);
    }
  }

  return (
    <div className="accion-informe-cierre">
      <Space wrap>
        <Button
          type="primary"
          loading={emitiendo}
          disabled={!cerrado || !puedeEmitir}
          onClick={emitir}
        >
          Emitir informe de cierre
        </Button>
        {guardado && (
          <Button onClick={() => setAbierto(true)}>Ver informe emitido</Button>
        )}
      </Space>

      {!cerrado && (
        <p className="accion-informe-nota">
          El informe de cierre se emite una vez que el período está cerrado.
        </p>
      )}

      {guardado?.obsoleto && (
        <Alert
          type="warning"
          showIcon
          role="alert"
          message="El período fue reabierto: el informe emitido quedó desactualizado, volvé a emitirlo."
        />
      )}

      {error && <Alert type="error" showIcon role="alert" message={`Ocurrió un error: ${error}`} />}

      {abierto && guardado && (
        <InformeCierrePrintable vista={guardado} onCerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}
