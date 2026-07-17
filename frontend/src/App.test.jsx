import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';

// T014 + flujo US3/US4 (feature 007) — App: carga del último mes, estados
// vacío-global/error, y flujo de reclasificación (cancelar no llama a la API;
// confirmar sí y refresca). FR-011/016/017.

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
    ...over,
  };
}

// feature 010: "Fichadas de hoy" es la pestaña inicial, así que se monta (y
// fetchea) en todos estos tests aunque solo ejerciten el calendario. Un mock
// dedicado la mantiene hermética y fuera del conteo de fetches del calendario.
function clienteFichadasMock(over = {}) {
  return {
    obtenerFichadasHoy: vi.fn().mockResolvedValue({
      fecha: '2026-07-17',
      periodo: '202607',
      diaClasificacion: 'Laborable',
      empleados: [],
    }),
    ...over,
  };
}

function irACalendario() {
  fireEvent.click(screen.getByText('Calendario'));
}

test('sin prop "cliente" (uso real, como main.jsx) no entra en loop infinito de fetch', async () => {
  // Regresión: `cliente = crearClienteCalendario()` como default de parámetro
  // se reevaluaba en cada render, invalidando useCallback/useEffect en cascada
  // y disparando fetch sin fin. Acá se ejercita el default real (sin mock de
  // cliente), solo interceptando `fetch` global.
  const fetchMock = vi.fn(async (url) => {
    const body = String(url).endsWith('/calendarios')
      ? { periodos: ['202607'], ultimo: '202607' }
      : vista();
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);

  render(<App clienteFichadas={clienteFichadasMock()} />);
  irACalendario();
  await screen.findByRole('grid');

  // Deja pasar un ciclo de microtasks/efectos extra: si hubiera loop, la
  // cantidad de llamadas seguiría creciendo.
  await new Promise((r) => setTimeout(r, 50));
  expect(fetchMock).toHaveBeenCalledTimes(2);

  vi.unstubAllGlobals();
});

test('sin ningún calendario muestra el estado vacío global', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: [], ultimo: null }),
  });
  render(<App cliente={cliente} clienteFichadas={clienteFichadasMock()} />);
  irACalendario();
  expect(await screen.findByText(/Aún no se generó ningún calendario/)).toBeInTheDocument();
});

test('carga y muestra el último mes generado', async () => {
  const cliente = clienteMock();
  render(<App cliente={cliente} clienteFichadas={clienteFichadasMock()} />);
  irACalendario();
  expect(await screen.findByRole('grid')).toBeInTheDocument();
  expect(cliente.obtenerCalendario).toHaveBeenCalledWith('202607');
  expect(screen.getByText('Julio 2026')).toBeInTheDocument();
});

test('un fallo al iniciar muestra error con reintento', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockRejectedValue(new Error('boom')),
  });
  render(<App cliente={cliente} clienteFichadas={clienteFichadasMock()} />);
  irACalendario();
  expect(await screen.findByText(/Ocurrió un error/)).toBeInTheDocument();
  expect(screen.getByText('Reintentar')).toBeInTheDocument();
});

test('reclasificar: cancelar no llama a la API; confirmar sí y refresca la grilla', async () => {
  const vistaFeriado = vista({
    dias: [{ ...vista().dias[0], clasificacion: 'Feriado', resaltado: 'feriado' }],
  });
  const cliente = clienteMock({
    reclasificar: vi.fn().mockResolvedValue(vistaFeriado),
  });
  render(<App cliente={cliente} clienteFichadas={clienteFichadasMock()} />);
  irACalendario();
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
