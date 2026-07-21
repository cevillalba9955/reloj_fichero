import { theme } from 'antd';

// Paleta y densidad inspiradas en Oracle APEX (Universal Theme): header azul
// marino oscuro, navegación lateral clara, bordes rectos y tablas densas con
// líneas grises definidas, en vez del estilo redondeado por defecto de antd.
export const themeConfig = {
  algorithm: theme.compactAlgorithm,
  token: {
    colorPrimary: '#2c5f8a',
    colorInfo: '#2c5f8a',
    colorLink: '#2c5f8a',
    colorBgLayout: '#f2f4f6',
    colorBorderSecondary: '#d9dee3',
    borderRadius: 2,
    fontSize: 13,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#1a3b5d',
      headerColor: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f2f4f6',
    },
    Menu: {
      itemSelectedBg: '#e6eef5',
      itemSelectedColor: '#1a3b5d',
      itemHeight: 36,
    },
    Table: {
      headerBg: '#eef1f4',
      headerColor: '#333333',
      borderColor: '#d9dee3',
      cellPaddingBlockSM: 6,
    },
    Card: {
      headerBg: '#eef1f4',
    },
  },
};
