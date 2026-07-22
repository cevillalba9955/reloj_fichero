import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TablaMotivosAusencia from './TablaMotivosAusencia.jsx';

// feature 014 (US2) — listado completo, alta, edición y activar/desactivar
// sin eliminar (FR-009).

const MOTIVOS = [
  { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga', activo: true },
  { id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga', activo: true },
];

function clienteMock(over = {}) {
  return {
    obtenerMotivos: vi.fn().mockResolvedValue({ motivos: MOTIVOS }),
    crearMotivo: vi.fn().mockResolvedValue({}),
    editarMotivo: vi.fn().mockResolvedValue({}),
    ...over,
  };
}

test('lista los motivos con su tipo de pago y estado activo', async () => {
  render(<TablaMotivosAusencia cliente={clienteMock()} />);

  expect(await screen.findByText('Sin Aviso')).toBeInTheDocument();
  expect(screen.getByText('Vacaciones')).toBeInTheDocument();
});

test('agregar un motivo nuevo lo envía al cliente y recarga la lista', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({
    crearMotivo: vi.fn().mockResolvedValue({}),
    obtenerMotivos: vi
      .fn()
      .mockResolvedValueOnce({ motivos: MOTIVOS })
      .mockResolvedValueOnce({ motivos: [...MOTIVOS, { id: 'mudanza', etiqueta: 'Mudanza', tipoPago: 'No paga', activo: true }] }),
  });
  render(<TablaMotivosAusencia cliente={cliente} />);

  await screen.findByText('Sin Aviso');
  await user.click(screen.getByRole('button', { name: 'Agregar motivo' }));

  const dialogo = await screen.findByRole('dialog');
  await user.type(within(dialogo).getByLabelText('Identificador'), 'mudanza');
  await user.type(within(dialogo).getByLabelText('Etiqueta'), 'Mudanza');
  await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(cliente.crearMotivo).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mudanza', etiqueta: 'Mudanza' }),
    ),
  );
  expect(await screen.findByText('Mudanza')).toBeInTheDocument();
});

test('editar un motivo existente no permite cambiar el identificador', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock();
  render(<TablaMotivosAusencia cliente={cliente} />);

  await screen.findByText('Sin Aviso');
  const fila = screen.getByText('Sin Aviso').closest('tr');
  await user.click(within(fila).getByRole('button', { name: 'Editar' }));

  const dialogo = await screen.findByRole('dialog');
  expect(within(dialogo).queryByLabelText('Identificador')).not.toBeInTheDocument();
  await user.clear(within(dialogo).getByLabelText('Etiqueta'));
  await user.type(within(dialogo).getByLabelText('Etiqueta'), 'Sin aviso previo');
  await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(cliente.editarMotivo).toHaveBeenCalledWith('sin_aviso', expect.objectContaining({ etiqueta: 'Sin aviso previo' })),
  );
});

test('el switch de Activo desactiva un motivo sin abrir un diálogo', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock();
  render(<TablaMotivosAusencia cliente={cliente} />);

  await screen.findByText('Sin Aviso');
  const fila = screen.getByText('Sin Aviso').closest('tr');
  await user.click(within(fila).getByRole('switch'));

  await waitFor(() => expect(cliente.editarMotivo).toHaveBeenCalledWith('sin_aviso', { activo: false }));
});
