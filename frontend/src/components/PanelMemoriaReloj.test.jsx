import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelMemoriaReloj from './PanelMemoriaReloj.jsx';

function clienteMock(over = {}) {
  return {
    obtenerMemoriaReloj: vi.fn().mockResolvedValue({ fichadasEnMemoria: 12 }),
    limpiarMemoriaReloj: vi.fn().mockResolvedValue({ fichadasDescargadas: 12, borrado: true }),
    ...over,
  };
}

test('muestra la cantidad de fichadas en memoria', async () => {
  render(<PanelMemoriaReloj cliente={clienteMock()} />);
  expect(await screen.findByText('Fichadas en memoria: 12')).toBeInTheDocument();
});

test('limpiar pide confirmación, llama a la API y refresca la cantidad', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({
    obtenerMemoriaReloj: vi
      .fn()
      .mockResolvedValueOnce({ fichadasEnMemoria: 12 })
      .mockResolvedValueOnce({ fichadasEnMemoria: 0 }),
  });
  render(<PanelMemoriaReloj cliente={cliente} />);
  await screen.findByText('Fichadas en memoria: 12');

  await user.click(screen.getByRole('button', { name: 'Limpiar memoria del reloj' }));
  expect(cliente.limpiarMemoriaReloj).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Limpiar' }));

  await waitFor(() => expect(cliente.limpiarMemoriaReloj).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Fichadas en memoria: 0')).toBeInTheDocument();
  expect(screen.getByText(/12 fichada\(s\) guardadas y borradas/)).toBeInTheDocument();
});

test('un error al contar se muestra sin romper el panel', async () => {
  const cliente = clienteMock({ obtenerMemoriaReloj: vi.fn().mockRejectedValue(new Error('reloj apagado')) });
  render(<PanelMemoriaReloj cliente={cliente} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('reloj apagado');
});

test('un error al limpiar se informa', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({ limpiarMemoriaReloj: vi.fn().mockRejectedValue(new Error('falló la descarga')) });
  render(<PanelMemoriaReloj cliente={cliente} />);
  await screen.findByText('Fichadas en memoria: 12');
  await user.click(screen.getByRole('button', { name: 'Limpiar memoria del reloj' }));
  await user.click(await screen.findByRole('button', { name: 'Limpiar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('falló la descarga');
});
