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

test('en modo quincenal ofrece las quincenas recibidas, etiquetadas y más recientes primero', () => {
  render(
    <SelectorPeriodo
      periodos={['202606-Q1', '202606-Q2', '202607-Q1', '202607-Q2']}
      periodo="202607-Q1"
      onCambiar={vi.fn()}
    />,
  );
  const opciones = screen.getAllByRole('option');
  expect(opciones.map((o) => o.value)).toEqual(['202607-Q2', '202607-Q1', '202606-Q2', '202606-Q1']);
  expect(opciones.map((o) => o.textContent)).toEqual([
    'Julio 2026 · 2da quincena',
    'Julio 2026 · 1ra quincena',
    'Junio 2026 · 2da quincena',
    'Junio 2026 · 1ra quincena',
  ]);
  expect(screen.getByLabelText('Período')).toHaveValue('202607-Q1');
});

test('cambiar la selección invoca onCambiar con el período elegido', () => {
  const onCambiar = vi.fn();
  render(<SelectorPeriodo periodos={['202606', '202607']} periodo="202607" onCambiar={onCambiar} />);
  fireEvent.change(screen.getByLabelText('Período'), { target: { value: '202606' } });
  expect(onCambiar).toHaveBeenCalledWith('202606');
});
