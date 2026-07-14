// feature 007 — Diálogo de confirmación explícita de una reclasificación (US3,
// FR-016). Hasta que el usuario confirma, no se dispara ningún POST. Cancelar no
// produce efecto alguno.

export default function DialogoConfirmarReclasificar({ dia, clasificacion, onConfirmar, onCancelar }) {
  if (!dia) return null;
  return (
    <div className="dialogo-backdrop">
      <div className="dialogo" role="dialog" aria-modal="true" aria-label="Confirmar reclasificación">
        <p className="dialogo-mensaje">
          ¿Reclasificar el día <strong>{dia.fecha}</strong> como <strong>{clasificacion}</strong>?
        </p>
        <div className="dialogo-acciones">
          <button type="button" className="btn-cancelar" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="btn-confirmar" onClick={onConfirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
