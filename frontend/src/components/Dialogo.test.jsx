import { render, screen, fireEvent } from '@testing-library/react';
import Dialogo from './Dialogo.jsx';

// T068 (feature 010, iteración 2, FR-018) — Modal reutilizable: backdrop +
// role="dialog"/aria-modal; Escape y click en el backdrop cierran (equivalen a
// Cancelar, sin efecto); click dentro del contenido NO cierra.

test('renderiza el contenido dentro de role="dialog" con aria-modal', () => {
  render(
    <Dialogo etiqueta="Corregir horarios" onCerrar={vi.fn()}>
      <p>contenido</p>
    </Dialogo>,
  );
  const dialogo = screen.getByRole('dialog', { name: 'Corregir horarios' });
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByText('contenido')).toBeInTheDocument();
});

test('la tecla Escape cierra el diálogo', () => {
  const onCerrar = vi.fn();
  render(
    <Dialogo etiqueta="x" onCerrar={onCerrar}>
      <p>contenido</p>
    </Dialogo>,
  );
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onCerrar).toHaveBeenCalledTimes(1);
});

test('el click en el backdrop cierra; el click dentro del contenido no', () => {
  const onCerrar = vi.fn();
  render(
    <Dialogo etiqueta="x" onCerrar={onCerrar}>
      <p>contenido</p>
    </Dialogo>,
  );
  fireEvent.click(screen.getByText('contenido'));
  expect(onCerrar).not.toHaveBeenCalled();

  // El Modal se monta en un portal (document.body); el cierre por click-afuera
  // de antd requiere que el mousedown Y el click ocurran sobre el wrapper
  // mismo (no sobre el contenido), igual que el backdrop manual anterior.
  const wrap = document.querySelector('.dialogo-backdrop');
  fireEvent.mouseDown(wrap);
  fireEvent.click(wrap);
  expect(onCerrar).toHaveBeenCalledTimes(1);
});
