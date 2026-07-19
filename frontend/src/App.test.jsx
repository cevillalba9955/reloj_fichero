import { render, screen, fireEvent } from '@testing-library/react';
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
