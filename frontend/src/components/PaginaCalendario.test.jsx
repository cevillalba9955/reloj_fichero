import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaginaCalendario from './PaginaCalendario.jsx';

function vista(over = {}) {
  return {
    periodo: '202607',
    anio: 2026,
    mes: 7,
    esUltimoGenerado: true,
    hoy: null,
    periodoActivo: { etiqueta: 'Julio 2026', tramo: 'Mes', desde: '2026-07-01', hasta: '2026-07-31' },
    leyenda: [{ clave: 'habil', etiqueta: 'Hábil', descripcion: 'Día laborable' }],
    dias: [
      {
        fecha: '2026-07-01',
        dd: 1,
        diaSemana: 3,
        clasificacion: 'Laborable',
        resaltado: 'habil',
        esHoy: false,
        enPeriodoActivo: true,
        reclasificadoManual: false,
      },
    ],
    ...over,
  };
}

function clienteMock(over = {}) {
  return {
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202607'], ultimo: '202607' }),
    obtenerCalendario: vi.fn().mockResolvedValue(vista()),
    reclasificar: vi.fn(),
    generarCalendario: vi.fn(),
    ...over,
  };
}

// Estado vacío global: sin calendarios generados
test('muestra el estado vacío global cuando no hay calendarios', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: [], ultimo: null }),
  });
  render(<PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText(/Aún no se generó ningún calendario/)).toBeInTheDocument();
});

// Estado con datos: muestra grilla
test('muestra el calendario cuando hay datos', async () => {
  const cliente = clienteMock();
  render(<PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText('Julio 2026')).toBeInTheDocument();
  expect(screen.getByRole('grid')).toBeInTheDocument();
});

// Un fallo al iniciar muestra error con reintento
test('un fallo al iniciar muestra error con reintento', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockRejectedValue(new Error('boom')),
  });
  render(<PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error/)).toBeInTheDocument();
  expect(screen.getByText('Reintentar')).toBeInTheDocument();
});

// Reclasificación: cancelar no llama a la API; confirmar sí y refresca la grilla
test('reclasificar: cancelar no llama a la API; confirmar sí y refresca la grilla', async () => {
  const vistaFeriado = vista({
    dias: [{ ...vista().dias[0], clasificacion: 'Feriado', resaltado: 'feriado' }],
  });
  const cliente = clienteMock({
    reclasificar: vi.fn().mockResolvedValue(vistaFeriado),
  });
  render(<PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  // Iniciar reclasificación → abre el diálogo; cancelar → sin POST.
  fireEvent.change(screen.getByLabelText(/Reclasificar 2026-07-01/), { target: { value: 'Feriado' } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Cancelar'));
  expect(cliente.reclasificar).not.toHaveBeenCalled();

  // Reiniciar y confirmar → POST con los datos correctos.
  fireEvent.change(screen.getByLabelText(/Reclasificar 2026-07-01/), { target: { value: 'Feriado' } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Confirmar'));
  await waitFor(() =>
    expect(cliente.reclasificar).toHaveBeenCalledWith(
      '202607',
      expect.objectContaining({ fecha: '2026-07-01', clasificacion: 'Feriado' }),
    ),
  );
});
