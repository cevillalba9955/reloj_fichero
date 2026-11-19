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
    feriado: 0,
    licencia: 0,
    vacaciones: 0,
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

// issue #40 — "<Días> (<Horas>)" en Presentes, Ausencias, Feriados, Licencia,
// Tarde y Retiros; celda vacía si los días son cero.
test('muestra Días (Horas) y deja vacía la celda cuando los días son cero', () => {
  const horasPor = { presentes: 480, ausencias: 0, feriado: 480, licencia: 0 };
  const descuentoPor = { tarde: 90, retiros: 0 };
  render(
    <TablaResumenPeriodo
      filas={[
        fila({ completas: 1, ausencias: 2, feriado: 1, licencia: 0, llegadasTarde: 1, retirosAnticipados: 0, horasPor, descuentoPor }),
      ]}
    />,
  );
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[3]).toHaveTextContent('1 (8:00)'); // Presentes
  expect(celdas[4]).toHaveTextContent('1 (8:00)'); // Feriados
  expect(celdas[5].textContent).toBe(''); // Licencia en cero
  expect(celdas[7]).toHaveTextContent('1 (-1 hora 30 min)'); // Tarde: descuento en negativo, texto largo
  expect(celdas[8].textContent).toBe(''); // Retiros en cero
  expect(celdas[9].textContent).toBe('2'); // Ausencias (última columna): solo días, sin horas
});

test('Tarde y Retiros muestran el descuento en texto largo: "30 min", "4 horas"', () => {
  render(
    <TablaResumenPeriodo
      filas={[fila({ llegadasTarde: 1, retirosAnticipados: 1, descuentoPor: { tarde: 30, retiros: 240 } })]}
    />,
  );
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[7].textContent).toBe('1 (-30 min)');
  expect(celdas[8].textContent).toBe('1 (-4 horas)');
});

// feature 012 (FR-012) — columnas Feriados y Licencia.
test('muestra las columnas Feriados y Licencia', () => {
  render(<TablaResumenPeriodo filas={[fila({ feriado: 2, licencia: 3 })]} />);
  const encabezados = screen.getAllByRole('columnheader').map((th) => th.textContent);
  expect(encabezados).toContain('Feriados');
  expect(encabezados).toContain('Licencia');
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  // Leg, Empleado, Horas, Presentes, Feriados, Licencia, Vacaciones, Tarde, Retiros, Ausencias.
  expect(celdas[4]).toHaveTextContent('2');
  expect(celdas[5]).toHaveTextContent('3');
});

// spec 015 — columna Vacaciones (días con la Justificación-espejo de una
// Asignación de Vacaciones, excluidos de Ausencias).
test('muestra la columna Vacaciones', () => {
  render(<TablaResumenPeriodo filas={[fila({ vacaciones: 5 })]} />);
  const encabezados = screen.getAllByRole('columnheader').map((th) => th.textContent);
  expect(encabezados).toContain('Vacaciones');
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[6]).toHaveTextContent('5');
});

test('Vacaciones muestra los días con el rango asignado: "7 [02 al 08]"', () => {
  const rangos = [{ desde: '2026-11-02', hasta: '2026-11-08' }];
  render(<TablaResumenPeriodo filas={[fila({ vacaciones: 7, rangosVacaciones: rangos })]} />);
  expect(screen.getAllByRole('row')[1].querySelectorAll('td')[6].textContent).toBe('7 [02 al 08]');
});

test('Vacaciones con varios rangos y un día suelto', () => {
  const rangos = [
    { desde: '2026-11-02', hasta: '2026-11-04' },
    { desde: '2026-11-20', hasta: '2026-11-20' },
  ];
  render(<TablaResumenPeriodo filas={[fila({ vacaciones: 4, rangosVacaciones: rangos })]} />);
  expect(screen.getAllByRole('row')[1].querySelectorAll('td')[6].textContent).toBe('4 [02 al 04, 20]');
});

test('Vacaciones deja la celda vacía cuando es cero', () => {
  render(<TablaResumenPeriodo filas={[fila({ vacaciones: 0 })]} />);
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[6].textContent).toBe('');
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
