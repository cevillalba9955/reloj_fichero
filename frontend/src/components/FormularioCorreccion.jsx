import { useState } from 'react';
import { Input, Button, Alert, Space } from 'antd';

// feature 010 (US2) — Corrección manual de entrada/salida con justificación
// OBLIGATORIA (FR-004): "Guardar" queda deshabilitado sin motivo. Componente de
// presentación: recibe `onGuardar` (async) del contenedor; no llama a la API.

export default function FormularioCorreccion({ fila, onGuardar, onCancelar }) {
  const [entrada, setEntrada] = useState(fila.entrada ?? '');
  const [salida, setSalida] = useState(fila.salida ?? '');
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
      await onGuardar({
        entrada: entrada.trim() === '' ? null : entrada.trim(),
        salida: salida.trim() === '' ? null : salida.trim(),
        motivo: motivo.trim(),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="formulario-correccion"
      onSubmit={guardar}
      aria-label={`Corregir horarios del legajo ${fila.legajo}`}
    >
      <h3>Corregir horarios — {fila.nombre ?? `legajo ${fila.legajo}`}</h3>
      <label>
        Entrada
        <Input
          placeholder="HH:MM"
          value={entrada}
          onChange={(ev) => setEntrada(ev.target.value)}
        />
      </label>
      <label>
        Salida
        <Input
          placeholder="HH:MM"
          value={salida}
          onChange={(ev) => setSalida(ev.target.value)}
        />
      </label>
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
