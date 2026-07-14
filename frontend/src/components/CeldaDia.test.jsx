import { render, screen } from '@testing-library/react';
import CeldaDia from './CeldaDia.jsx';

// T016 (feature 007) — CeldaDia: clasificación con 2º recurso (texto/aria),
// marca de hoy por forma. FR-003/004/007.

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

test('un día Laborable muestra "Hábil" como texto y en el aria-label', () => {
  render(<CeldaDia dia={dia()} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveTextContent('Hábil');
  expect(celda.getAttribute('aria-label')).toContain('Hábil');
  expect(celda).toHaveAttribute('data-resaltado', 'habil');
});

test('un día Feriado se distingue por texto y resaltado', () => {
  render(<CeldaDia dia={dia({ clasificacion: 'Feriado', resaltado: 'feriado' })} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveTextContent('Feriado');
  expect(celda).toHaveAttribute('data-resaltado', 'feriado');
});

test('esHoy marca el día (forma) y expone data-es-hoy=true', () => {
  render(<CeldaDia dia={dia({ esHoy: true })} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveAttribute('data-es-hoy', 'true');
  expect(celda.getAttribute('aria-label')).toContain('hoy');
});

test('sin esHoy no se marca como hoy', () => {
  render(<CeldaDia dia={dia({ esHoy: false })} />);
  const celda = screen.getByRole('gridcell');
  expect(celda).toHaveAttribute('data-es-hoy', 'false');
});
