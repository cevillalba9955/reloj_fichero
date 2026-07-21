import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectorPeriodo from './SelectorPeriodo.jsx';
import { seleccionarOpcion } from '../test-utils/antd.js';

// T024 (feature 011, US3) — ofrece únicamente los períodos recibidos del
// servidor (los que tienen calendario generado, FR-002), con el valor actual
// seleccionado, y notifica el cambio.

async function abrirOpciones() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Período' }));
  // El listbox accesible que antd expone (0x0) no contiene el texto visible;
  // las opciones reales viven en `.ant-select-item-option-content`, en un
  // dropdown hermano montado en el body.
  await screen.findByRole('listbox');
  return [...document.querySelectorAll('.ant-select-item-option-content')].map((el) => el.textContent);
}

test('ofrece las opciones de período recibidas, más recientes primero', async () => {
  render(<SelectorPeriodo periodos={['202606', '202607']} periodo="202607" onCambiar={vi.fn()} />);
  expect(await abrirOpciones()).toEqual(['Julio 2026', 'Junio 2026']);
  expect(document.querySelector('.ant-select-content')).toHaveTextContent('Julio 2026');
});

test('en modo quincenal ofrece las quincenas recibidas, etiquetadas y más recientes primero', async () => {
  render(
    <SelectorPeriodo
      periodos={['202606-Q1', '202606-Q2', '202607-Q1', '202607-Q2']}
      periodo="202607-Q1"
      onCambiar={vi.fn()}
    />,
  );
  expect(await abrirOpciones()).toEqual([
    'Julio 2026 · 2da quincena',
    'Julio 2026 · 1ra quincena',
    'Junio 2026 · 2da quincena',
    'Junio 2026 · 1ra quincena',
  ]);
  expect(document.querySelector('.ant-select-content')).toHaveTextContent('Julio 2026 · 1ra quincena');
});

test('cambiar la selección invoca onCambiar con el período elegido', async () => {
  const onCambiar = vi.fn();
  render(<SelectorPeriodo periodos={['202606', '202607']} periodo="202607" onCambiar={onCambiar} />);
  await seleccionarOpcion('Período', 'Junio 2026');
  expect(onCambiar).toHaveBeenCalledWith('202606');
});
