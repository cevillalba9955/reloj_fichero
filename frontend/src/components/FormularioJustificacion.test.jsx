import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormularioJustificacion from './FormularioJustificacion.jsx';

// feature 012 (US1) — motivo obligatorio (FR-003), legajo/fecha precargados
// desde una fila o editables en la carga general, envío con/sin rango.

const MOTIVOS = [
  { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga' },
  { id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga' },
];

const fila = { legajo: 3, nombre: 'Carla Ausente', fecha: '2026-07-10', situacion: 'AUSENTE' };

test('sin motivo, "Guardar" está deshabilitado y no se envía nada', () => {
  const onGuardar = vi.fn();
  render(<FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  const guardar = screen.getByText('Guardar');
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(onGuardar).not.toHaveBeenCalled();
});

test('con fila precargada, envía legajo/fecha de la fila y el motivo elegido', async () => {
  const onGuardar = vi.fn().mockResolvedValue({ registradas: [{ fecha: '2026-07-10' }], omitidas: [], noAplicables: [] });
  render(<FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'vacaciones' } });
  fireEvent.click(screen.getByText('Guardar'));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 3, fecha: '2026-07-10', hasta: null, motivoId: 'vacaciones' }),
  );
  expect(await screen.findByText(/1 día\(s\) justificado\(s\)/)).toBeInTheDocument();
});

test('sin fila (carga general), permite completar legajo, fecha y un rango "hasta"', async () => {
  const onGuardar = vi.fn().mockResolvedValue({ registradas: [], omitidas: [], noAplicables: [] });
  render(<FormularioJustificacion motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Legajo'), { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText(/^Fecha/), { target: { value: '2026-08-03' } });
  fireEvent.change(screen.getByLabelText(/Hasta/), { target: { value: '2026-08-05' } });
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'sin_aviso' } });
  fireEvent.click(screen.getByText('Guardar'));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 7, fecha: '2026-08-03', hasta: '2026-08-05', motivoId: 'sin_aviso' }),
  );
});

test('un error de guardado se muestra sin cerrar', async () => {
  const onGuardar = vi.fn().mockRejectedValue(new Error('el día ya tiene fichadas'));
  render(<FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'vacaciones' } });
  fireEvent.click(screen.getByText('Guardar'));

  expect(await screen.findByRole('alert')).toHaveTextContent('el día ya tiene fichadas');
});
