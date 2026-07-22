import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormularioConexionReloj from './FormularioConexionReloj.jsx';

// feature 014 (US1) — carga host/puerto actuales, permite probar la conexión
// con valores tipeados (sin guardar), y guarda con aviso de reinicio
// requerido (FR-006/FR-007).

const RELOJ = {
  host: '10.0.0.5',
  port: 5005,
  timeoutMs: 5000,
  tickIntervalMs: 300000,
  statusIntervalMs: 60000,
  entradaHora: '07:00',
  entradaDuracion: 30,
  fullHandshake: false,
  controlPort: null,
  resumenPeriodo: 'MENSUAL',
};

function clienteMock(over = {}) {
  return {
    obtenerReloj: vi.fn().mockResolvedValue({ ...RELOJ }),
    guardarReloj: vi.fn().mockResolvedValue({ ...RELOJ }),
    probarConexionReloj: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

test('carga host/puerto actuales al montar', async () => {
  const cliente = clienteMock();
  render(<FormularioConexionReloj cliente={cliente} />);

  expect(await screen.findByDisplayValue('10.0.0.5')).toBeInTheDocument();
  expect(screen.getByDisplayValue('5005')).toBeInTheDocument();
});

test('Probar conexión usa los valores tipeados, sin guardar', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({ probarConexionReloj: vi.fn().mockResolvedValue({ ok: true }) });
  render(<FormularioConexionReloj cliente={cliente} />);

  await screen.findByDisplayValue('10.0.0.5');
  await user.clear(screen.getByLabelText('IP / host del reloj'));
  await user.type(screen.getByLabelText('IP / host del reloj'), '10.0.0.9');
  await user.click(screen.getByRole('button', { name: 'Probar conexión' }));

  await waitFor(() => expect(cliente.probarConexionReloj).toHaveBeenCalledWith('10.0.0.9', 5005));
  expect(cliente.guardarReloj).not.toHaveBeenCalled();
  expect(await screen.findByText(/Se pudo conectar con el reloj/)).toBeInTheDocument();
});

test('una prueba de conexión fallida se muestra sin bloquear el formulario', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({
    probarConexionReloj: vi.fn().mockResolvedValue({ ok: false, motivo: 'timeout' }),
  });
  render(<FormularioConexionReloj cliente={cliente} />);

  await screen.findByDisplayValue('10.0.0.5');
  await user.click(screen.getByRole('button', { name: 'Probar conexión' }));

  expect(await screen.findByText(/No se pudo conectar: timeout/)).toBeInTheDocument();
});

test('Guardar persiste y avisa que hace falta reiniciar el servicio', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock();
  render(<FormularioConexionReloj cliente={cliente} />);

  await screen.findByDisplayValue('10.0.0.5');
  await user.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(cliente.guardarReloj).toHaveBeenCalled());
  expect(await screen.findByText(/debe reiniciarse/)).toBeInTheDocument();
});

test('un error al guardar se muestra sin perder los datos cargados', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({ guardarReloj: vi.fn().mockRejectedValue(new Error('puerto inválido')) });
  render(<FormularioConexionReloj cliente={cliente} />);

  await screen.findByDisplayValue('10.0.0.5');
  await user.click(screen.getByRole('button', { name: 'Guardar' }));

  expect(await screen.findByText(/No se pudo guardar: puerto inválido/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('10.0.0.5')).toBeInTheDocument();
});
