import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderConRol } from '../test-utils/rol.jsx';
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

// 021-informe-asistencia-mensual — stub del cliente del informe mensual
// (tramo `Mes`). Por defecto "no emitido", para que la acción no ensucie los
// tests que sólo miran el indicador de período cerrado.
const informeNoEmitido = () =>
  Object.assign(new Error('no emitido'), { codigo: 'INFORME_NO_EMITIDO', status: 404 });

function informeMock(over = {}) {
  return {
    obtenerMensual: vi.fn().mockRejectedValue(informeNoEmitido()),
    emitirMensual: vi.fn(),
    ...over,
  };
}

// Estado vacío global: sin calendarios generados
test('muestra el estado vacío global cuando no hay calendarios', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: [], ultimo: null }),
  });
  renderConRol('editor', <PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText(/Aún no se generó ningún calendario/)).toBeInTheDocument();
});

// Estado con datos: muestra grilla
test('muestra el calendario cuando hay datos', async () => {
  const cliente = clienteMock();
  renderConRol('editor', <PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText('Julio 2026')).toBeInTheDocument();
  expect(screen.getByRole('grid')).toBeInTheDocument();
});

// Un fallo al iniciar muestra error con reintento
test('un fallo al iniciar muestra error con reintento', async () => {
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockRejectedValue(new Error('boom')),
  });
  renderConRol('editor', <PaginaCalendario cliente={cliente} />);
  expect(await screen.findByText(/Ocurrió un error/)).toBeInTheDocument();
  expect(screen.getByText('Reintentar')).toBeInTheDocument();
});

// Reclasificación: el ícono abre un modal para elegir la opción, que a su vez
// abre el diálogo de confirmación (cancelar no llama a la API; confirmar sí).
async function elegirReclasificacion(opcion) {
  fireEvent.click(screen.getByLabelText(/Reclasificar 2026-07-01/));
  const selector = await screen.findByRole('dialog', { name: /Reclasificar 2026-07-01/ });
  fireEvent.click(within(selector).getByText(opcion));
  await screen.findByRole('dialog', { name: 'Confirmar reclasificación' });
}

test('reclasificar: cancelar no llama a la API; confirmar sí y refresca la grilla', async () => {
  const vistaFeriado = vista({
    dias: [{ ...vista().dias[0], clasificacion: 'Feriado', resaltado: 'feriado' }],
  });
  const cliente = clienteMock({
    reclasificar: vi.fn().mockResolvedValue(vistaFeriado),
  });
  renderConRol('editor', <PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  // Iniciar reclasificación (ícono → modal de selección → diálogo de
  // confirmación); cancelar → sin POST.
  await elegirReclasificacion('Feriado');
  fireEvent.click(screen.getByText('Cancelar'));
  expect(cliente.reclasificar).not.toHaveBeenCalled();

  // Reiniciar y confirmar → POST con los datos correctos.
  await elegirReclasificacion('Feriado');
  fireEvent.click(screen.getByText('Confirmar'));
  await waitFor(() =>
    expect(cliente.reclasificar).toHaveBeenCalledWith(
      '202607',
      expect.objectContaining({ fecha: '2026-07-01', clasificacion: 'Feriado' }),
    ),
  );
});

// El ícono de reclasificar no debe ofrecerse sobre un período cerrado.
test('con el período cerrado, no se ofrece el ícono de reclasificar', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({ obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada) });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={informeMock()} />);
  await screen.findByRole('grid');

  expect(screen.queryByLabelText(/Reclasificar 2026-07-01/)).not.toBeInTheDocument();
});

// 013-reestructurar-data-periodos (US3) — botón cerrar/reabrir + indicador.
test('un período abierto muestra "Cerrar período"; al hacer clic llama a cliente.cerrarPeriodo y refresca la vista', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({ cerrarPeriodo: vi.fn().mockResolvedValue(vistaCerrada) });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={informeMock()} />);
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
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={informeMock()} />);
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
  renderConRol('editor', <PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Cerrar período')).not.toBeInTheDocument();
});

// Doble clic en una celda navega a "Fichadas de hoy" con esa fecha (vía
// `onIrAFichadas`, provisto por App.jsx).
test('doble clic en una celda llama a onIrAFichadas con la fecha de esa celda', async () => {
  const cliente = clienteMock();
  const onIrAFichadas = vi.fn();
  renderConRol('editor', <PaginaCalendario cliente={cliente} onIrAFichadas={onIrAFichadas} />);
  await screen.findByRole('grid');

  fireEvent.doubleClick(screen.getByRole('gridcell'));
  expect(onIrAFichadas).toHaveBeenCalledWith('2026-07-01');
});

test('un período cerrado sigue mostrando "Reabrir período" aunque todavía sea el mes en curso', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202607'], ultimo: '202607', mesActual: '202607' }),
    obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada),
  });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={informeMock()} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Cerrar período')).not.toBeInTheDocument();
  expect(screen.getByText('Reabrir período')).toBeInTheDocument();
});

