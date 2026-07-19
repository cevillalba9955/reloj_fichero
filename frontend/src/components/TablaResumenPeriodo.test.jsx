import { render, screen, fireEvent } from '@testing-library/react';
import TablaResumenPeriodo from './TablaResumenPeriodo.jsx';

// T013 (feature 011, US1) — la tabla muestra los 7 indicadores por fila,
// distingue anomalías y expone selección de fila (US2).

function fila(over = {}) {
  return {
    legajo: 1,
    nombre: 'Ana Pérez',
    horasTrabajadas: 540,
    completas: 20,
    incompletas: 1,
    ausencias: 2,
    llegadasTarde: 3,
    retirosAnticipados: 1,
    correcciones: 1,
    anomalia: null,
    ...over,
  };
}

test('muestra una fila por empleado con los 7 indicadores', () => {
  render(<TablaResumenPeriodo filas={[fila()]} />);
  const filas = screen.getAllByRole('row').slice(1);
  expect(filas).toHaveLength(1);
  expect(filas[0]).toHaveTextContent('Ana Pérez');
  expect(filas[0]).toHaveTextContent('9:00'); // 540 min
  expect(filas[0]).toHaveTextContent('20'); // completas
  expect(filas[0]).toHaveTextContent('3'); // llegadasTarde
});

test('una fila con anomalía se muestra señalada, sin acumulados normales', () => {
  render(<TablaResumenPeriodo filas={[fila({ anomalia: 'categoría no configurada' })]} />);
  expect(screen.getByText(/Anomalía: categoría no configurada/)).toBeInTheDocument();
});

test('sin filas muestra un mensaje de vacío', () => {
  render(<TablaResumenPeriodo filas={[]} />);
  expect(screen.getByText(/No hay empleados esperados/)).toBeInTheDocument();
});

test('con onSeleccionar, clic en una fila sin anomalía la selecciona', () => {
  const onSeleccionar = vi.fn();
  render(<TablaResumenPeriodo filas={[fila()]} onSeleccionar={onSeleccionar} />);
  fireEvent.click(screen.getAllByRole('row')[1]);
  expect(onSeleccionar).toHaveBeenCalledWith(fila());
});

test('con onSeleccionar, clic en una fila con anomalía NO selecciona', () => {
  const onSeleccionar = vi.fn();
  render(
    <TablaResumenPeriodo filas={[fila({ anomalia: 'sin categoría' })]} onSeleccionar={onSeleccionar} />,
  );
  fireEvent.click(screen.getAllByRole('row')[1]);
  expect(onSeleccionar).not.toHaveBeenCalled();
});
