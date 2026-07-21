import { Modal, Button, Space } from 'antd';

// feature 007 — Diálogo de confirmación explícita de una reclasificación (US3,
// FR-016). Hasta que el usuario confirma, no se dispara ningún POST. Cancelar no
// produce efecto alguno.

export default function DialogoConfirmarReclasificar({ dia, clasificacion, onConfirmar, onCancelar }) {
  if (!dia) return null;
  return (
    <Modal
      className="dialogo"
      wrapClassName="dialogo-backdrop"
      open
      title="Confirmar reclasificación"
      onCancel={onCancelar}
      footer={null}
      keyboard
      mask={{ closable: true }}
      destroyOnHidden
    >
      <p className="dialogo-mensaje">
        ¿Reclasificar el día <strong>{dia.fecha}</strong> como <strong>{clasificacion}</strong>?
      </p>
      <Space className="dialogo-acciones" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button className="btn-cancelar" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button className="btn-confirmar" type="primary" onClick={onConfirmar}>
          Confirmar
        </Button>
      </Space>
    </Modal>
  );
}
