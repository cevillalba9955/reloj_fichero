import { useCallback, useEffect, useState } from 'react';
import { Form, Input, InputNumber, Button, Alert, Space, Switch, Select } from 'antd';

// feature 014 (US1, US4) — Formulario "Reloj y servicio": edita los
// parámetros de `.env` (host/puerto del reloj y, más adelante en la misma
// pestaña, el resto de los parámetros operativos). "Probar conexión" usa los
// valores TIPEADOS (aún no guardados, FR-007) sin persistir nada; "Guardar"
// persiste y avisa que el servicio de fichadas necesita reiniciarse para
// tomar el cambio (FR-006, un proceso ya en ejecución no lo aplica en
// caliente).

export default function FormularioConexionReloj({ cliente }) {
  const [form] = Form.useForm();
  const [estado, setEstado] = useState({ tipo: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState(null);
  const [avisoGuardado, setAvisoGuardado] = useState(null);
  const [errorGuardado, setErrorGuardado] = useState(null);

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const parametros = await cliente.obtenerReloj();
      form.setFieldsValue(parametros);
      setEstado({ tipo: 'con-datos' });
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: err.message });
    }
  }, [cliente, form]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function probarConexion() {
    setProbando(true);
    setResultadoPrueba(null);
    try {
      const { host, port } = await form.validateFields(['host', 'port']);
      const resultado = await cliente.probarConexionReloj(host, port);
      setResultadoPrueba(
        resultado.ok
          ? { tipo: 'success', mensaje: 'Se pudo conectar con el reloj en esa dirección.' }
          : { tipo: 'error', mensaje: `No se pudo conectar: ${resultado.motivo}` },
      );
    } catch (err) {
      setResultadoPrueba({ tipo: 'error', mensaje: err.message });
    } finally {
      setProbando(false);
    }
  }

  async function guardar(valores) {
    setGuardando(true);
    setAvisoGuardado(null);
    setErrorGuardado(null);
    try {
      const actualizado = await cliente.guardarReloj(valores);
      form.setFieldsValue(actualizado);
      setAvisoGuardado(
        'Guardado. El servicio de fichadas debe reiniciarse para tomar el nuevo host/puerto del reloj.',
      );
    } catch (err) {
      setErrorGuardado(err.message);
    } finally {
      setGuardando(false);
    }
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

  return (
    <Form form={form} layout="vertical" onFinish={guardar} className="formulario-conexion-reloj">
      <Form.Item
        label="IP / host del reloj"
        name="host"
        rules={[{ required: true, message: 'La IP del reloj es obligatoria' }]}
      >
        <Input placeholder="10.0.0.5" />
      </Form.Item>
      <Form.Item
        label="Puerto"
        name="port"
        rules={[{ required: true, type: 'number', min: 1, max: 65535, message: 'Puerto entre 1 y 65535' }]}
      >
        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
      </Form.Item>

      <h4>Parámetros del servicio</h4>

      <Form.Item
        label="Tiempo de espera por consulta (ms)"
        name="timeoutMs"
        rules={[{ required: true, type: 'number', min: 1, message: 'Debe ser un entero positivo' }]}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Frecuencia de re-consulta (ms)"
        name="tickIntervalMs"
        rules={[{ required: true, type: 'number', min: 1, message: 'Debe ser un entero positivo' }]}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Frecuencia de resumen de estado (ms)"
        name="statusIntervalMs"
        rules={[{ required: true, type: 'number', min: 1, message: 'Debe ser un entero positivo' }]}
      >
        <InputNumber min={1} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Hora esperada del checkpoint de entrada"
        name="entradaHora"
        rules={[{ required: true, message: 'Formato HH:MM' }]}
      >
        <Input placeholder="07:00" />
      </Form.Item>
      <Form.Item
        label="Duración de la ventana de entrada (min)"
        name="entradaDuracion"
        rules={[{ required: true, type: 'number', min: 0, message: 'Debe ser un entero ≥ 0' }]}
      >
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Usar handshake completo" name="fullHandshake" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item
        label="Puerto del servidor de control (vacío = deshabilitado)"
        name="controlPort"
        rules={[{ type: 'number', min: 1, max: 65535, message: 'Puerto entre 1 y 65535' }]}
      >
        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Granularidad del Resumen del Período" name="resumenPeriodo" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 'MENSUAL', label: 'Mensual' },
            { value: 'QUINCENAL', label: 'Quincenal' },
          ]}
        />
      </Form.Item>

      {resultadoPrueba && (
        <Alert
          type={resultadoPrueba.tipo}
          showIcon
          message={resultadoPrueba.mensaje}
          role={resultadoPrueba.tipo === 'error' ? 'alert' : 'status'}
          style={{ marginBottom: 16 }}
        />
      )}
      {avisoGuardado && (
        <Alert type="warning" showIcon message={avisoGuardado} role="status" style={{ marginBottom: 16 }} />
      )}
      {errorGuardado && (
        <Alert
          type="error"
          showIcon
          message={`No se pudo guardar: ${errorGuardado}`}
          role="alert"
          style={{ marginBottom: 16 }}
        />
      )}

      <Space>
        <Button onClick={probarConexion} loading={probando} disabled={guardando}>
          Probar conexión
        </Button>
        <Button type="primary" htmlType="submit" loading={guardando} disabled={probando}>
          Guardar
        </Button>
      </Space>
    </Form>
  );
}
