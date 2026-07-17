import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaFichadasHoy from './PaginaFichadasHoy.jsx';

// T016 (feature 010, US1) — la página carga la vista al montar, muestra el
// error con reintento, y renderiza la tabla con los datos recibidos.

function vista(over = {}) {
  return {
    fecha: '2026-07-16',
    periodo: '202607',
    diaClasificacion: 'Laborable',
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
