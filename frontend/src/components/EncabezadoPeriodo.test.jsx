import { render, screen } from '@testing-library/react';
import EncabezadoPeriodo from './EncabezadoPeriodo.jsx';

// T024 (feature 007) — EncabezadoPeriodo: con período muestra etiqueta+rango
// (FR-008); sin período lo indica explícitamente (FR-010).

test('con período activo muestra la etiqueta y el rango de fechas', () => {
  render(
    <EncabezadoPeriodo
      periodoActivo={{ etiqueta: 'Julio 2026', tramo: 'Mes', desde: '2026-07-01', hasta: '2026-07-31' }}
    />,
  );
  expect(screen.getByText('Julio 2026')).toBeInTheDocument();
  expect(screen.getByText(/2026-07-01/)).toBeInTheDocument();
  expect(screen.getByText(/2026-07-31/)).toBeInTheDocument();
});

test('sin período activo lo indica y no rompe', () => {
  render(<EncabezadoPeriodo periodoActivo={null} />);
  expect(screen.getByText(/Sin período activo/)).toBeInTheDocument();
});
