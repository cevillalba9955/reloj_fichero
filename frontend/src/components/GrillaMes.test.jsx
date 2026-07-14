import { render, screen } from '@testing-library/react';
import GrillaMes from './GrillaMes.jsx';

// T015 (feature 007) — GrillaMes: una celda por día y huecos iniciales según el
// diaSemana del día 1 (sin días de meses vecinos). SC-007 / FR-002.

function dias() {
  // día 1 con diaSemana=3 (miércoles) → 3 huecos; 5 días de ejemplo.
  return [3, 4, 5, 6, 0].map((dow, i) => ({
    fecha: `2026-07-0${i + 1}`,
    dd: i + 1,
    diaSemana: dow,
    clasificacion: 'Laborable',
    resaltado: 'habil',
    esHoy: false,
    enPeriodoActivo: true,
    reclasificadoManual: false,
  }));
}

test('renderiza una celda por día', () => {
  render(<GrillaMes dias={dias()} />);
  expect(screen.getAllByRole('gridcell')).toHaveLength(5);
});

test('inserta tantos huecos como el diaSemana del día 1', () => {
  const { container } = render(<GrillaMes dias={dias()} />);
  expect(container.querySelectorAll('.celda-vacia')).toHaveLength(3);
});

test('renderiza 7 encabezados de día de semana', () => {
  render(<GrillaMes dias={dias()} />);
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
});

test('sin días no renderiza nada', () => {
  const { container } = render(<GrillaMes dias={[]} />);
  expect(container.querySelector('.grilla')).toBeNull();
});
