import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormularioPausaRetiro from './FormularioPausaRetiro.jsx';

// T039 (feature 010, US3) — dos modos (pausa intermedia / retiro anticipado),
// motivo obligatorio en ambos (FR-004), y fallo visible sin cerrar.

const fila = {
  legajo: 4,
  nombre: 'Dario Completo',
  entrada: '07:05',
  salida: '15:58',
  horasTrabajadas: 540,
  situacion: 'Completa',
  correccionVigente: false,
  pausas: [],
  anomalias: [],
};

test('sin motivo, "Guardar" está deshabilitado en ambos modos', () => {
  const onGuardar = vi.fn();
  render(<FormularioPausaRetiro fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Retiro anticipado'));
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  expect(onGuardar).not.toHaveBeenCalled();
});

test('modo pausa: envía desde/hasta y motivo', async () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  render(<FormularioPausaRetiro fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '12:00' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '13:00' } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'corte de mediodía' } });
  fireEvent.click(screen.getByText('Guardar'));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({
      modo: 'pausa',
      desde: '12:00',
      hasta: '13:00',
      motivo: 'corte de mediodía',
    }),
  );
});

test('modo retiro: envía la hora del retiro y el motivo', async () => {
  const onGuardar = vi.fn().mockResolvedValue(undefined);
  render(<FormularioPausaRetiro fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.click(screen.getByLabelText('Retiro anticipado'));
  fireEvent.change(screen.getByLabelText('Hora del retiro'), { target: { value: '14:30' } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'turno médico' } });
  fireEvent.click(screen.getByText('Guardar'));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({
      modo: 'retiro',
      hora: '14:30',
      motivo: 'turno médico',
    }),
  );
});

test('un fallo del guardado se muestra como error', async () => {
  const onGuardar = vi.fn().mockRejectedValue(new Error('desde >= hasta'));
  render(<FormularioPausaRetiro fila={fila} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'x' } });
  fireEvent.click(screen.getByText('Guardar'));
  expect(await screen.findByRole('alert')).toHaveTextContent('desde >= hasta');
});

test('cancelar invoca onCancelar sin guardar', () => {
  const onGuardar = vi.fn();
  const onCancelar = vi.fn();
  render(<FormularioPausaRetiro fila={fila} onGuardar={onGuardar} onCancelar={onCancelar} />);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(onCancelar).toHaveBeenCalledTimes(1);
  expect(onGuardar).not.toHaveBeenCalled();
});
