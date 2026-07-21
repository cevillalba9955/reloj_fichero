import { useState } from 'react';
import { Input, Radio, Button, Alert, Space } from 'antd';

// feature 010 (US3) — Alta de pausa intermedia o retiro anticipado, ambos con
// motivo OBLIGATORIO (FR-004): "Guardar" queda deshabilitado sin motivo.
// Componente de presentación: delega el guardado en el contenedor vía
// `onGuardar({ modo, desde, hasta, hora, motivo })`; no llama a la API.

export default function FormularioPausaRetiro({ fila, onGuardar, onCancelar }) {
  const [modo, setModo] = useState('pausa'); // 'pausa' | 'retiro'
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [hora, setHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const puedeGuardar = motivo.trim().length > 0 && !enviando;

  async function guardar(ev) {
    ev.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    setEnviando(true);
    try {
      await onGuardar(
        modo === 'pausa'
          ? { modo, desde: desde.trim(), hasta: hasta.trim(), motivo: motivo.trim() }
          : { modo, hora: hora.trim(), motivo: motivo.trim() },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="formulario-pausa-retiro"
      onSubmit={guardar}
      aria-label={`Pausa o retiro anticipado del legajo ${fila.legajo}`}
    >
      <h3>Pausa / Retiro anticipado — {fila.nombre ?? `legajo ${fila.legajo}`}</h3>

      <fieldset>
        <legend>Tipo de registro</legend>
        <Radio.Group value={modo} onChange={(ev) => setModo(ev.target.value)}>
          <Radio value="pausa">Pausa intermedia</Radio>
          <Radio value="retiro">Retiro anticipado</Radio>
        </Radio.Group>
      </fieldset>

      {modo === 'pausa' ? (
        <>
          <label>
            Desde
            <Input placeholder="HH:MM" value={desde} onChange={(ev) => setDesde(ev.target.value)} />
          </label>
          <label>
            Hasta
            <Input placeholder="HH:MM" value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
          </label>
        </>
      ) : (
        <label>
          Hora del retiro
          <Input placeholder="HH:MM" value={hora} onChange={(ev) => setHora(ev.target.value)} />
        </label>
      )}

      <label>
        Motivo (obligatorio)
        <Input.TextArea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
      </label>

      {error && <Alert type="error" showIcon role="alert" message={`No se pudo guardar: ${error}`} />}
      <Space className="acciones">
        <Button type="primary" htmlType="submit" disabled={!puedeGuardar}>
          Guardar
        </Button>
        <Button onClick={onCancelar}>Cancelar</Button>
      </Space>
    </form>
  );
}
