import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaResumenPeriodo from './PaginaResumenPeriodo.jsx';
import { seleccionarOpcion } from '../test-utils/antd.js';

// T013/T024 (feature 011) — la página carga el resumen al montar, permite
// reintentar tras un error, cambiar de período (US3) y abrir el detalle de
// un empleado (US2).

function vista(over = {}) {
  return {
    periodo: '202607',
    periodos: ['202606', '202607'],
    filas: [
      {
        legajo: 1,
        nombre: 'Ana Pérez',
        horasTrabajadas: 540,
        completas: 20,
        incompletas: 0,
        ausencias: 1,
        llegadasTarde: 0,
        retirosAnticipados: 0,
        correcciones: 0,
        anomalia: null,
      },
    ],
    ...over,
  };
}

function detalle(over = {}) {
  return {
    periodo: '202607',
    legajo: 1,
    nombre: 'Ana Pérez',
    dias: [
      {
        fecha: '2026-07-01',
        clasificacion: 'Laborable',
        estado: 'Completa',
        entrada: '07:00',
        salida: '16:00',
        horas: 540,
        llegadaTarde: false,
        corregida: false,
        pausas: [],
      },
    ],
    ...over,
  };
}

function clienteMock(over = {}) {
  return {
    obtenerResumen: vi.fn().mockResolvedValue(vista()),
    obtenerDetalle: vi.fn().mockResolvedValue(detalle()),
    ...over,
  };
}

test('carga el resumen al montar y muestra la tabla', async () => {
  const cliente = clienteMock();
  render(<PaginaResumenPeriodo cliente={cliente} />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(cliente.obtenerResumen).toHaveBeenCalledWith(null);
  expect(screen.getByText(/Resumen del período Julio 2026/)).toBeInTheDocument();
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
});

test('un fallo de carga muestra el error y Reintentar vuelve a pedir', async () => {
  const cliente = clienteMock({
    obtenerResumen: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(vista()),
  });
  render(<PaginaResumenPeriodo cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error: boom/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Reintentar'));
  await waitFor(() => expect(cliente.obtenerResumen).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});

test('cambiar el período en el selector recarga la tabla con ese período (US3)', async () => {
  const vistaJunio = vista({ periodo: '202606', filas: [] });
  const cliente = clienteMock({
    obtenerResumen: vi.fn((periodo) => Promise.resolve(periodo === '202606' ? vistaJunio : vista())),
  });
  render(<PaginaResumenPeriodo cliente={cliente} />);
  await screen.findByRole('table');

  await seleccionarOpcion('Período', 'Junio 2026');
  await waitFor(() => expect(cliente.obtenerResumen).toHaveBeenLastCalledWith('202606'));
  expect(await screen.findByText(/Resumen del período Junio 2026/)).toBeInTheDocument();
});

test('clic en una fila abre el diálogo de detalle (US2)', async () => {
  const cliente = clienteMock();
  render(<PaginaResumenPeriodo cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getAllByRole('row')[1]);
  const dialogo = await screen.findByRole('dialog');
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
  expect(cliente.obtenerDetalle).toHaveBeenCalledWith(1, '202607');
  expect(await screen.findByText('2026-07-01')).toBeInTheDocument();
});

test('cerrar el diálogo de detalle vuelve al resumen sin efecto', async () => {
  const cliente = clienteMock();
  render(<PaginaResumenPeriodo cliente={cliente} />);
  await screen.findByRole('table');
  fireEvent.click(screen.getAllByRole('row')[1]);
  await screen.findByRole('dialog');

  fireEvent.click(screen.getByText('Cerrar'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cliente.obtenerResumen).toHaveBeenCalledTimes(1);
});
