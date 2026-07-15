import { render, screen, fireEvent } from '@testing-library/react';
import EstadoVacio from './EstadoVacio.jsx';

// feature 008 — EstadoVacio: el botón "Generar" aparece solo si el período está
// en la frontera generable; si no, se muestra qué generar primero (US1/US2).

test('muestra el botón "Generar calendario" solo si el período es generable', () => {
  const onGenerar = vi.fn();
  render(
    <EstadoVacio
      mensaje="El calendario del período 202609 aún no fue generado."
      periodo="202609"
      generables={['202605', '202609']}
      onGenerar={onGenerar}
    />,
  );
  const boton = screen.getByRole('button', { name: /Generar calendario/ });
  fireEvent.click(boton);
  expect(onGenerar).toHaveBeenCalledTimes(1);
});

test('un período no generable no muestra botón y sí el mensaje de qué generar primero', () => {
  const onGenerar = vi.fn();
  render(
    <EstadoVacio
      mensaje="El calendario del período 202612 aún no fue generado."
      periodo="202612"
      generables={['202605', '202609']}
      onGenerar={onGenerar}
    />,
  );
  expect(screen.queryByRole('button', { name: /Generar calendario/ })).toBeNull();
  expect(screen.getByText(/primero generá: 202605 o 202609/)).toBeInTheDocument();
});

test('estado vacío global sin frontera (sin período) no muestra botón ni hint', () => {
  render(<EstadoVacio mensaje="Aún no se generó ningún calendario." />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/Aún no se generó/)).toBeInTheDocument();
});
