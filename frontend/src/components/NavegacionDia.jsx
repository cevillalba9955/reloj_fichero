import { Space, Button } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

// feature 010, iteración 2 (US5, FR-016/FR-017) — Navegación entre días de la
// página "Fichadas de Hoy". Componente de presentación puro (Principio I): los
// destinos navegables vienen del bloque `navegacion` que calcula el servidor
// (research.md §6); un destino null deshabilita el botón (nunca se ofrece un
// día futuro ni un período sin calendario).

export default function NavegacionDia({ navegacion, onNavegar }) {
  if (!navegacion) return null;
  return (
    <nav className="navegacion-dia" aria-label="Navegación de días">
      <Space>
        <Button
          icon={<LeftOutlined />}
          disabled={!navegacion.anterior}
          onClick={() => onNavegar(navegacion.anterior)}
        >
          Día anterior
        </Button>
        <Button
          iconPlacement="end"
          icon={<RightOutlined />}
          disabled={!navegacion.siguiente}
          onClick={() => onNavegar(navegacion.siguiente)}
        >
          Día siguiente
        </Button>
      </Space>
    </nav>
  );
}
