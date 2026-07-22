import { useCallback, useEffect, useState } from 'react';
import { Table, Tag, Switch, Button, Space, Alert, Form, Input, Select } from 'antd';
import Dialogo from './Dialogo.jsx';

// feature 014 (US2) — Catálogo de motivos de ausencia: listado completo
// (incluye inactivos), alta, edición de etiqueta/tipoPago, y activar/
// desactivar (nunca borrado, FR-009). El `id` es inmutable una vez creado
// (FR-010): no se edita en el diálogo de edición.

function FormularioMotivo({ motivo, onGuardar, onCancelar }) {
  const [form] = Form.useForm();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const esAlta = !motivo;

  async function guardar(valores) {
    setEnviando(true);
    setError(null);
    try {
      await onGuardar(valores);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={guardar}
      initialValues={motivo ?? { tipoPago: 'No paga', activo: true }}
    >
      {esAlta && (
        <Form.Item
          label="Identificador"
          name="id"
          rules={[{ required: true, message: 'El identificador es obligatorio' }]}
        >
          <Input placeholder="mudanza" />
        </Form.Item>
      )}
      <Form.Item
        label="Etiqueta"
        name="etiqueta"
        rules={[{ required: true, message: 'La etiqueta es obligatoria' }]}
      >
        <Input placeholder="Mudanza" />
      </Form.Item>
      <Form.Item label="Tipo de pago" name="tipoPago" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'Paga', label: 'Paga' },
            { value: 'No paga', label: 'No paga' },
          ]}
        />
      </Form.Item>

      {error && <Alert type="error" showIcon role="alert" message={`No se pudo guardar: ${error}`} />}
      <Space>
        <Button type="primary" htmlType="submit" loading={enviando}>
          Guardar
        </Button>
        <Button onClick={onCancelar}>Cancelar</Button>
      </Space>
    </Form>
  );
}

export default function TablaMotivosAusencia({ cliente }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [dialogo, setDialogo] = useState(null); // null | { modo: 'alta' } | { modo: 'edicion', motivo }
  const [errorAccion, setErrorAccion] = useState(null);

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const { motivos } = await cliente.obtenerMotivos();
      setEstado({ tipo: 'con-datos', motivos });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alternarActivo(motivo) {
    setErrorAccion(null);
    try {
      await cliente.editarMotivo(motivo.id, { activo: !motivo.activo });
      await cargar();
    } catch (err) {
      setErrorAccion(err.message);
    }
  }

  async function guardarDesdeDialogo(valores) {
    if (dialogo.modo === 'alta') {
      await cliente.crearMotivo(valores);
    } else {
      await cliente.editarMotivo(dialogo.motivo.id, valores);
    }
    setDialogo(null);
    await cargar();
  }

  if (estado.tipo === 'cargando') {
    return (
      <p className="cargando" role="status">
        Cargando…
      </p>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <div className="error" role="alert">
        <p>Ocurrió un error: {estado.mensaje}</p>
        <Button onClick={cargar}>Reintentar</Button>
      </div>
    );
  }

  const columnas = [
    { title: 'Identificador', dataIndex: 'id' },
    { title: 'Etiqueta', dataIndex: 'etiqueta' },
    {
      title: 'Tipo de pago',
      dataIndex: 'tipoPago',
      render: (v) => <Tag color={v === 'Paga' ? 'green' : 'default'}>{v}</Tag>,
    },
    {
      title: 'Activo',
      dataIndex: 'activo',
      render: (activo, motivo) => (
        <Switch checked={activo} onChange={() => alternarActivo(motivo)} aria-label={`Activo: ${motivo.etiqueta}`} />
      ),
    },
    {
      title: 'Acciones',
      render: (_, motivo) => (
        <Button size="small" onClick={() => setDialogo({ modo: 'edicion', motivo })}>
          Editar
        </Button>
      ),
    },
  ];

  return (
    <section className="tabla-motivos-ausencia">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setDialogo({ modo: 'alta' })}>
          Agregar motivo
        </Button>
      </Space>

      {errorAccion && <Alert type="error" showIcon role="alert" message={errorAccion} style={{ marginBottom: 16 }} />}

      <Table
        rowKey="id"
        columns={columnas}
        dataSource={estado.motivos}
        pagination={false}
      />

      {dialogo && (
        <Dialogo
          etiqueta={dialogo.modo === 'alta' ? 'Agregar motivo' : `Editar motivo — ${dialogo.motivo.etiqueta}`}
          onCerrar={() => setDialogo(null)}
        >
          <FormularioMotivo
            motivo={dialogo.modo === 'edicion' ? dialogo.motivo : null}
            onGuardar={guardarDesdeDialogo}
            onCancelar={() => setDialogo(null)}
          />
        </Dialogo>
      )}
    </section>
  );
}
