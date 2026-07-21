import { useState } from 'react';
import { Button, Alert, Space } from 'antd';

// feature 010 (US4) — Botón "Consultar reloj": dispara la consulta manual de
// fichadas nuevas, se deshabilita mientras está en curso (además del
// single-flight real, que vive en el proceso de fichadas) y muestra el error
// sin perder la tabla ya cargada (FR-010). `onConsultar` (async) la provee el
// contenedor; el resultado exitoso refresca la vista desde allí.

export default function BotonConsultarReloj({ onConsultar }) {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function consultar() {
    setEnCurso(true);
    setError(null);
    setAviso(null);
    try {
      const { resultado, fichadasNuevas } = await onConsultar();
      setAviso(
        resultado === 'omitido'
          ? 'Ya había una consulta en curso; probá de nuevo en unos segundos.'
          : `Consulta completada: ${fichadasNuevas} fichada(s) nueva(s).`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <Space className="consultar-reloj">
      <Button onClick={consultar} disabled={enCurso} loading={enCurso}>
        {enCurso ? 'Consultando…' : 'Consultar reloj'}
      </Button>
      {aviso && (
        <Alert type="success" showIcon message={aviso} role="status" />
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message={`No se pudo consultar el reloj: ${error}`}
          role="alert"
        />
      )}
    </Space>
  );
}
