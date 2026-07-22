import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaginaConfiguracion from './PaginaConfiguracion.jsx';

// feature 014 (Setup) — la página expone las 3 secciones (una por historia
// de usuario) como pestañas independientes. AntD `Tabs` mantiene montadas las
// pestañas inactivas (por defecto no usa `destroyInactiveTabPane`), así que
// el cliente mock debe resolver todo lo que sus formularios pidan al montar.
function clienteMock() {
  return {
    obtenerReloj: vi.fn().mockResolvedValue({
      host: '10.0.0.5', port: 5005, timeoutMs: 5000, tickIntervalMs: 300000,
      statusIntervalMs: 60000, entradaHora: '07:00', entradaDuracion: 30,
      fullHandshake: false, controlPort: null, resumenPeriodo: 'MENSUAL',
    }),
    obtenerMotivos: vi.fn().mockResolvedValue({ motivos: [] }),
    obtenerCategorias: vi.fn().mockResolvedValue({ esquemaSemanal: [], modalidades: {}, categorias: {} }),
  };
}

test('muestra las 3 pestañas de Configuración', async () => {
  render(<PaginaConfiguracion cliente={clienteMock()} />);

  expect(screen.getByRole('tab', { name: 'Reloj y servicio' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Motivos de ausencia' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Categorías y modalidades' })).toBeInTheDocument();
});

test('permite cambiar entre pestañas', async () => {
  const user = userEvent.setup();
  render(<PaginaConfiguracion cliente={clienteMock()} />);

  await user.click(screen.getByRole('tab', { name: 'Motivos de ausencia' }));
  expect(screen.getByRole('tab', { name: 'Motivos de ausencia' })).toHaveAttribute('aria-selected', 'true');
});
