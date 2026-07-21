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

// mesActual = '202608' (posterior al período de vista(), '202607') por
// defecto: la mayoría de los tests ejercitan un período YA PASADO, que es
// cuando "Cerrar período" está disponible (ver test dedicado más abajo para
// el caso de un período que todavía no pasó).
function clienteMock(over = {}) {
  return {
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202607'], ultimo: '202607', mesActual: '202608' }),
    obtenerCalendario: vi.fn().mockResolvedValue(vista()),
    reclasificar: vi.fn(),
    generarCalendario: vi.fn(),
    cerrarPeriodo: vi.fn(),
    reabrirPeriodo: vi.fn(),
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

// 013-reestructurar-data-periodos (US3) — botón cerrar/reabrir + indicador.
test('un período abierto muestra "Cerrar período"; al hacer clic llama a cliente.cerrarPeriodo y refresca la vista', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({ cerrarPeriodo: vi.fn().mockResolvedValue(vistaCerrada) });
  render(<PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Período cerrado')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Cerrar período'));

  await waitFor(() => expect(cliente.cerrarPeriodo).toHaveBeenCalledWith('202607', { autor: 'ui' }));
  expect(await screen.findByText('Período cerrado')).toBeInTheDocument();
  expect(screen.getByText('Reabrir período')).toBeInTheDocument();
});

test('un período cerrado muestra el indicador y "Reabrir período"; al hacer clic llama a cliente.reabrirPeriodo', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const vistaReabierta = vista({ cerrado: false });
  const cliente = clienteMock({
    obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada),
    reabrirPeriodo: vi.fn().mockResolvedValue(vistaReabierta),
  });
  render(<PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.getByText('Período cerrado')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Reabrir período'));

  await waitFor(() => expect(cliente.reabrirPeriodo).toHaveBeenCalledWith('202607', { autor: 'ui' }));
  await waitFor(() => expect(screen.queryByText('Período cerrado')).not.toBeInTheDocument());
});

// "Cerrar período" no tiene sentido sobre el mes en curso (ni sobre uno
// futuro): solo se ofrece una vez que el período ya pasó.
test('un período que todavía no pasó (mes en curso) NO muestra "Cerrar período"', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202607'], ultimo: '202607', mesActual: '202607' }),
  });
  render(<PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Cerrar período')).not.toBeInTheDocument();
});

test('un período cerrado sigue mostrando "Reabrir período" aunque todavía sea el mes en curso', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202607'], ultimo: '202607', mesActual: '202607' }),
    obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada),
  });
  render(<PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Cerrar período')).not.toBeInTheDocument();
  expect(screen.getByText('Reabrir período')).toBeInTheDocument();
});
