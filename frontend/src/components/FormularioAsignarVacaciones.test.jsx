import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormularioAsignarVacaciones from './FormularioAsignarVacaciones.jsx';
import { escribirFecha } from '../test-utils/antd.js';

// spec 015 (US1) — fecha de inicio + cantidad de días obligatorios (FR-003),
// legajo precargado desde una fila o editable en la carga general.

const fila = { legajo: 3, nombre: 'Carla Ausente' };

test('sin fecha de inicio ni cantidad de días, "Guardar" está deshabilitado y no se envía nada', () => {
  const onGuardar = vi.fn();
  render(<FormularioAsignarVacaciones fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  const guardar = screen.getByRole('button', { name: 'Guardar' });
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(onGuardar).not.toHaveBeenCalled();
});

test('con fila precargada, envía legajo de la fila + fecha/cantidad completadas y avisa el éxito al contenedor', async () => {
  const resultado = { asignacionId: 'a1', fechaInicio: '2026-01-10', fechaFin: '2026-01-30', cantidadDias: 21, saldoResultante: 3 };
  const onGuardar = vi.fn().mockResolvedValue(resultado);
  const onExito = vi.fn();
  render(<FormularioAsignarVacaciones fila={fila} onGuardar={onGuardar} onExito={onExito} onCancelar={vi.fn()} />);

  escribirFecha(/Fecha de inicio/, '2026-01-10');
  fireEvent.change(screen.getByLabelText(/Cantidad de días/), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 3, fechaInicio: '2026-01-10', cantidadDias: 21 }),
  );
  // spec 015 feedback — el formulario no muestra su propio mensaje de éxito:
  // delega en el contenedor (que cierra el modal y confirma en la página).
  await waitFor(() => expect(onExito).toHaveBeenCalledWith(resultado));
});

test('cantidadDias <= 0 mantiene "Guardar" deshabilitado', () => {
  const onGuardar = vi.fn();
  render(<FormularioAsignarVacaciones fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  escribirFecha(/Fecha de inicio/, '2026-01-10');
  fireEvent.change(screen.getByLabelText(/Cantidad de días/), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
});

test('sin fila (carga general), permite completar el legajo a mano', async () => {
  const onGuardar = vi
    .fn()
    .mockResolvedValue({ asignacionId: 'a2', fechaInicio: '2026-02-01', fechaFin: '2026-02-05', cantidadDias: 5, saldoResultante: 0 });
  render(<FormularioAsignarVacaciones onGuardar={onGuardar} onExito={vi.fn()} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Legajo'), { target: { value: '7' } });
  escribirFecha(/Fecha de inicio/, '2026-02-01');
  fireEvent.change(screen.getByLabelText(/Cantidad de días/), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 7, fechaInicio: '2026-02-01', cantidadDias: 5 }),
  );
});

test('un error de guardado se muestra sin cerrar', async () => {
  const onGuardar = vi.fn().mockRejectedValue(new Error('saldo insuficiente'));
  render(<FormularioAsignarVacaciones fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  escribirFecha(/Fecha de inicio/, '2026-01-10');
  fireEvent.change(screen.getByLabelText(/Cantidad de días/), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('saldo insuficiente');
});
