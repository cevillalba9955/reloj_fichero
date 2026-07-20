import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PaginaFichadasHoy from './PaginaFichadasHoy.jsx';

// T016 (feature 010, US1) — la página carga la vista al montar, muestra el
// error con reintento, y renderiza la tabla con los datos recibidos.

function vista(over = {}) {
  return {
    fecha: '2026-07-16',
    periodo: '202607',
    diaClasificacion: 'Laborable',
    navegacion: { anterior: '2026-07-15', siguiente: null, esHoy: true },
    empleados: [
      {
        legajo: 1,
        nombre: 'Ana Pérez',
        entrada: '07:05',
        salida: null,
        horasTrabajadas: 0,
        situacion: 'PRESENTE',
        correccionVigente: false,
        pausas: [],
        anomalias: [],
      },
    ],
    ...over,
  };
}

function clienteMock(over = {}) {
  return {
    obtenerFichadasHoy: vi.fn().mockResolvedValue(vista()),
    corregir: vi.fn(),
    agregarPausa: vi.fn(),
    registrarRetiroAnticipado: vi.fn(),
    consultarReloj: vi.fn(),
    ...over,
  };
}

test('carga la vista al montar y muestra la tabla', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByRole('table')).toBeInTheDocument();
  expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Fichadas del 2026-07-16/)).toBeInTheDocument();
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
});

// T065 (US5, iteración 2) — navegar al día anterior recarga la vista de esa
// fecha; el botón de consultar reloj solo aparece en el día actual.
test('navegar al día anterior recarga la vista de esa fecha', async () => {
  const vistaAyer = vista({
    fecha: '2026-07-15',
    navegacion: { anterior: '2026-07-14', siguiente: '2026-07-16', esHoy: false },
  });
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn((fecha) =>
      Promise.resolve(fecha === '2026-07-15' ? vistaAyer : vista()),
    ),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByText(/Fichadas del 2026-07-16/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('← Día anterior'));
  expect(await screen.findByText(/Fichadas del 2026-07-15/)).toBeInTheDocument();
  expect(cliente.obtenerFichadasHoy).toHaveBeenLastCalledWith('2026-07-15');
});

test('el botón de consultar reloj no aparece cuando el día mostrado no es hoy', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn().mockResolvedValue(
      vista({ navegacion: { anterior: '2026-07-14', siguiente: '2026-07-16', esHoy: false } }),
    ),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');
  expect(screen.queryByText(/Consultar reloj/i)).not.toBeInTheDocument();
});

// T071 (iteración 2, FR-018) — los formularios de edición se abren como modal.
test('Corregir abre el formulario dentro de un diálogo modal y Escape lo cierra sin efecto', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Corregir'));
  const dialogo = screen.getByRole('dialog');
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
  expect(dialogo).toHaveTextContent(/Corregir horarios/);

  fireEvent.keyDown(dialogo, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(cliente.corregir).not.toHaveBeenCalled();
});

test('Pausa / Retiro abre su formulario dentro de un diálogo modal', async () => {
  const cliente = clienteMock();
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Excepcion'));
  const dialogo = screen.getByRole('dialog');
  expect(dialogo).toHaveAttribute('aria-modal', 'true');
});

// feature 012 — el botón general "Justificar ausencia" carga el catálogo de
// motivos recién al abrirse (no en el montaje de la página) y permite
// registrar una Justificación sin depender de una fila existente.
function clienteJustificacionesMock(over = {}) {
  return {
    obtenerMotivos: vi.fn().mockResolvedValue({
      motivos: [{ id: 'vacaciones', etiqueta: 'Vacaciones', tipoPago: 'Paga' }],
    }),
    crearJustificacion: vi.fn().mockResolvedValue({ registradas: [{ fecha: '2026-08-03' }], omitidas: [], noAplicables: [] }),
    revertirJustificacion: vi.fn().mockResolvedValue({ fecha: '2026-07-16', revertida: true }),
    ...over,
  };
}

