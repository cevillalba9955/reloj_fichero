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
      periodo="202608"
      mesActual="202607"
      periodos={['202606', '202607', '202608']}
      generables={['202605', '202609']}
      onIr={onIr}
    />,
  );

  fireEvent.click(screen.getByLabelText('Mes siguiente'));
  expect(onIr).toHaveBeenCalledWith('202609');

  fireEvent.click(screen.getByLabelText('Mes anterior'));
  expect(onIr).toHaveBeenCalledWith('202607');

  // "Volver al mes en curso" lleva a mesActual (202607), que está generado.
  fireEvent.click(screen.getByText(/Volver al mes en curso/));
  expect(onIr).toHaveBeenCalledWith('202607');
});

test('"volver al mes en curso" queda deshabilitado si ya estamos en el mes actual', () => {
  const onIr = vi.fn();
  render(
    <NavegacionMes periodo="202607" mesActual="202607" periodos={['202607']} onIr={onIr} />,
  );
  expect(screen.getByText(/Volver al mes en curso/)).toBeDisabled();
});

test('"volver al mes en curso" deshabilitado si el mes actual no es alcanzable (evita callejón sin salida)', () => {
  const onIr = vi.fn();
  // Datos viejos en el pasado; el mes actual (202607) queda lejos de la frontera.
  render(
    <NavegacionMes
      periodo="202602"
      mesActual="202607"
      periodos={['202601', '202602']}
      generables={['202512', '202603']}
      onIr={onIr}
    />,
  );
  expect(screen.getByText(/Volver al mes en curso/)).toBeDisabled();
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
      mesActual="202608"
      periodos={['202607', '202608']}
      generables={['202606', '202609']}
      onIr={onIr}
    />,
  );
  expect(screen.getByLabelText('Mes siguiente')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Mes siguiente'));
  expect(onIr).not.toHaveBeenCalled();
});

test('"anterior" deshabilitado en el borde de backfill (min-1)', () => {
  const onIr = vi.fn();
  // Parados en 202605 (frontera de backfill): 202604 no es alcanzable.
  render(
    <NavegacionMes
      periodo="202605"
      mesActual="202607"
      periodos={['202606', '202607']}
      generables={['202605']}
      onIr={onIr}
    />,
  );
  expect(screen.getByLabelText('Mes anterior')).toBeDisabled();
  // Pero "siguiente" (202606) sí es alcanzable (ya generado).
  expect(screen.getByLabelText('Mes siguiente')).not.toBeDisabled();
});
