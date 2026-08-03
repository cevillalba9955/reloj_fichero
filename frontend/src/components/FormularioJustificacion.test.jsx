import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderConRol } from '../test-utils/rol.jsx';
import FormularioJustificacion from './FormularioJustificacion.jsx';
import { seleccionarOpcion, escribirFecha } from '../test-utils/antd.js';

// feature 012 (US1) — motivo obligatorio (FR-003), legajo/fecha precargados
// desde una fila o editables en la carga general, envío con/sin rango.

const MOTIVOS = [
  { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga' },
  { id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga' },
];

const fila = { legajo: 3, nombre: 'Carla Ausente', fecha: '2026-07-10', situacion: 'AUSENTE' };

test('sin motivo, "Guardar" está deshabilitado y no se envía nada', () => {
  const onGuardar = vi.fn();
  renderConRol('editor', <FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  const guardar = screen.getByRole('button', { name: 'Guardar' });
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(onGuardar).not.toHaveBeenCalled();
});

test('con fila precargada, envía legajo/fecha de la fila y el motivo elegido', async () => {
  const onGuardar = vi.fn().mockResolvedValue({ registradas: [{ fecha: '2026-07-10' }], omitidas: [], noAplicables: [] });
  renderConRol('editor', <FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  await seleccionarOpcion(/Motivo/, 'Vacaciones (Paga)');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 3, fecha: '2026-07-10', hasta: null, motivoId: 'vacaciones' }),
  );
  expect(await screen.findByText(/1 día\(s\) justificado\(s\)/)).toBeInTheDocument();
});

test('sin fila (carga general), permite completar legajo, fecha y un rango "hasta"', async () => {
  const onGuardar = vi.fn().mockResolvedValue({ registradas: [], omitidas: [], noAplicables: [] });
  renderConRol('editor', <FormularioJustificacion motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Legajo'), { target: { value: '7' } });
  escribirFecha(/^Fecha/, '2026-08-03');
  escribirFecha(/Hasta/, '2026-08-05');
  await seleccionarOpcion(/Motivo/, 'Sin Aviso (No paga)');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() =>
    expect(onGuardar).toHaveBeenCalledWith({ legajo: 7, fecha: '2026-08-03', hasta: '2026-08-05', motivoId: 'sin_aviso' }),
  );
});

test('un error de guardado se muestra sin cerrar', async () => {
  const onGuardar = vi.fn().mockRejectedValue(new Error('el día ya tiene fichadas'));
  renderConRol('editor', <FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);

  await seleccionarOpcion(/Motivo/, 'Vacaciones (Paga)');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('el día ya tiene fichadas');
});

// feature 016 (FR-005/FR-011) — rol lector: "Guardar" queda deshabilitado
// aunque legajo/fecha/motivo sean válidos.
test('rol lector: "Guardar" queda deshabilitado aunque los campos sean válidos', async () => {
  const onGuardar = vi.fn();
  renderConRol('lector', <FormularioJustificacion fila={fila} motivos={MOTIVOS} onGuardar={onGuardar} onCancelar={vi.fn()} />);
  await seleccionarOpcion(/Motivo/, 'Vacaciones (Paga)');
  const guardar = screen.getByRole('button', { name: 'Guardar' });
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(onGuardar).not.toHaveBeenCalled();
});
