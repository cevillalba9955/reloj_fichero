// Paleta inspirada en Oracle APEX (Universal Theme): header azul marino
// oscuro, navegación lateral clara, bordes rectos y tablas con líneas grises
// definidas. Nota: NO se usa `theme.compactAlgorithm` — ese algoritmo deriva
// todos los tamaños de fuente a partir de una escala reducida fija (~2px
// menos que la base), así que ignora cualquier `fontSize` más grande que se
// configure aquí.
export const themeConfig = {
  token: {
    colorPrimary: '#2c5f8a',
    colorInfo: '#2c5f8a',
    colorLink: '#2c5f8a',
    colorBgLayout: '#f2f4f6',
    colorBorderSecondary: '#d9dee3',
    borderRadius: 2,
    fontSize: 16,
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
