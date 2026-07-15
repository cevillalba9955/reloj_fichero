import { render, screen, fireEvent } from '@testing-library/react';
import NavegacionMes, { periodoAdyacente } from './NavegacionMes.jsx';

// feature 007 — aritmética de YYYYMM. feature 008 (US3) — el deshabilitado de
// la navegación deriva de `periodos` ∪ `generables` (sin fecha del cliente).

test('periodoAdyacente cruza límites de año', () => {
  expect(periodoAdyacente('202601', -1)).toBe('202512');
  expect(periodoAdyacente('202612', 1)).toBe('202701');
  expect(periodoAdyacente('202607', 1)).toBe('202608');
  expect(periodoAdyacente('202607', -1)).toBe('202606');
});

test('siguiente, anterior y volver invocan onIr cuando el destino es alcanzable', () => {
  const onIr = vi.fn();
  render(
    <NavegacionMes
      periodo="202607"
      ultimo="202608"
      periodos={['202606', '202607', '202608']}
      generables={['202605', '202609']}
      onIr={onIr}
    />,
  );

  fireEvent.click(screen.getByLabelText('Mes siguiente'));
  expect(onIr).toHaveBeenCalledWith('202608');

  fireEvent.click(screen.getByLabelText('Mes anterior'));
  expect(onIr).toHaveBeenCalledWith('202606');

  fireEvent.click(screen.getByText(/Volver al último/));
  expect(onIr).toHaveBeenCalledWith('202608');
});

test('"volver" queda deshabilitado si ya estamos en el último', () => {
  const onIr = vi.fn();
  render(<NavegacionMes periodo="202608" ultimo="202608" periodos={['202608']} onIr={onIr} />);
  expect(screen.getByText(/Volver al último/)).toBeDisabled();
});

// US3 (feature 008) — el "siguiente" se puede pisar hasta la frontera generable,
// no más allá.
test('"siguiente" deshabilitado más allá de la frontera generable', () => {
  const onIr = vi.fn();
  // Parados en el mes-frontera generable (202609): el siguiente (202610) no es
  // alcanzable → deshabilitado.
  render(
    <NavegacionMes
      periodo="202609"
      ultimo="202608"
      periodos={['202607', '202608']}
      generables={['202606', '202609']}
      onIr={onIr}
    />,
  );
  expect(screen.getByLabelText('Mes siguiente')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Mes siguiente'));
  expect(onIr).not.toHaveBeenCalled();
});

test('"siguiente" deshabilitado cuando el mes+1 sería futuro (no está en generables)', () => {
  const onIr = vi.fn();
  // max = mesActual: el backend no incluye max+1 en generables → siguiente
  // deshabilitado desde el último generado.
  render(
    <NavegacionMes
      periodo="202607"
      ultimo="202607"
      periodos={['202606', '202607']}
      generables={['202605']}
      onIr={onIr}
    />,
  );
  expect(screen.getByLabelText('Mes siguiente')).toBeDisabled();
});

test('"anterior" deshabilitado en el borde de backfill (min-1)', () => {
  const onIr = vi.fn();
  // Parados en 202605 (frontera de backfill): 202604 no es alcanzable.
  render(
    <NavegacionMes
      periodo="202605"
      ultimo="202607"
      periodos={['202606', '202607']}
      generables={['202605']}
      onIr={onIr}
    />,
  );
  expect(screen.getByLabelText('Mes anterior')).toBeDisabled();
  // Pero "siguiente" (202606) sí es alcanzable (ya generado).
  expect(screen.getByLabelText('Mes siguiente')).not.toBeDisabled();
});
