import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaFichadasHoy from './PaginaFichadasHoy.jsx';

// T016 (feature 010, US1) — la página carga la vista al montar, muestra el
// error con reintento, y renderiza la tabla con los datos recibidos.

function vista(over = {}) {
  return {
    fecha: '2026-07-16',
    periodo: '202607',
    diaClasificacion: 'Laborable',
    navegacion: { anterior: '2026-07-15', siguiente: null, esHoy: true },
    empleados: [
      {
        legajo: 1,
        nombre: 'Ana Pérez',
        entrada: '07:05',
        salida: null,
        horasTrabajadas: 0,
        situacion: 'PRESENTE',
        correccionVigente: false,
        pausas: [],
        anomalias: [],
      },
    ],
    ...over,
  };
}

function clienteMock(over = {}) {
  return {
    obtenerFichadasHoy: vi.fn().mockResolvedValue(vista()),
    corregir: vi.fn(),
    agregarPausa: vi.fn(),
    registrarRetiroAnticipado: vi.fn(),
    consultarReloj: vi.fn(),
    ...over,
  };
}

test('carga la vista al montar y muestra la tabla', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Fichadas del 2026-07-16/)).toBeInTheDocument();
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
});

// T065 (US5, iteración 2) — navegar al día anterior recarga la vista de esa
// fecha; el botón de consultar reloj solo aparece en el día actual.
test('navegar al día anterior recarga la vista de esa fecha', async () => {
  const vistaAyer = vista({
    fecha: '2026-07-15',
    navegacion: { anterior: '2026-07-14', siguiente: '2026-07-16', esHoy: false },
  });
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn((fecha) =>
      Promise.resolve(fecha === '2026-07-15' ? vistaAyer : vista()),
    ),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByText(/Fichadas del 2026-07-16/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('← Día anterior'));
  expect(await screen.findByText(/Fichadas del 2026-07-15/)).toBeInTheDocument();
  expect(cliente.obtenerFichadasHoy).toHaveBeenLastCalledWith('2026-07-15');
});

test('el botón de consultar reloj no aparece cuando el día mostrado no es hoy', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn().mockResolvedValue(
      vista({ navegacion: { anterior: '2026-07-14', siguiente: '2026-07-16', esHoy: false } }),
    ),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');
  expect(screen.queryByText(/Consultar reloj/i)).not.toBeInTheDocument();
});

// T071 (iteración 2, FR-018) — los formularios de edición se abren como modal.
test('Corregir abre el formulario dentro de un diálogo modal y Escape lo cierra sin efecto', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Corregir'));
  const dialogo = screen.getByRole('dialog');
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
  expect(dialogo).toHaveTextContent(/Corregir horarios/);

  fireEvent.keyDown(dialogo, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cliente.corregir).not.toHaveBeenCalled();
});

test('Pausa / Retiro abre su formulario dentro de un diálogo modal', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Excepcion'));
  const dialogo = screen.getByRole('dialog');
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
});

test('un fallo de carga muestra el error y Reintentar vuelve a pedir', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(vista()),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error: boom/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Reintentar'));
  await waitFor(() => expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});
