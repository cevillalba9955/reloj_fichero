import { render, screen, fireEvent } from '@testing-library/react';
import NavegacionMes, { periodoAdyacente } from './NavegacionMes.jsx';

// T035 (feature 007) — NavegacionMes: aritmética de YYYYMM y disparo de onIr.
// FR-012.

test('periodoAdyacente cruza límites de año', () => {
  expect(periodoAdyacente('202601', -1)).toBe('202512');
  expect(periodoAdyacente('202612', 1)).toBe('202701');
  expect(periodoAdyacente('202607', 1)).toBe('202608');
  expect(periodoAdyacente('202607', -1)).toBe('202606');
});

test('siguiente, anterior y volver invocan onIr con el período correcto', () => {
  const onIr = vi.fn();
  render(<NavegacionMes periodo="202607" ultimo="202608" onIr={onIr} />);

  fireEvent.click(screen.getByLabelText('Mes siguiente'));
  expect(onIr).toHaveBeenCalledWith('202608');

  fireEvent.click(screen.getByLabelText('Mes anterior'));
  expect(onIr).toHaveBeenCalledWith('202606');

  fireEvent.click(screen.getByText(/Volver al último/));
  expect(onIr).toHaveBeenCalledWith('202608');
});

test('"volver" queda deshabilitado si ya estamos en el último', () => {
  const onIr = vi.fn();
  render(<NavegacionMes periodo="202608" ultimo="202608" onIr={onIr} />);
  expect(screen.getByText(/Volver al último/)).toBeDisabled();
});
