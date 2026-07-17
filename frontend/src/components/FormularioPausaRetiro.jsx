import { useState } from 'react';

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
        <label>
          <input
            type="radio"
            name="modo"
            value="pausa"
            checked={modo === 'pausa'}
            onChange={() => setModo('pausa')}
          />
          Pausa intermedia
        </label>
        <label>
          <input
            type="radio"
            name="modo"
            value="retiro"
            checked={modo === 'retiro'}
            onChange={() => setModo('retiro')}
          />
          Retiro anticipado
        </label>
      </fieldset>

      {modo === 'pausa' ? (
        <>
          <label>
            Desde
            <input
              type="text"
              placeholder="HH:MM"
              value={desde}
              onChange={(ev) => setDesde(ev.target.value)}
            />
          </label>
          <label>
            Hasta
            <input
              type="text"
              placeholder="HH:MM"
              value={hasta}
              onChange={(ev) => setHasta(ev.target.value)}
            />
          </label>
        </>
      ) : (
        <label>
          Hora del retiro
          <input
            type="text"
            placeholder="HH:MM"
            value={hora}
            onChange={(ev) => setHora(ev.target.value)}
          />
        </label>
      )}

      <label>
        Motivo (obligatorio)
        <textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} />
      </label>

      {error && (
        <p className="error" role="alert">
          No se pudo guardar: {error}
        </p>
      )}
      <div className="acciones">
        <button type="submit" disabled={!puedeGuardar}>
          Guardar
        </button>
        <button type="button" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
