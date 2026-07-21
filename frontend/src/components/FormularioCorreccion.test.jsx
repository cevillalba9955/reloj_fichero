import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormularioCorreccion from './FormularioCorreccion.jsx';

// T027 (feature 010, US2) — el formulario exige motivo para guardar (FR-004)
// y delega el guardado en el contenedor; un fallo se muestra sin cerrar.

const fila = {
  legajo: 3,
  nombre: 'Carla Tarde',
  entrada: '08:10',
  salida: null,
  horasTrabajadas: 0,
  situacion: 'TARDE',
  correccionVigente: false,
  pausas: [],
  anomalias: [],
};

test('sin motivo, "Guardar" está deshabilitado y no se envía nada', () => {
  const onGuardar = vi.fn();
  render(<FormularioCorreccion fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  const guardar = screen.getByRole('button', { name: 'Guardar' });
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(onGuardar).not.toHaveBeenCalled();

  // Un motivo de solo espacios tampoco habilita.
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
});

test('con motivo, envía entrada/salida y el motivo recortado', async () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  render(<FormularioCorreccion fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '07:05' } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: ' error del reloj ' } });
  fireEvent.click(screen.getByText('Guardar'));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({
      entrada: '07:05',
      salida: null,
      motivo: 'error del reloj',
    }),
  );
});

test('un fallo del guardado se muestra como error y el formulario sigue abierto', async () => {
  const onGuardar = vi.fn().mockRejectedValue(new Error('hora inválida'));
  render(<FormularioCorreccion fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'ajuste' } });
  fireEvent.click(screen.getByText('Guardar'));

  expect(await screen.findByRole('alert')).toHaveTextContent('hora inválida');
  expect(screen.getByText('Guardar')).toBeInTheDocument();
});

test('cancelar invoca onCancelar sin guardar', () => {
  const onGuardar = vi.fn();
  const onCancelar = vi.fn();
  render(<FormularioCorreccion fila={fila} onGuardar={onGuardar} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalledTimes(1);
  expect(onGuardar).not.toHaveBeenCalled();
});
