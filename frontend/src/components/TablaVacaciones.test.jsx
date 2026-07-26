import { render, screen, fireEvent } from '@testing-library/react';
import TablaVacaciones from './TablaVacaciones.jsx';

// spec 015 (US2, FR-008) — antigüedad/saldo/próximo incremento por legajo,
// legajo sin fechaIngreso señalado como pendiente sin bloquear el resto.

function legajoFila(over = {}) {
  return {
    legajo: 1,
    fechaIngreso: '2018-03-01',
    antiguedadAnios: 8,
    saldo: 3,
    proximoIncremento: '2026-11-01',
    proximoIncrementoDias: 21,
    pendienteFechaIngreso: false,
    ...over,
  };
}

test('muestra una fila por legajo con antigüedad, saldo y próximo incremento (con la cantidad de días)', () => {
  render(<TablaVacaciones legajos={[legajoFila()]} />);
  const filas = screen.getAllByRole('row').slice(1);
  expect(filas).toHaveLength(1);
  expect(filas[0]).toHaveTextContent('8 año(s)');
  expect(filas[0]).toHaveTextContent('3');
  expect(filas[0]).toHaveTextContent('2026-11-01 (+21 día(s))');
  expect(filas[0]).not.toHaveClass('pendiente');
});

test('un legajo sin fechaIngreso se muestra pendiente, sin bloquear el resto (Acceptance Scenario US2.3)', () => {
  render(
    <TablaVacaciones
      legajos={[
        legajoFila(),
        legajoFila({
          legajo: 2,
          fechaIngreso: null,
          antiguedadAnios: null,
          proximoIncremento: null,
          proximoIncrementoDias: null,
          pendienteFechaIngreso: true,
        }),
      ]}
    />,
  );
  const filas = screen.getAllByRole('row').slice(1);
  expect(filas).toHaveLength(2);
  expect(filas[1]).toHaveTextContent('Falta fecha de ingreso');
  expect(filas[1]).toHaveClass('pendiente');
  expect(filas[0]).not.toHaveTextContent('Falta fecha de ingreso');
  expect(filas[0]).not.toHaveClass('pendiente');
});

test('sin legajos muestra un mensaje de vacío', () => {
  render(<TablaVacaciones legajos={[]} />);
  expect(screen.getByText(/No hay legajos activos/)).toBeInTheDocument();
});

test('con onSeleccionar, clic en una fila la selecciona', () => {
  const onSeleccionar = vi.fn();
  render(<TablaVacaciones legajos={[legajoFila()]} onSeleccionar={onSeleccionar} />);
  fireEvent.click(screen.getAllByRole('row')[1]);
  expect(onSeleccionar).toHaveBeenCalledWith(legajoFila());
});

test('con onAsignar, muestra el botón "Asignar vacaciones" y no dispara onSeleccionar al hacer clic', () => {
  const onSeleccionar = vi.fn();
  const onAsignar = vi.fn();
  render(<TablaVacaciones legajos={[legajoFila()]} onSeleccionar={onSeleccionar} onAsignar={onAsignar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Asignar vacaciones' }));
  expect(onAsignar).toHaveBeenCalledWith(legajoFila());
  expect(onSeleccionar).not.toHaveBeenCalled();
});

test('sin onAsignar, no muestra columna Acciones', () => {
  render(<TablaVacaciones legajos={[legajoFila()]} />);
  expect(screen.queryByRole('button', { name: 'Asignar vacaciones' })).not.toBeInTheDocument();
});

test('legajoSeleccionado remarca esa fila con la clase "seleccionada"', () => {
  render(
    <TablaVacaciones
      legajos={[legajoFila(), legajoFila({ legajo: 2 })]}
      legajoSeleccionado={2}
    />,
  );
  const filas = screen.getAllByRole('row').slice(1);
  expect(filas[0]).not.toHaveClass('seleccionada');
  expect(filas[1]).toHaveClass('seleccionada');
});
