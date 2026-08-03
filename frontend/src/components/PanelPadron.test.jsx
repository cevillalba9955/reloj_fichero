import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PanelPadron from './PanelPadron.jsx';

// fix vacaciones — botón manual de sincronización del padrón desde Oracle.

test('sincroniza el padrón y muestra el resultado', async () => {
  const cliente = {
    sincronizarPadron: vi.fn().mockResolvedValue({ periodo: '202608', empleados: [{ legajo: 1 }, { legajo: 2 }] }),
  };
  render(<PanelPadron cliente={cliente} />);

  fireEvent.click(screen.getByRole('button', { name: 'Sincronizar padrón' }));

  expect(await screen.findByText('Padrón sincronizado (período 202608): 2 legajo(s).')).toBeInTheDocument();
  expect(cliente.sincronizarPadron).toHaveBeenCalledTimes(1);
});

test('un fallo de sincronización muestra el error', async () => {
  const cliente = {
    sincronizarPadron: vi.fn().mockRejectedValue(new Error('Configuración del padrón Oracle inválida.')),
  };
  render(<PanelPadron cliente={cliente} />);

  fireEvent.click(screen.getByRole('button', { name: 'Sincronizar padrón' }));

  expect(await screen.findByText(/No se pudo sincronizar: Configuración del padrón Oracle inválida\./)).toBeInTheDocument();
});
