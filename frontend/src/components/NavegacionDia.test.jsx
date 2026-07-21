import { render, screen, fireEvent } from '@testing-library/react';
import NavegacionDia from './NavegacionDia.jsx';

// T065 (feature 010, iteración 2, US5) — Los botones de navegación se habilitan
// según el bloque `navegacion` calculado por el servidor; un destino null
// deshabilita (nunca se ofrece futuro ni períodos sin calendario).

test('con anterior y siguiente disponibles, ambos botones navegan a su destino', () => {
  const onNavegar = vi.fn();
  render(
    <NavegacionDia
      navegacion={{ anterior: '2026-07-16', siguiente: '2026-07-18', esHoy: false }}
      onNavegar={onNavegar}
    />,
  );
  fireEvent.click(screen.getByText('Día anterior'));
  expect(onNavegar).toHaveBeenCalledWith('2026-07-16');
  fireEvent.click(screen.getByText('Día siguiente'));
  expect(onNavegar).toHaveBeenCalledWith('2026-07-18');
});

test('en hoy, "Día siguiente" queda deshabilitado (siguiente: null)', () => {
  render(
    <NavegacionDia
      navegacion={{ anterior: '2026-07-17', siguiente: null, esHoy: true }}
      onNavegar={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: /Día siguiente/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Día anterior/ })).toBeEnabled();
});

test('sin día anterior navegable, "Día anterior" queda deshabilitado', () => {
  render(
    <NavegacionDia
      navegacion={{ anterior: null, siguiente: '2026-07-02', esHoy: false }}
      onNavegar={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: /Día anterior/ })).toBeDisabled();
});

test('sin bloque navegacion no renderiza nada', () => {
  const { container } = render(<NavegacionDia navegacion={null} onNavegar={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});
