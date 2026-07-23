import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaVacaciones from './PaginaVacaciones.jsx';

// spec 015 — la página carga el listado al montar, permite reintentar tras
// un error, seleccionar un legajo para ver su historial y asignar
// vacaciones actualizando el listado sin recargar toda la página.

function legajoFila(over = {}) {
  return {
    legajo: 1,
    fechaIngreso: '2018-03-01',
    antiguedadAnios: 8,
    saldo: 10,
    proximoIncremento: '2026-11-01',
    pendienteFechaIngreso: false,
    ...over,
  };
}

function detalle(over = {}) {
  return {
    legajo: 1,
    saldo: 10,
    movimientos: [{ tipo: 'incremento', fecha: '2025-11-01', dias: 21, saldoResultante: 21 }],
    asignaciones: [],
    ...over,
  };
}

function clienteMock(over = {}) {
  return {
    listar: vi.fn().mockResolvedValue({ legajos: [legajoFila()] }),
    consultar: vi.fn().mockResolvedValue(detalle()),
    asignar: vi.fn(),
    revertir: vi.fn(),
    ...over,
  };
}

test('carga el listado al montar y muestra la tabla', async () => {
  const cliente = clienteMock();
  render(<PaginaVacaciones cliente={cliente} />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(cliente.listar).toHaveBeenCalledTimes(1);
});

test('un fallo de carga muestra el error y Reintentar vuelve a pedir', async () => {
  const cliente = clienteMock({
    listar: vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ legajos: [legajoFila()] }),
  });
  render(<PaginaVacaciones cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error: boom/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Reintentar'));
  await waitFor(() => expect(cliente.listar).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});

test('clic en un legajo carga su historial', async () => {
  const cliente = clienteMock();
  render(<PaginaVacaciones cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getAllByRole('row')[1]);
  await waitFor(() => expect(cliente.consultar).toHaveBeenCalledWith(1));
  expect(await screen.findByText('2025-11-01')).toBeInTheDocument();
});

test('asignar vacaciones refresca el listado y el historial sin recargar toda la página', async () => {
  const cliente = clienteMock({
    asignar: vi.fn().mockResolvedValue({ asignacionId: 'a1', fechaInicio: '2026-01-10', fechaFin: '2026-01-30', cantidadDias: 21, saldoResultante: -11 }),
  });
  render(<PaginaVacaciones cliente={cliente} />);
  await screen.findByRole('table');
  fireEvent.click(screen.getAllByRole('row')[1]);
  await screen.findByText(/Historial/);

  fireEvent.change(screen.getByLabelText(/Fecha de inicio/), { target: { value: '2026-01-10' } });
  fireEvent.change(screen.getByLabelText(/Cantidad de días/), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(cliente.asignar).toHaveBeenCalledWith({ legajo: 1, fechaInicio: '2026-01-10', cantidadDias: 21 }));
  await waitFor(() => expect(cliente.listar).toHaveBeenCalledTimes(2), 'recarga el listado tras asignar');
  await waitFor(() => expect(cliente.consultar).toHaveBeenCalledTimes(2), 'recarga el historial tras asignar');
});

// spec 015 (US4) — revertir una asignación vigente desde el historial.
test('revertir una asignación refresca el listado y el historial', async () => {
  const cliente = clienteMock({
    consultar: vi.fn().mockResolvedValue(
      detalle({ asignaciones: [{ id: 'a1', fechaInicio: '2026-01-10', fechaFin: '2026-01-30', cantidadDias: 21, vigente: true }] }),
    ),
    revertir: vi.fn().mockResolvedValue({ id: 'a1', revertida: true, saldoResultante: 31 }),
  });
  render(<PaginaVacaciones cliente={cliente} />);
  await screen.findByRole('table');
  fireEvent.click(screen.getAllByRole('row')[1]);
  await screen.findByRole('button', { name: 'Revertir' });

  fireEvent.click(screen.getByRole('button', { name: 'Revertir' }));

  await waitFor(() => expect(cliente.revertir).toHaveBeenCalledWith('a1', {}));
  await waitFor(() => expect(cliente.listar).toHaveBeenCalledTimes(2), 'recarga el listado tras revertir');
  await waitFor(() => expect(cliente.consultar).toHaveBeenCalledTimes(2), 'recarga el historial tras revertir');
});
