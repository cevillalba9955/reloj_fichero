import { useEffect, useState } from 'react';
import { Input, Button, Alert, Space } from 'antd';

// spec 015 (US1) — Asigna un período de vacaciones (fecha de inicio +
// cantidad de días corridos) a un legajo. `fila` es opcional: si viene
// (fila de TablaVacaciones), precarga el legajo; si no, se completa a mano.
// Mismo patrón que FormularioJustificacion.jsx: "Guardar" deshabilitado sin
// fecha de inicio ni cantidad de días válida (FR-003); componente de
// presentación, no llama a la API directamente.

export default function FormularioAsignarVacaciones({ fila = null, onGuardar, onCancelar }) {
  const [legajo, setLegajo] = useState(fila?.legajo != null ? String(fila.legajo) : '');
  const [fechaInicio, setFechaInicio] = useState('');
  const [cantidadDias, setCantidadDias] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    setLegajo(fila?.legajo != null ? String(fila.legajo) : '');
  }, [fila]);

  const legajoValido = /^\d+$/.test(legajo.trim());
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio.trim());
  const cantidadValida = /^\d+$/.test(String(cantidadDias).trim()) && Number(cantidadDias) > 0;
  const puedeGuardar = legajoValido && fechaValida && cantidadValida && !enviando;

  async function guardar(ev) {
    ev.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await onGuardar({
        legajo: Number(legajo),
        fechaInicio: fechaInicio.trim(),
        cantidadDias: Number(cantidadDias),
      });
      setResultado(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="formulario-asignar-vacaciones"
      onSubmit={guardar}
      aria-label={fila ? `Asignar vacaciones al legajo ${fila.legajo}` : 'Asignar vacaciones'}
    >
      <h3>Asignar vacaciones{fila?.nombre ? ` — ${fila.nombre}` : ''}</h3>
      {!fila && (
        <label>
          Legajo
          <Input inputMode="numeric" value={legajo} onChange={(ev) => setLegajo(ev.target.value)} />
        </label>
      )}
      <label>
        Fecha de inicio
        <Input type="date" value={fechaInicio} onChange={(ev) => setFechaInicio(ev.target.value)} />
      </label>
      <label>
        Cantidad de días (corridos)
        <Input
          type="number"
          min={1}
          value={cantidadDias}
          onChange={(ev) => setCantidadDias(ev.target.value)}
        />
      </label>
      {error && <Alert type="error" showIcon role="alert" message={`No se pudo asignar: ${error}`} />}
      {resultado && (
        <Alert
          type="success"
          showIcon
          role="status"
          message={`Asignado del ${resultado.fechaInicio} al ${resultado.fechaFin} (${resultado.cantidadDias} días). Saldo resultante: ${resultado.saldoResultante}.`}
        />
      )}
      <Space className="acciones">
        <Button type="primary" htmlType="submit" disabled={!puedeGuardar}>
          Guardar
        </Button>
        <Button onClick={onCancelar}>{resultado ? 'Cerrar' : 'Cancelar'}</Button>
      </Space>
    </form>
  );
}
