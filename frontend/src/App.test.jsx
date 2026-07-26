import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';

// Feature 010: "Fichadas de hoy" es la pestaña inicial, así que se monta (y
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

function irAFichadasHoy() {
  fireEvent.click(screen.getByText('Fichadas de hoy'));
}

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

function clienteCalendarioMock(over = {}) {
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

// Doble clic en una celda del Calendario navega a "Fichadas de hoy" con la
// fecha de esa celda (sin recargar toda la página).
test('doble clic en una celda del calendario navega a "Fichadas de hoy" con esa fecha', async () => {
  const clienteFichadas = clienteFichadasMock();
  const clienteCalendario = clienteCalendarioMock();
  render(<App clienteFichadas={clienteFichadas} clienteCalendario={clienteCalendario} />);
  await screen.findByText(/Fichadas del/);
  clienteFichadas.obtenerFichadasHoy.mockClear();

  irACalendario();
  await screen.findByRole('grid');
  fireEvent.doubleClick(screen.getByRole('gridcell'));

  await screen.findByText(/Fichadas del/);
  await waitFor(() => expect(clienteFichadas.obtenerFichadasHoy).toHaveBeenCalledWith('2026-07-01'));
});

// Session state (sessionStorage): al volver a "Fichadas de hoy" por el menú
// de la izquierda (no por un nuevo doble clic), retoma la última fecha vista
// en vez de saltar a hoy.
test('volver a "Fichadas de hoy" por el menú retoma la última fecha vista (session state)', async () => {
  const clienteFichadas = clienteFichadasMock();
  const clienteCalendario = clienteCalendarioMock();
  render(<App clienteFichadas={clienteFichadas} clienteCalendario={clienteCalendario} />);
  await screen.findByText(/Fichadas del/);

  irACalendario();
  await screen.findByRole('grid');
  fireEvent.doubleClick(screen.getByRole('gridcell'));
  await waitFor(() => expect(clienteFichadas.obtenerFichadasHoy).toHaveBeenCalledWith('2026-07-01'));

  irACalendario();
  await screen.findByRole('grid');
  irAFichadasHoy();

  await waitFor(() => expect(clienteFichadas.obtenerFichadasHoy).toHaveBeenLastCalledWith('2026-07-01'));
});

// Session state (sessionStorage): al volver al Calendario por el menú de la
// izquierda, retoma el último período visto en vez de saltar siempre al
// último generado.
test('volver al Calendario por el menú retoma el último período visto (session state)', async () => {
  const clienteFichadas = clienteFichadasMock();
  const clienteCalendario = clienteCalendarioMock({
    listarCalendarios: vi
      .fn()
      .mockResolvedValue({ periodos: ['202606', '202607'], ultimo: '202607', mesActual: '202608' }),
  });
  render(<App clienteFichadas={clienteFichadas} clienteCalendario={clienteCalendario} />);
  await screen.findByText(/Fichadas del/);

  irACalendario();
  await screen.findByRole('grid');
  await waitFor(() => expect(clienteCalendario.obtenerCalendario).toHaveBeenLastCalledWith('202607'));

  fireEvent.click(screen.getByLabelText('Mes anterior'));
  await waitFor(() => expect(clienteCalendario.obtenerCalendario).toHaveBeenLastCalledWith('202606'));

  irAFichadasHoy();
  await screen.findByText(/Fichadas del/);
  irACalendario();
  await screen.findByRole('grid');

  await waitFor(() => expect(clienteCalendario.obtenerCalendario).toHaveBeenLastCalledWith('202606'));
});

test('sin prop "clienteCalendario" (uso real, como main.jsx) no entra en loop infinito de fetch', async () => {
  // Regresión: `clienteCalendario = crearClienteCalendario()` como default de parámetro
  // se reevaluaba en cada render, invalidando useCallback/useEffect en cascada
  // y disparando fetch sin fin. Acá se ejercita el default real (sin mock de
  // clienteCalendario), solo interceptando `fetch` global.
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
