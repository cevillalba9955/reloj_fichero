import { useEffect, useState } from 'react';

// feature 012 (US1) — Registra el motivo de una ausencia para un día o un
// rango de días, con motivo OBLIGATORIO elegido de una lista cerrada (FR-003,
// mismo criterio que FormularioCorreccion.jsx: "Guardar" deshabilitado sin
// motivo). `fila` es opcional: si viene (clic en una fila "Sin fichadas"/
// "Ausente"), precarga legajo y fecha; si no, el responsable los completa a
// mano (por ejemplo, para justificar una licencia futura que todavía no
// aparece en ninguna tabla). Componente de presentación: recibe `onGuardar`
// (async) y `motivos` ya cargados del contenedor; no llama a la API.

export default function FormularioJustificacion({ fila = null, motivos = [], onGuardar, onCancelar }) {
  const [legajo, setLegajo] = useState(fila?.legajo != null ? String(fila.legajo) : '');
  const [fecha, setFecha] = useState(fila?.fecha ?? '');
  const [hasta, setHasta] = useState('');
  const [motivoId, setMotivoId] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    setLegajo(fila?.legajo != null ? String(fila.legajo) : '');
    setFecha(fila?.fecha ?? '');
  }, [fila]);

  const legajoValido = /^\d+$/.test(legajo.trim());
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim());
  const puedeGuardar = legajoValido && fechaValida && motivoId !== '' && !enviando;

  async function guardar(ev) {
    ev.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await onGuardar({
        legajo: Number(legajo),
        fecha: fecha.trim(),
        hasta: hasta.trim() === '' ? null : hasta.trim(),
        motivoId,
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
      className="formulario-justificacion"
      onSubmit={guardar}
      aria-label={fila ? `Justificar ausencia del legajo ${fila.legajo}` : 'Justificar ausencia'}
    >
      <h3>Justificación de ausencia{fila?.nombre ? ` — ${fila.nombre}` : ''}</h3>
      {!fila && (
        <label>
          Legajo
          <input
            type="text"
            inputMode="numeric"
            value={legajo}
            onChange={(ev) => setLegajo(ev.target.value)}
          />
        </label>
      )}
      <label>
        Fecha{!fila && ' (o desde, para un rango)'}
        <input
          type="date"
          value={fecha}
          onChange={(ev) => setFecha(ev.target.value)}
          readOnly={Boolean(fila)}
        />
      </label>
      <label>
        Hasta (opcional, para varios días)
        <input type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
      </label>
      <label>
        Motivo (obligatorio)
        <select value={motivoId} onChange={(ev) => setMotivoId(ev.target.value)}>
          <option value="">Seleccioná un motivo…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.etiqueta} ({m.tipoPago})
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          No se pudo guardar: {error}
        </p>
      )}
      {resultado && (
        <p className="resultado-justificacion" role="status">
          {resultado.registradas.length} día(s) justificado(s)
          {resultado.omitidas?.length > 0 && `, ${resultado.omitidas.length} omitido(s) (no laborables)`}
          {resultado.noAplicables?.length > 0 && `, ${resultado.noAplicables.length} no aplicable(s)`}.
        </p>
      )}
      <div className="acciones">
        <button type="submit" disabled={!puedeGuardar}>
          Guardar
        </button>
        <button type="button" onClick={onCancelar}>
          {resultado ? 'Cerrar' : 'Cancelar'}
        </button>
      </div>
    </form>
  );
}
