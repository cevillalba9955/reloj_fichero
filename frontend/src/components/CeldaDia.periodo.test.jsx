import { render, screen } from '@testing-library/react';
import CeldaDia from './CeldaDia.jsx';

// T025 (feature 007) — CeldaDia: la pertenencia al período activo produce una
// distinción diferenciable de la clasificación. FR-009.

function dia(over = {}) {
  return {
    fecha: '2026-07-01',
    dd: 1,
    diaSemana: 3,
    clasificacion: 'Laborable',
    reclasificadoManual: false,
    esHoy: false,
    enPeriodoActivo: false,
    resaltado: 'habil',
    ...over,
  };
}

test('enPeriodoActivo=true marca la celda y lo dice en el aria-label', () => {
  render(<CeldaDia dia={dia({ enPeriodoActivo: true })} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveAttribute('data-en-periodo', 'true');
  expect(celda.getAttribute('aria-label')).toContain('en período activo');
});

test('enPeriodoActivo=false no marca la celda', () => {
  render(<CeldaDia dia={dia({ enPeriodoActivo: false })} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveAttribute('data-en-periodo', 'false');
  expect(celda.getAttribute('aria-label')).not.toContain('período activo');
});
