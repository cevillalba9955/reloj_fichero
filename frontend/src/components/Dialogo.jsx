import { Modal } from 'antd';

// feature 010, iteración 2 (FR-018, research.md §8) — Diálogo modal
// reutilizable sobre antd Modal. Misma API externa que la versión anterior
// (etiqueta, onCerrar, children) para que los formularios que lo consumen no
// necesiten cambiar. Escape y click fuera del contenido equivalen a Cancelar
// (`onCerrar`, sin efecto alguno) — comportamiento por defecto de antd Modal
// (`keyboard`/`maskClosable`), mantenido explícito por claridad.

export default function Dialogo({ etiqueta, onCerrar, ancho, children }) {
  return (
    <Modal
      className="dialogo"
      wrapClassName="dialogo-backdrop"
      open
      title={etiqueta}
      onCancel={onCerrar}
      footer={null}
      keyboard
      mask={{ closable: true }}
      destroyOnHidden
      // feature 018 — `ancho` opcional (número px o string CSS) para diálogos
      // con contenido tabular ancho, como el informe de cierre. Sin `ancho`,
      // el Modal usa el ancho por defecto de antd.
      width={ancho}
    >
      {children}
    </Modal>
  );
}
