import { Layout, Menu, Breadcrumb, Typography } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, BarChartOutlined, SettingOutlined, CoffeeOutlined } from '@ant-design/icons';
import { useRol } from '../contexto/RolContext.jsx';

const { Header, Sider, Content } = Layout;

// Shell de navegación estilo Oracle APEX (Universal Theme, "Side Navigation
// Menu"): header superior + navegación lateral con las secciones + breadcrumb
// de la sección activa. No conoce clientes API ni lógica de negocio: recibe
// la sección activa y el callback de cambio desde App.jsx.

const SECCIONES = [
  { key: 'calendario', icon: <CalendarOutlined />, label: 'Calendario' },
  { key: 'fichadas-hoy', icon: <ClockCircleOutlined />, label: 'Fichadas de hoy' },
  { key: 'resumen-periodo', icon: <BarChartOutlined />, label: 'Resumen período' },
  { key: 'vacaciones', icon: <CoffeeOutlined />, label: 'Vacaciones' },
  { key: 'configuracion', icon: <SettingOutlined />, label: 'Configuración' },
];

const TITULOS = {
  calendario: 'Calendario',
  'fichadas-hoy': 'Fichadas de hoy',
  'resumen-periodo': 'Resumen período',
  vacaciones: 'Vacaciones',
  configuracion: 'Configuración',
};

// feature 016 (FR-007, FR-011, FR-012) — "Configuración" solo se muestra a
// Configurador; el resto de las secciones no cambian por rol (Lector/Editor
// las ven, con sus controles de escritura ocultos dentro de cada una).
const ETIQUETAS_ROL = { lector: 'Lector', editor: 'Editor', configurador: 'Configurador' };

export default function AppShell({ seccion, onCambiarSeccion, children }) {
  const { rol, puede } = useRol();
  const secciones = SECCIONES.filter((s) => s.key !== 'configuracion' || puede('configurador'));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* <Header style={{ display: 'flex', alignItems: 'center' }}>
        // <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
        //   Presentismo
        // </Typography.Title>
      </Header> */}
      <Layout>
        <Sider width={220} style={{ borderRight: '1px solid #d9dee3', display: 'flex', flexDirection: 'column' }}>
          <Menu
            mode="inline"
            selectedKeys={[seccion]}
            items={secciones}
            onClick={({ key }) => onCambiarSeccion(key)}
            style={{ flex: 1, borderInlineEnd: 'none' }}
          />
          <div style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(0, 0, 0, 0.45)' }}>
            {rol ? `Rol: ${ETIQUETAS_ROL[rol] ?? rol}` : null}
          </div>
        </Sider>
        <Layout style={{ padding: '16px 24px' }}>
          {/* <Breadcrumb
            items={[{ title: 'Presentismo' }, { title: TITULOS[seccion] }]}
            style={{ marginBottom: 12 }}
          /> */}
          <Content
            style={{
              background: '#fff',
              padding: 16,
              border: '1px solid #d9dee3',
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
