import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccionInformeCierre from './AccionInformeCierre.jsx';

// 018-informe-cierre-periodo — el informe se genera solo al cerrar el período
// (no hay botón "Emitir"); en la página Resumen se puede "Ver informe" y
// "Descargar PDF", y esas acciones sólo aparecen si el período está cerrado y
// existe una copia guardada.

function vistaInforme(over = {}) {
  return {
    periodoId: '202607',
    sello: { periodoId: '202607', tramo: 'Mes', modo: 'automatico', emitidoEn: '2026-08-01T10:00:00.000Z', autor: 'ana' },
    obsoleto: false,
    resumen: {
      encabezado: {
        periodoId: '202607', tramo: 'Mes', empleados: 1, totalHoras: 480, totalAusencias: 0,
        totalHorasEsperadas: 480, presentismoGeneral: 1,
        rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' },
      },
      filas: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Mensual', horasTrabajadas: 480, presentismoIndividual: 1, completas: 1, incompletas: 0, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 0, feriado: 0, licencia: 0, vacaciones: 0, anomalia: null },
      ],
    },
    detalle: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 1 },
      secciones: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Mensual', anomalia: null, subtotalHoras: 480, dias: [
          { fecha: '2026-07-01', diaSemana: 'Miércoles', clasificacion: 'Laborable', estado: 'Completa', entrada: '07:00', salida: '15:00', horas: 480, llegadaTarde: false, corregida: false, pausas: [], justificacion: null, requiereJustificacionRevision: false },
        ] },
      ],
    },
    pendientes: { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] },
    ...over,
  };
}

const noEmitido = () => Object.assign(new Error('no emitido'), { codigo: 'INFORME_NO_EMITIDO', status: 404 });

test('período abierto → sólo una nota, sin botones', async () => {
  const cliente = { obtener: vi.fn().mockRejectedValue(noEmitido()) };
  render(<AccionInformeCierre periodo="202607" cerrado={false} cliente={cliente} />);
  expect(screen.getByText(/se genera automáticamente al cerrar el período/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('período cerrado sin informe guardado → nota, sin botones', async () => {
  const cliente = { obtener: vi.fn().mockRejectedValue(noEmitido()) };
  render(<AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  await waitFor(() => expect(cliente.obtener).toHaveBeenCalled());
  expect(screen.getByText(/todavía no está disponible/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('período cerrado con informe guardado → botones "Ver informe" y "Descargar PDF"', async () => {
  const cliente = { obtener: vi.fn().mockResolvedValue(vistaInforme()) };
  render(<AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  expect(await screen.findByRole('button', { name: 'Ver informe' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
});

test('"Ver informe" abre la vista imprimible en un diálogo', async () => {
  const user = userEvent.setup();
  const cliente = { obtener: vi.fn().mockResolvedValue(vistaInforme()) };
  render(<AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  await user.click(await screen.findByRole('button', { name: 'Ver informe' }));
  const dialogo = await screen.findByRole('dialog');
  expect(within(dialogo).getByText(/Resumen de horas computadas/)).toBeInTheDocument();
  expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
});

test('"Descargar PDF" imprime SOLO el informe en un iframe aislado (no el modal ni los botones)', async () => {
  const cliente = { obtener: vi.fn().mockResolvedValue(vistaInforme()) };
  render(<AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Descargar PDF' }));

  const iframe = document.getElementById('informe-cierre-print-frame');
  expect(iframe).toBeInTheDocument();
  const doc = iframe.contentWindow.document;
  expect(doc.body.textContent).toContain('Resumen de horas computadas');
  expect(doc.body.textContent).toContain('Detalle de asistencia');
  expect(doc.title).toMatch(/Informe de cierre 202607/);
  expect(doc.body.textContent).not.toContain('Descargar PDF');
});

test('si la copia guardada viene obsoleta, muestra el aviso', async () => {
  const cliente = { obtener: vi.fn().mockResolvedValue(vistaInforme({ obsoleto: true })) };
  render(<AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  expect(await screen.findByText(/quedó desactualizado/)).toBeInTheDocument();
});

// 021-informe-asistencia-mensual — con la prop `mensual` (uso desde la página
// Calendario) la acción pide el tramo `Mes` unificado vía `obtenerMensual`,
// no `obtener`.
test('mensual: usa cliente.obtenerMensual y muestra "Ver informe" / "Descargar PDF"', async () => {
  const cliente = {
    obtener: vi.fn(),
    obtenerMensual: vi.fn().mockResolvedValue(vistaInforme()),
  };
  render(<AccionInformeCierre periodo="202607" cerrado mensual cliente={cliente} />);

  expect(await screen.findByRole('button', { name: 'Ver informe' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
  expect(cliente.obtenerMensual).toHaveBeenCalledWith('202607');
  expect(cliente.obtener).not.toHaveBeenCalled();
});

test('mensual: período cerrado sin informe guardado → nota, sin botones', async () => {
  const cliente = { obtenerMensual: vi.fn().mockRejectedValue(noEmitido()) };
  render(<AccionInformeCierre periodo="202607" cerrado mensual cliente={cliente} />);
  await waitFor(() => expect(cliente.obtenerMensual).toHaveBeenCalled());
  expect(screen.getByText(/todavía no está disponible/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('mensual: período abierto → sólo la nota, sin botones', async () => {
  const cliente = { obtenerMensual: vi.fn().mockRejectedValue(noEmitido()) };
  render(<AccionInformeCierre periodo="202607" cerrado={false} mensual cliente={cliente} />);
  expect(screen.getByText(/se genera automáticamente al cerrar el período/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('mensual: copia guardada obsoleta → muestra el aviso', async () => {
  const cliente = { obtenerMensual: vi.fn().mockResolvedValue(vistaInforme({ obsoleto: true })) };
  render(<AccionInformeCierre periodo="202607" cerrado mensual cliente={cliente} />);
  expect(await screen.findByText(/quedó desactualizado/)).toBeInTheDocument();
});
