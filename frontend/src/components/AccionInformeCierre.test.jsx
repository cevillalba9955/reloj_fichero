import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccionInformeCierre from './AccionInformeCierre.jsx';
import { renderConRol } from '../test-utils/rol.jsx';

// 018-informe-cierre-periodo (T014) — la acción de emisión: deshabilitada si
// el período no está cerrado o el rol no alcanza; al emitir llama al cliente y
// abre la vista imprimible; avisa cuando la copia guardada quedó obsoleta.

function vistaInforme(over = {}) {
  return {
    periodoId: '202607',
    sello: { periodoId: '202607', tramo: 'Mes', modo: 'manual', emitidoEn: '2026-08-01T10:00:00.000Z', autor: 'ana' },
    obsoleto: false,
    resumen: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 1, totalHoras: 8, rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' } },
      filas: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Mensual', horasTrabajadas: 8, completas: 1, incompletas: 0, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 0, feriado: 0, licencia: 0, vacaciones: 0, anomalia: null },
      ],
    },
    detalle: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 1 },
      secciones: [
        { legajo: 1, nombre: 'Ana', modalidad: 'Mensual', anomalia: null, subtotalHoras: 8, dias: [
          { fecha: '2026-07-01', diaSemana: 'Miércoles', clasificacion: 'Laborable', estado: 'Completa', entrada: '07:00', salida: '15:00', horas: 8, llegadaTarde: false, corregida: false, pausas: [], justificacion: null, requiereJustificacionRevision: false },
        ] },
      ],
    },
    pendientes: { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] },
    ...over,
  };
}

const noEmitido = () => Object.assign(new Error('no emitido'), { codigo: 'INFORME_NO_EMITIDO', status: 404 });

test('período abierto → el botón de emitir está deshabilitado', async () => {
  const cliente = { obtener: vi.fn().mockRejectedValue(noEmitido()), emitir: vi.fn() };
  render(<AccionInformeCierre periodo="202607" cerrado={false} cliente={cliente} />);
  expect(screen.getByRole('button', { name: /Emitir informe de cierre/ })).toBeDisabled();
});

test('rol lector → el botón de emitir está deshabilitado aunque el período esté cerrado', async () => {
  const cliente = { obtener: vi.fn().mockRejectedValue(noEmitido()), emitir: vi.fn() };
  renderConRol('lector', <AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  expect(screen.getByRole('button', { name: /Emitir informe de cierre/ })).toBeDisabled();
});

test('período cerrado + rol editor → emitir llama al cliente y abre la vista imprimible', async () => {
  const user = userEvent.setup();
  const cliente = { obtener: vi.fn().mockRejectedValue(noEmitido()), emitir: vi.fn().mockResolvedValue(vistaInforme()) };
  renderConRol('editor', <AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);

  await user.click(screen.getByRole('button', { name: /Emitir informe de cierre/ }));
  await waitFor(() => expect(cliente.emitir).toHaveBeenCalledWith('202607'));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/Resumen de horas computadas/)).toBeInTheDocument();
});

test('si la copia guardada viene obsoleta, muestra el aviso de "volvé a emitirlo"', async () => {
  const cliente = { obtener: vi.fn().mockResolvedValue(vistaInforme({ obsoleto: true })), emitir: vi.fn() };
  renderConRol('editor', <AccionInformeCierre periodo="202607" cerrado cliente={cliente} />);
  expect(await screen.findByText(/quedó desactualizado, volvé a emitirlo/)).toBeInTheDocument();
});