test('"Justificar ausencia" abre el diálogo, carga motivos recién al abrir y guarda', async () => {
  const cliente = clienteMock();
  const clienteJustificaciones = clienteJustificacionesMock();
  render(<PaginaFichadasHoy cliente={cliente} clienteJustificaciones={clienteJustificaciones} />);
  await screen.findByRole('table');
  expect(clienteJustificaciones.obtenerMotivos).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Justificar ausencia'));
  const dialogo = await screen.findByRole('dialog');
  expect(clienteJustificaciones.obtenerMotivos).toHaveBeenCalledTimes(1);

  fireEvent.change(within(dialogo).getByLabelText('Legajo'), { target: { value: '5' } });
  fireEvent.change(within(dialogo).getByLabelText(/^Fecha/), { target: { value: '2026-08-03' } });
  fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'vacaciones' } });
  fireEvent.click(within(dialogo).getByText('Guardar'));

  await waitFor(() =>
    expect(clienteJustificaciones.crearJustificacion).toHaveBeenCalledWith(5, {
      fecha: '2026-08-03',
      hasta: null,
      motivoId: 'vacaciones',
      autor: 'ui',
    }),
  );
  await waitFor(() => expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(2));
});

test('el botón "Justificación" de una fila precarga legajo y la fecha del día mostrado (no solo la fila)', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn().mockResolvedValue(
      vista({
        fecha: '2026-07-20',
        empleados: [
          {
            legajo: 35,
            nombre: 'Villar José',
            entrada: null,
            salida: null,
            horasTrabajadas: 0,
            situacion: 'AUSENTE',
            correccionVigente: false,
            pausas: [],
            anomalias: [],
          },
        ],
      }),
    ),
  });
  const clienteJustificaciones = clienteJustificacionesMock();
  render(<PaginaFichadasHoy cliente={cliente} clienteJustificaciones={clienteJustificaciones} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Justificación'));
  const dialogo = await screen.findByRole('dialog');
  // La fila de "Fichadas de hoy" (FilaFichadaHoy) no trae `fecha` propia: la
  // fecha del día se toma de `estado.vista.fecha` (regresión encontrada en
  // verificación manual — la fila solo tiene legajo/nombre/entrada/salida/...).
  expect(within(dialogo).getByLabelText(/^Fecha/)).toHaveValue('2026-07-20');

  fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'vacaciones' } });
  fireEvent.click(within(dialogo).getByText('Guardar'));

  await waitFor(() =>
    expect(clienteJustificaciones.crearJustificacion).toHaveBeenCalledWith(35, {
      fecha: '2026-07-20',
      hasta: null,
      motivoId: 'vacaciones',
      autor: 'ui',
    }),
  );
});

test('el botón "Revertir justificación" de una fila llama al cliente y recarga', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi.fn().mockResolvedValue(
      vista({
        empleados: [
          {
            legajo: 1,
            nombre: 'Ana Pérez',
            entrada: null,
            salida: null,
            horasTrabajadas: 540,
            situacion: 'AUSENTE',
            correccionVigente: false,
            justificacion: { motivoId: 'vacaciones', etiquetaMotivo: 'Vacaciones', tipoPago: 'Paga' },
            pausas: [],
            anomalias: [],
          },
        ],
      }),
    ),
  });
  const clienteJustificaciones = clienteJustificacionesMock();
  render(<PaginaFichadasHoy cliente={cliente} clienteJustificaciones={clienteJustificaciones} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Revertir justificación'));
  await waitFor(() =>
    expect(clienteJustificaciones.revertirJustificacion).toHaveBeenCalledWith(1, {
      fecha: '2026-07-16',
      autor: 'ui',
    }),
  );
  await waitFor(() => expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(2));
});

test('un fallo de carga muestra el error y Reintentar vuelve a pedir', async () => {
  const cliente = clienteMock({
    obtenerFichadasHoy: vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(vista()),
  });
  render(<PaginaFichadasHoy cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error: boom/)).toBeInTheDocument();

  fireEvent.click(screen.getByText('Reintentar'));
  await waitFor(() => expect(cliente.obtenerFichadasHoy).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});
