import { Layout, Menu, Breadcrumb, Typography } from 'antd';
import { CalendarOutlined, ClockCircleOutlined, BarChartOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

// Shell de navegación estilo Oracle APEX (Universal Theme, "Side Navigation
// Menu"): header superior + navegación lateral con las secciones + breadcrumb
// de la sección activa. No conoce clientes API ni lógica de negocio: recibe
// la sección activa y el callback de cambio desde App.jsx.

const SECCIONES = [
  { key: 'calendario', icon: <CalendarOutlined />, label: 'Calendario' },
  { key: 'fichadas-hoy', icon: <ClockCircleOutlined />, label: 'Fichadas de hoy' },
  { key: 'resumen-periodo', icon: <BarChartOutlined />, label: 'Resumen período' },
];

const TITULOS = {
  calendario: 'Calendario',
  'fichadas-hoy': 'Fichadas de hoy',
  'resumen-periodo': 'Resumen período',
};

export default function AppShell({ seccion, onCambiarSeccion, children }) {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          Presentismo
        </Typography.Title>
      </Header>
      <Layout>
        <Sider width={220} style={{ borderRight: '1px solid #d9dee3' }}>
          <Menu
            mode="inline"
            selectedKeys={[seccion]}
            items={SECCIONES}
            onClick={({ key }) => onCambiarSeccion(key)}
            style={{ height: '100%', borderInlineEnd: 'none' }}
          />
        </Sider>
        <Layout style={{ padding: '16px 24px' }}>
          <Breadcrumb
            items={[{ title: 'Presentismo' }, { title: TITULOS[seccion] }]}
            style={{ marginBottom: 12 }}
          />
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
