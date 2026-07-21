import { useState } from 'react';
import { Tag, Button, Modal, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { ESTADOS_CALENDARIO } from '../theme/estados.js';

// feature 007 — Celda de un día en la grilla (US1/US2/US3). Muestra la
// clasificación con color + un 2º recurso perceptible (etiqueta textual +
// aria-label), FR-003/004. Resalta hábiles/feriados (FR-005), marca hoy por
// forma (FR-007) y distingue la pertenencia al período activo (FR-009).
//
// Reclasificar (US3): un ícono de engranaje arriba a la derecha abre un modal
// para elegir la nueva clasificación; el padre solo pasa `onReclasificar`
// cuando el período está abierto (si el período está cerrado, no se pasa y el
// ícono no se renderiza — ver PaginaCalendario.jsx).

const ETIQUETA = {
  Laborable: 'Hábil',
  'No Laborable': 'No laborable',
  Feriado: 'Feriado',
};

const OPCIONES = ['Laborable', 'No Laborable', 'Feriado'];

export default function CeldaDia({ dia, onReclasificar }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const etiqueta = ETIQUETA[dia.clasificacion] ?? dia.clasificacion;
  const clases = ['celda', `resaltado-${dia.resaltado}`];
  if (dia.esHoy) clases.push('es-hoy');
  if (dia.enPeriodoActivo) clases.push('en-periodo');

  const aria =
    `Día ${dia.dd}, ${etiqueta}` +
    (dia.esHoy ? ', hoy' : '') +
    (dia.enPeriodoActivo ? ', en período activo' : '');

  const opciones = OPCIONES.filter((op) => op !== dia.clasificacion);

  function elegir(opcion) {
    setModalAbierto(false);
    onReclasificar(dia, opcion);
  }

  return (
    <div
      className={clases.join(' ')}
      role="gridcell"
      aria-label={aria}
      data-fecha={dia.fecha}
      data-clasificacion={dia.clasificacion}
      data-resaltado={dia.resaltado}
      data-es-hoy={dia.esHoy ? 'true' : 'false'}
      data-en-periodo={dia.enPeriodoActivo ? 'true' : 'false'}
    >
      <span className="dia-numero">{dia.dd}</span>
      <Tag className="dia-clasificacion" color={ESTADOS_CALENDARIO[dia.resaltado]?.color}>
        {etiqueta}
      </Tag>
      {dia.esHoy && (
        <span className="marca-hoy" aria-hidden="true" title="Hoy">
          
        </span>
      )}
      {onReclasificar && (
        <>
          <Button
            className="reclasificar-boton"
            type="text"
            size="small"
            icon={<SettingOutlined />}
            aria-label={`Reclasificar ${dia.fecha}`}
            onClick={() => setModalAbierto(true)}
          />
          <Modal
            title={`Reclasificar ${dia.fecha}`}
            open={modalAbierto}
            onCancel={() => setModalAbierto(false)}
            footer={null}
            destroyOnHidden
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {opciones.map((op) => (
                <Button key={op} block onClick={() => elegir(op)}>
                  {ETIQUETA[op] ?? op}
                </Button>
              ))}
            </Space>
          </Modal>
        </>
      )}
    </div>
  );
}
