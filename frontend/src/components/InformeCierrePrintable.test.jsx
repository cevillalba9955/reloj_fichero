import { render, screen, within } from '@testing-library/react';
import InformeCierrePrintable from './InformeCierrePrintable.jsx';

// 018-informe-cierre-periodo (T029 / T034) — vista imprimible: resumen por
// empleado + total, detalle día por día con marcas y subtotal, y el bloque de
// pendientes (o el estado "sin pendientes").

function vista(over = {}) {
  return {
    periodoId: '202607',
    sello: { periodoId: '202607', tramo: 'Mes', modo: 'automatico', emitidoEn: '2026-08-01T10:00:00.000Z', autor: 'ana' },
    obsoleto: false,
    resumen: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 2, totalHoras: 15.5, rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' } },
      filas: [
        { legajo: 1, nombre: 'Ana Pérez', modalidad: 'Mensual', horasTrabajadas: 15.5, completas: 2, incompletas: 1, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 1, feriado: 0, licencia: 0, vacaciones: 0, anomalia: null },
        { legajo: 9, nombre: 'Zoe Anómala', modalidad: null, horasTrabajadas: 0, completas: 0, incompletas: 0, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 0, feriado: 0, licencia: 0, vacaciones: 0, anomalia: 'empleado sin categoría en el padrón' },
      ],
    },
    detalle: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 2 },
      secciones: [
        {
          legajo: 1, nombre: 'Ana Pérez', modalidad: 'Mensual', anomalia: null, subtotalHoras: 15.5,
          dias: [
            { fecha: '2026-07-01', diaSemana: 'Miércoles', clasificacion: 'Laborable', estado: 'Completa', entrada: '07:00', salida: '15:30', horas: 8, llegadaTarde: false, corregida: true, pausas: [], justificacion: null, requiereJustificacionRevision: false },
            { fecha: '2026-07-02', diaSemana: 'Jueves', clasificacion: 'Laborable', estado: 'Incompleta', entrada: '07:00', salida: null, horas: 7.5, llegadaTarde: false, corregida: false, pausas: [], justificacion: { motivoId: 'enf', etiquetaMotivo: 'Enfermedad', tipoPago: 'Paga' }, requiereJustificacionRevision: false },
          ],
        },
        { legajo: 9, nombre: 'Zoe Anómala', modalidad: null, anomalia: 'empleado sin categoría en el padrón', subtotalHoras: 0, dias: [] },
      ],
    },
    pendientes: {
      hayPendientes: true,
      jornadasIncompletas: [{ legajo: 1, nombre: 'Ana Pérez', fechas: ['2026-07-02'] }],
      anomalias: [{ legajo: 9, nombre: 'Zoe Anómala', detalle: 'empleado sin categoría en el padrón' }],
      ajustes: [{ legajo: 1, nombre: 'Ana Pérez', fechas: ['2026-07-01', '2026-07-02'] }],
    },
    ...over,
  };
}

test('muestra el sello de emisión y el rango del período', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByText(/2026-07-01 a 2026-07-31/)).toBeInTheDocument();
  expect(screen.getByText(/por ana/)).toBeInTheDocument();
});

test('resumen: una fila por empleado, total general y fila de anomalía señalada', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  const tablaResumen = document.querySelector('.informe-resumen');
  expect(within(tablaResumen).getByText('Ana Pérez')).toBeInTheDocument();
  expect(within(tablaResumen).getByText(/Anomalía: empleado sin categoría/)).toBeInTheDocument();
  expect(within(tablaResumen).getByText(/Total \(2 empleados\)/)).toBeInTheDocument();
});

test('detalle: renderiza los días del empleado, sus marcas y el subtotal', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByText('2026-07-01')).toBeInTheDocument();
  expect(screen.getByText(/corregida/)).toBeInTheDocument();
  expect(screen.getByText(/Enfermedad \(Paga\)/)).toBeInTheDocument();
  expect(screen.getByText(/Subtotal horas: 15,5|Subtotal horas: 15\.5/)).toBeInTheDocument();
});

test('pendientes: lista jornadas incompletas, anomalías y ajustes', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByText('Jornadas incompletas')).toBeInTheDocument();
  expect(screen.getByText('Empleados con anomalía')).toBeInTheDocument();
  expect(screen.getByText('Días con corrección o justificación')).toBeInTheDocument();
});

test('sin pendientes: muestra el mensaje "Sin pendientes de revisión"', () => {
  const v = vista({ pendientes: { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] } });
  render(<InformeCierrePrintable vista={v} onCerrar={() => {}} />);
  expect(screen.getByText(/Sin pendientes de revisión/)).toBeInTheDocument();
});

test('cuando la copia es obsoleta, muestra el aviso', () => {
  render(<InformeCierrePrintable vista={vista({ obsoleto: true })} onCerrar={() => {}} />);
  expect(screen.getByText(/desactualizado/)).toBeInTheDocument();
});
