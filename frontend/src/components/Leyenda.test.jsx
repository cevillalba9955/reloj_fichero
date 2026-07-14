import { render, screen } from '@testing-library/react';
import Leyenda from './Leyenda.jsx';

// T017 (feature 007) — Leyenda: un ítem por clave recibida, con su etiqueta
// textual. FR-006.

const items = [
  { clave: 'habil', etiqueta: 'Hábil', descripcion: 'Día laborable' },
  { clave: 'no-laborable', etiqueta: 'No laborable', descripcion: 'No aporta jornada' },
  { clave: 'feriado', etiqueta: 'Feriado', descripcion: 'Pago, no se trabaja' },
  { clave: 'hoy', etiqueta: 'Hoy', descripcion: 'Fecha actual' },
  { clave: 'periodo-activo', etiqueta: 'Período activo', descripcion: 'Días del período' },
];

test('renderiza un ítem por clave con su etiqueta', () => {
  render(<Leyenda items={items} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Feriado')).toBeInTheDocument();
  expect(screen.getByText('Período activo')).toBeInTheDocument();
});

test('sin ítems no renderiza la lista', () => {
  const { container } = render(<Leyenda items={[]} />);
  expect(container.querySelector('.leyenda')).toBeNull();
});
