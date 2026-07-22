import { useCallback, useEffect, useState } from 'react';
import { Table, Button, Space, Alert, Form, Input, Select, TimePicker, InputNumber, Checkbox, Popconfirm } from 'antd';
import dayjs from 'dayjs';
import Dialogo from './Dialogo.jsx';

// feature 014 (US3) — Categorías, modalidades horarias y esquema semanal
// (`config/categorias.json`). Tres secciones independientes: el esquema
// semanal compartido, el catálogo de modalidades (alta/edición/baja
// bloqueada si está en uso, FR-012) y el catálogo de categorías (alta y
// reasignación de modalidad; nunca eliminación, FR-012a; código inmutable,
// FR-012b).

const DIAS = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
  { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
];

const FORMATO_HORA = 'HH:mm';

function aDayjs(hora) {
  return hora ? dayjs(hora, FORMATO_HORA) : null;
}

function FormularioModalidad({ nombre, modalidad, onGuardar, onCancelar }) {
  const [form] = Form.useForm();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const esAlta = !modalidad;

  async function guardar(valores) {
    setEnviando(true);
    setError(null);
    try {
      await onGuardar({
        ...(esAlta ? { nombre: valores.nombre } : {}),
        tipo: valores.tipo,
        aperturaOficial: valores.aperturaOficial.format(FORMATO_HORA),
        cierreOficial: valores.cierreOficial.format(FORMATO_HORA),
        margenAperturaMin: valores.margenAperturaMin,
        margenCierreMin: valores.margenCierreMin,
        ventanaApertura: [valores.ventanaAperturaInicio.format(FORMATO_HORA), valores.ventanaAperturaFin.format(FORMATO_HORA)],
        ventanaCierre: [valores.ventanaCierreInicio.format(FORMATO_HORA), valores.ventanaCierreFin.format(FORMATO_HORA)],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const iniciales = modalidad
    ? {
        tipo: modalidad.tipo,
        aperturaOficial: aDayjs(modalidad.aperturaOficial),
        cierreOficial: aDayjs(modalidad.cierreOficial),
        margenAperturaMin: modalidad.margenAperturaMin,
        margenCierreMin: modalidad.margenCierreMin,
        ventanaAperturaInicio: aDayjs(modalidad.ventanaApertura?.[0]),
        ventanaAperturaFin: aDayjs(modalidad.ventanaApertura?.[1]),
        ventanaCierreInicio: aDayjs(modalidad.ventanaCierre?.[0]),
        ventanaCierreFin: aDayjs(modalidad.ventanaCierre?.[1]),
      }
    : { tipo: 'Mensual', margenAperturaMin: 30, margenCierreMin: 30 };

  return (
    <Form form={form} layout="vertical" onFinish={guardar} initialValues={iniciales}>
      {esAlta && (
        <Form.Item label="Nombre" name="nombre" rules={[{ required: true, message: 'El nombre es obligatorio' }]}>
          <Input placeholder="quincenal_operarios" />
        </Form.Item>
      )}
      <Form.Item label="Tipo" name="tipo" rules={[{ required: true }]}>
        <Select options={[{ value: 'Mensual', label: 'Mensual' }, { value: 'Quincenal', label: 'Quincenal' }]} />
      </Form.Item>
      <Space>
        <Form.Item label="Apertura oficial" name="aperturaOficial" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
        <Form.Item label="Cierre oficial" name="cierreOficial" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
      </Space>
      <Space>
        <Form.Item label="Margen apertura (min)" name="margenAperturaMin" rules={[{ required: true }]}>
          <InputNumber min={0} />
        </Form.Item>
        <Form.Item label="Margen cierre (min)" name="margenCierreMin" rules={[{ required: true }]}>
          <InputNumber min={0} />
        </Form.Item>
      </Space>
      <Space>
        <Form.Item label="Ventana apertura desde" name="ventanaAperturaInicio" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
        <Form.Item label="hasta" name="ventanaAperturaFin" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
      </Space>
      <Space>
        <Form.Item label="Ventana cierre desde" name="ventanaCierreInicio" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
        <Form.Item label="hasta" name="ventanaCierreFin" rules={[{ required: true }]}>
          <TimePicker format={FORMATO_HORA} />
        </Form.Item>
      </Space>

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

function FormularioCategoria({ codigo, modalidadActual, opcionesModalidad, onGuardar, onCancelar }) {
  const [form] = Form.useForm();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const esAlta = !codigo;

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
    <Form form={form} layout="vertical" onFinish={guardar} initialValues={{ modalidad: modalidadActual }}>
      {esAlta && (
        <Form.Item label="Código" name="codigo" rules={[{ required: true, message: 'El código es obligatorio' }]}>
          <Input placeholder="PROD" />
        </Form.Item>
      )}
      <Form.Item label="Modalidad" name="modalidad" rules={[{ required: true }]}>
        <Select options={opcionesModalidad} />
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

export default function FormularioCategoriasModalidades({ cliente }) {
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [diasSeleccionados, setDiasSeleccionados] = useState([]);
  const [dialogoModalidad, setDialogoModalidad] = useState(null); // null | { modo, nombre?, modalidad? }
  const [dialogoCategoria, setDialogoCategoria] = useState(null); // null | { modo, codigo?, modalidad? }
  const [errorAccion, setErrorAccion] = useState(null);
  const [avisoEsquema, setAvisoEsquema] = useState(null);
  const [guardandoEsquema, setGuardandoEsquema] = useState(false);

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const datos = await cliente.obtenerCategorias();
      setDiasSeleccionados(datos.esquemaSemanal);
      setEstado({ tipo: 'con-datos', datos });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarEsquema() {
    setGuardandoEsquema(true);
    setAvisoEsquema(null);
    try {
      await cliente.guardarEsquemaSemanal(diasSeleccionados);
      setAvisoEsquema({ tipo: 'success', mensaje: 'Esquema semanal guardado.' });
      await cargar();
    } catch (err) {
      setAvisoEsquema({ tipo: 'error', mensaje: err.message });
    } finally {
      setGuardandoEsquema(false);
    }
  }

  async function eliminarModalidad(nombre) {
    setErrorAccion(null);
    try {
      await cliente.eliminarModalidad(nombre);
      await cargar();
    } catch (err) {
      setErrorAccion(err.message);
    }
  }

  async function guardarModalidadDesdeDialogo(valores) {
    if (dialogoModalidad.modo === 'alta') {
      await cliente.crearModalidad(valores);
    } else {
      await cliente.editarModalidad(dialogoModalidad.nombre, valores);
    }
    setDialogoModalidad(null);
    await cargar();
  }

  async function guardarCategoriaDesdeDialogo(valores) {
    if (dialogoCategoria.modo === 'alta') {
      await cliente.crearCategoria(valores);
    } else {
      await cliente.editarCategoria(dialogoCategoria.codigo, { modalidad: valores.modalidad });
    }
    setDialogoCategoria(null);
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

  const { datos } = estado;
  const modalidades = Object.entries(datos.modalidades).map(([nombre, m]) => ({ nombre, ...m }));
  const categorias = Object.entries(datos.categorias).map(([codigo, c]) => ({ codigo, ...c }));
  const opcionesModalidad = modalidades.map((m) => ({ value: m.nombre, label: m.nombre }));

  return (
    <section className="formulario-categorias-modalidades">
      <h3>Esquema semanal</h3>
      <Checkbox.Group options={DIAS} value={diasSeleccionados} onChange={setDiasSeleccionados} />
      <div style={{ margin: '8px 0 24px' }}>
        <Button onClick={guardarEsquema} loading={guardandoEsquema}>
          Guardar esquema semanal
        </Button>
        {avisoEsquema && (
          <Alert
            type={avisoEsquema.tipo}
            showIcon
            message={avisoEsquema.mensaje}
            role={avisoEsquema.tipo === 'error' ? 'alert' : 'status'}
            style={{ marginTop: 8 }}
          />
        )}
      </div>

      <h3>Modalidades horarias</h3>
      {errorAccion && <Alert type="error" showIcon role="alert" message={errorAccion} style={{ marginBottom: 16 }} />}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setDialogoModalidad({ modo: 'alta' })}>
          Agregar modalidad
        </Button>
      </Space>
      <Table
        rowKey="nombre"
        pagination={false}
        dataSource={modalidades}
        columns={[
          { title: 'Nombre', dataIndex: 'nombre' },
          { title: 'Tipo', dataIndex: 'tipo' },
          { title: 'Apertura', dataIndex: 'aperturaOficial' },
          { title: 'Cierre', dataIndex: 'cierreOficial' },
          {
            title: 'Acciones',
            render: (_, modalidad) => (
              <Space>
                <Button size="small" onClick={() => setDialogoModalidad({ modo: 'edicion', nombre: modalidad.nombre, modalidad })}>
                  Editar
                </Button>
                <Popconfirm title="¿Eliminar esta modalidad?" onConfirm={() => eliminarModalidad(modalidad.nombre)}>
                  <Button size="small" danger>
                    Eliminar
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <h3 style={{ marginTop: 32 }}>Categorías</h3>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setDialogoCategoria({ modo: 'alta' })}>
          Agregar categoría
        </Button>
      </Space>
      <Table
        rowKey="codigo"
        pagination={false}
        dataSource={categorias}
        columns={[
          { title: 'Código', dataIndex: 'codigo' },
          { title: 'Modalidad', dataIndex: 'modalidad' },
          {
            title: 'Acciones',
            render: (_, categoria) => (
              <Button
                size="small"
                onClick={() => setDialogoCategoria({ modo: 'edicion', codigo: categoria.codigo, modalidad: categoria.modalidad })}
              >
                Editar
              </Button>
            ),
          },
        ]}
      />

      {dialogoModalidad && (
        <Dialogo
          etiqueta={dialogoModalidad.modo === 'alta' ? 'Agregar modalidad' : `Editar modalidad — ${dialogoModalidad.nombre}`}
          onCerrar={() => setDialogoModalidad(null)}
        >
          <FormularioModalidad
            nombre={dialogoModalidad.nombre}
            modalidad={dialogoModalidad.modalidad}
            onGuardar={guardarModalidadDesdeDialogo}
            onCancelar={() => setDialogoModalidad(null)}
          />
        </Dialogo>
      )}

      {dialogoCategoria && (
        <Dialogo
          etiqueta={dialogoCategoria.modo === 'alta' ? 'Agregar categoría' : `Editar categoría — ${dialogoCategoria.codigo}`}
          onCerrar={() => setDialogoCategoria(null)}
        >
          <FormularioCategoria
            codigo={dialogoCategoria.codigo}
            modalidadActual={dialogoCategoria.modalidad}
            opcionesModalidad={opcionesModalidad}
            onGuardar={guardarCategoriaDesdeDialogo}
            onCancelar={() => setDialogoCategoria(null)}
          />
        </Dialogo>
      )}
    </section>
  );
}