// feature 016 (FR-005/FR-011) — rol lector: ve la grilla, pero ni "Cerrar
// período" ni el ícono de reclasificar están disponibles.
test('rol lector: no se ofrecen "Cerrar período" ni el ícono de reclasificar', async () => {
  const cliente = clienteMock();
  renderConRol('lector', <PaginaCalendario cliente={cliente} />);
  await screen.findByRole('grid');

  expect(screen.queryByText('Cerrar período')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Reclasificar 2026-07-01/)).not.toBeInTheDocument();
});

// ===========================================================================
// 021-informe-asistencia-mensual — acción "informe mensual" en el Calendario
// ===========================================================================

function vistaInformeMensual(over = {}) {
  return {
    periodoId: '202607',
    sello: { periodoId: '202607', tramo: 'Mes', modo: 'automatico', emitidoEn: '2026-08-01T10:00:00.000Z', autor: 'ana' },
    obsoleto: false,
    resumen: {
      encabezado: {
        periodoId: '202607', tramo: 'Mes', modo: 'QUINCENAL', empleados: 1, totalHoras: 480,
        totalHorasComputadas: 480, totalAusencias: 0, totalHorasEsperadas: 480, presentismoGeneral: 1,
        rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' },
      },
      filas: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Quincenal', horasTrabajadas: 480, presentismoIndividual: 1, completas: 1, incompletas: 0, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 0, feriado: 0, licencia: 0, vacaciones: 0, anomalia: null },
      ],
    },
    detalle: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 1 },
      secciones: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Quincenal', anomalia: null, subtotalHoras: 480, dias: [
          { fecha: '2026-07-01', diaSemana: 'Miércoles', clasificacion: 'Laborable', estado: 'Completa', entrada: '07:00', salida: '15:00', horas: 480, llegadaTarde: false, corregida: false, pausas: [], justificacion: null, requiereJustificacionRevision: false },
        ] },
      ],
    },
    pendientes: { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] },
    ...over,
  };
}

// US1 — con el período cerrado, la acción del informe mensual aparece en la
// página y "Ver informe" abre la vista imprimible.
test('US1: con el período cerrado, ofrece ver y descargar el informe mensual', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({ obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada) });
  const clienteInforme = informeMock({ obtenerMensual: vi.fn().mockResolvedValue(vistaInformeMensual()) });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={clienteInforme} />);
  await screen.findByRole('grid');

  expect(await screen.findByRole('button', { name: 'Ver informe' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
  // pide el tramo mensual del período mostrado (YYYYMM, sin sufijo de quincena)
  expect(clienteInforme.obtenerMensual).toHaveBeenCalledWith('202607');

  fireEvent.click(screen.getByRole('button', { name: 'Ver informe' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

// US3 — la acción NO aparece si el período no está cerrado…
test('US3: sin cerrar el período, no se ofrece el informe mensual', async () => {
  const cliente = clienteMock(); // vista() por defecto: abierto
  const clienteInforme = informeMock({ obtenerMensual: vi.fn().mockResolvedValue(vistaInformeMensual()) });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={clienteInforme} />);
  await screen.findByRole('grid');

  expect(screen.queryByRole('button', { name: 'Ver informe' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
  expect(clienteInforme.obtenerMensual).not.toHaveBeenCalled();
});

// …ni en el estado "mes sin calendario generado".
test('US3: en el estado vacío-mes no se ofrece el informe mensual', async () => {
  const noGenerado = Object.assign(new Error('sin calendario'), { status: 404 });
  const cliente = clienteMock({
    listarCalendarios: vi.fn().mockResolvedValue({ periodos: ['202605'], ultimo: '202605', mesActual: '202608' }),
    obtenerCalendario: vi.fn().mockRejectedValue(noGenerado),
  });
  const clienteInforme = informeMock({ obtenerMensual: vi.fn() });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={clienteInforme} />);
  await screen.findByText(/aún no fue generado/i);

  expect(screen.queryByRole('button', { name: 'Ver informe' })).not.toBeInTheDocument();
  expect(clienteInforme.obtenerMensual).not.toHaveBeenCalled();
});

// US3 — copia guardada obsoleta tras reabrir: se muestra el aviso.
test('US3: si el informe mensual guardado quedó obsoleto, se muestra el aviso', async () => {
  const vistaCerrada = vista({ cerrado: true, cierre: { autor: 'ui', fechaHora: '2026-07-20T00:00:00.000Z' } });
  const cliente = clienteMock({ obtenerCalendario: vi.fn().mockResolvedValue(vistaCerrada) });
  const clienteInforme = informeMock({
    obtenerMensual: vi.fn().mockResolvedValue(vistaInformeMensual({ obsoleto: true })),
  });
  renderConRol('editor', <PaginaCalendario cliente={cliente} clienteInforme={clienteInforme} />);
  await screen.findByRole('grid');

  expect(await screen.findByText(/quedó desactualizado/)).toBeInTheDocument();
});
