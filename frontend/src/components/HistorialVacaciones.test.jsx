import { render, screen, fireEvent } from '@testing-library/react';
import HistorialVacaciones from './HistorialVacaciones.jsx';

// spec 015 (US2, Acceptance Scenario 2) — cada movimiento con fecha,
// cantidad de días y saldo resultante en ese momento.

const MOVIMIENTOS = [
  { tipo: 'incremento', fecha: '2025-11-01', dias: 21, saldoResultante: 21, antiguedadAnios: 6, asignacionId: null, autor: null },
  { tipo: 'asignacion', fecha: '2026-01-10', dias: -21, saldoResultante: 0, asignacionId: 'a1', autor: 'rrhh.mgomez' },
];

test('muestra cada movimiento con fecha, tipo, días y saldo resultante', () => {
  render(<HistorialVacaciones movimientos={MOVIMIENTOS} />);
  const filas = screen.getAllByRole('row').slice(1);
  expect(filas).toHaveLength(2);
  expect(filas[0]).toHaveTextContent('2025-11-01');
  expect(filas[0]).toHaveTextContent('Incremento anual');
  expect(filas[0]).toHaveTextContent('21');
  expect(filas[1]).toHaveTextContent('2026-01-10');
  expect(filas[1]).toHaveTextContent('Asignación');
  expect(filas[1]).toHaveTextContent('-21');
});

test('sin movimientos muestra un mensaje de vacío', () => {
  render(<HistorialVacaciones movimientos={[]} />);
  expect(screen.getByText(/Sin movimientos registrados/)).toBeInTheDocument();
});

// spec 015 (US4) — acción de revertir sobre una asignación vigente.
const ASIGNACIONES = [
  { id: 'a1', fechaInicio: '2026-01-10', fechaFin: '2026-01-30', cantidadDias: 21, vigente: true },
  { id: 'a2', fechaInicio: '2025-06-01', fechaFin: '2025-06-05', cantidadDias: 5, vigente: false },
];

test('muestra las asignaciones con su estado y un botón Revertir solo para la vigente', () => {
  const onRevertir = vi.fn();
  render(<HistorialVacaciones movimientos={MOVIMIENTOS} asignaciones={ASIGNACIONES} onRevertir={onRevertir} />);
  expect(screen.getByText('Vigente')).toBeInTheDocument();
  expect(screen.getByText('Revertida')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Revertir' })).toHaveLength(1);
});

test('clic en Revertir invoca onRevertir con el id de la asignación', () => {
  const onRevertir = vi.fn();
  render(<HistorialVacaciones movimientos={MOVIMIENTOS} asignaciones={ASIGNACIONES} onRevertir={onRevertir} />);
  fireEvent.click(screen.getByRole('button', { name: 'Revertir' }));
  expect(onRevertir).toHaveBeenCalledWith('a1');
});

test('sin onRevertir, no se muestra ningún botón de acción', () => {
  render(<HistorialVacaciones movimientos={MOVIMIENTOS} asignaciones={ASIGNACIONES} />);
  expect(screen.queryByRole('button', { name: 'Revertir' })).not.toBeInTheDocument();
});
