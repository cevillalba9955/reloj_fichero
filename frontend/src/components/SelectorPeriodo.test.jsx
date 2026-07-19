import { render, screen, fireEvent } from '@testing-library/react';
import SelectorPeriodo from './SelectorPeriodo.jsx';

// T024 (feature 011, US3) — ofrece únicamente los períodos recibidos del
// servidor (los que tienen calendario generado, FR-002), con el valor actual
// seleccionado, y notifica el cambio.

test('ofrece las opciones de período recibidas, más recientes primero', () => {
  render(<SelectorPeriodo periodos={['202606', '202607']} periodo="202607" onCambiar={vi.fn()} />);
  const opciones = screen.getAllByRole('option').map((o) => o.value);
  expect(opciones).toEqual(['202607', '202606']);
  expect(screen.getByLabelText('Período')).toHaveValue('202607');
});

test('cambiar la selección invoca onCambiar con el período elegido', () => {
  const onCambiar = vi.fn();
  render(<SelectorPeriodo periodos={['202606', '202607']} periodo="202607" onCambiar={onCambiar} />);
  fireEvent.change(screen.getByLabelText('Período'), { target: { value: '202606' } });
  expect(onCambiar).toHaveBeenCalledWith('202606');
});
