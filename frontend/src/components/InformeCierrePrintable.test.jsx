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
      encabezado: {
        periodoId: '202607', tramo: 'Mes', empleados: 2, totalHoras: 930,
        totalAusencias: 3, totalHorasEsperadas: 1200, presentismoGeneral: 930 / 1200,
        rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' },
      },
      filas: [
        { legajo: 1, nombre: 'Ana Pérez', modalidad: 'Mensual', horasTrabajadas: 930, horasEsperadas: 1200, presentismoIndividual: 930 / 1200, completas: 8, incompletas: 1, ausencias: 3, llegadasTarde: 2, retirosAnticipados: 0, correcciones: 1, feriado: 1, licencia: 0, vacaciones: 0, anomalia: null },
        { legajo: 9, nombre: 'Zoe Anómala', modalidad: null, horasTrabajadas: 0, horasEsperadas: 0, presentismoIndividual: null, completas: 0, incompletas: 0, ausencias: 0, llegadasTarde: 0, retirosAnticipados: 0, correcciones: 0, feriado: 0, licencia: 0, vacaciones: 0, anomalia: 'empleado sin categoría en el padrón' },
      ],
    },
    detalle: {
      encabezado: { periodoId: '202607', tramo: 'Mes', empleados: 2 },
      secciones: [
        {
          legajo: 1, nombre: 'Ana Pérez', modalidad: 'Mensual', anomalia: null, subtotalHoras: 930,
          dias: [
            { fecha: '2026-07-01', diaSemana: 'Miércoles', clasificacion: 'Laborable', estado: 'Completa', entrada: '07:00', salida: '15:00', horas: 480, llegadaTarde: false, corregida: true, motivoCorreccion: 'olvido de fichada de salida', pausas: [], justificacion: null, requiereJustificacionRevision: false },
            { fecha: '2026-07-02', diaSemana: 'Jueves', clasificacion: 'Laborable', estado: 'Incompleta', entrada: '07:00', salida: null, horas: 450, llegadaTarde: false, corregida: false, pausas: [], justificacion: { motivoId: 'enf', etiquetaMotivo: 'Enfermedad', tipoPago: 'Paga' }, requiereJustificacionRevision: false },
            { fecha: '2026-07-03', diaSemana: 'Viernes', clasificacion: 'Laborable', estado: 'Sin fichadas', entrada: null, salida: null, horas: 0, llegadaTarde: false, corregida: false, pausas: [], justificacion: null, requiereJustificacionRevision: false },
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

test('detalle: renderiza los días del empleado, sus marcas y el subtotal en H:MM', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByText('2026-07-01')).toBeInTheDocument();
  // un día corregido imprime el motivo de la corrección vigente (y no la
  // palabra "corregida", que sólo aparece si no hay motivo)
  expect(screen.getByText(/olvido de fichada de salida/)).toBeInTheDocument();
  expect(screen.queryByText(/corregida/)).not.toBeInTheDocument();
  expect(screen.getByText(/Enfermedad \(Paga\)/)).toBeInTheDocument();
  // las horas del dominio están en minutos → se muestran como H:MM (930 → 15:30)
  expect(screen.getByText('Subtotal horas: 15:30')).toBeInTheDocument();
});

test('detalle: el estado "Sin fichadas" se muestra como "Ausente"', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByText('Ausente')).toBeInTheDocument();
  expect(screen.queryByText('Sin fichadas')).not.toBeInTheDocument();
});

test('la grilla de resumen no tiene columnas Modalidad, Incompletas ni Correcc. y el header de horas es "Horas"', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  const tablaResumen = document.querySelector('.informe-resumen');
  expect(within(tablaResumen).queryByText('Modalidad')).not.toBeInTheDocument();
  expect(within(tablaResumen).queryByText('Incompletas')).not.toBeInTheDocument();
  expect(within(tablaResumen).queryByText('Correcc.')).not.toBeInTheDocument();
  expect(within(tablaResumen).queryByText('Horas computadas')).not.toBeInTheDocument();
  expect(within(tablaResumen).getByRole('columnheader', { name: 'Horas' })).toBeInTheDocument();
  expect(within(tablaResumen).getByRole('columnheader', { name: 'Presentismo' })).toBeInTheDocument();
});

test('la grilla muestra el presentismo individual por empleado (% ) y lo omite en la fila de anomalía', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  const tablaResumen = document.querySelector('.informe-resumen');
  // 930 / 1200 = 77,5 %
  expect(within(tablaResumen).getAllByText(/77[.,]5\s*%/).length).toBeGreaterThanOrEqual(1);
  // la fila de anomalía no muestra %
  const filaAnomalia = within(tablaResumen).getByText(/Anomalía: empleado sin categoría/).closest('tr');
  expect(filaAnomalia.textContent).not.toMatch(/%/);
});

test('totaliza ausencias en el pie de la grilla y muestra la leyenda de presentismo general', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  // total de ausencias en el pie (fila 1 tiene 3; total 3)
  const tablaResumen = document.querySelector('.informe-resumen');
  expect(within(tablaResumen).getAllByText('3').length).toBeGreaterThanOrEqual(2);
  // leyenda: % de presentismo general (930 / 1200 = 77,5 %) + total ausencias
  const leyenda = screen.getByText(/Presentismo general:/);
  expect(leyenda).toHaveTextContent(/77[.,]5\s*%/);
  expect(leyenda).toHaveTextContent(/Ausencias totales:\s*3/);
});

test('sin horas esperadas no muestra la leyenda de presentismo', () => {
  const v = vista();
  v.resumen.encabezado.presentismoGeneral = null;
  render(<InformeCierrePrintable vista={v} onCerrar={() => {}} />);
  expect(screen.queryByText(/Presentismo general:/)).not.toBeInTheDocument();
});

test('la grilla de resumen oculta los ceros y muestra sólo los valores > 0', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  const tablaResumen = document.querySelector('.informe-resumen');
  // fila 1: completas 8, llegadasTarde 2, feriado 1; el resto en 0 → sin texto
  expect(within(tablaResumen).getByText('8')).toBeInTheDocument();
  expect(within(tablaResumen).getByText('2')).toBeInTheDocument();
  // "15:30" aparece 2 veces: la fila del empleado y el total del pie
  expect(within(tablaResumen).getAllByText('15:30')).toHaveLength(2);
  // ningún cero visible (celdas en 0 quedan vacías)
  expect(within(tablaResumen).queryByText('0')).not.toBeInTheDocument();
});

test('el modal de "Ver informe" sólo tiene el botón Cerrar (la descarga a PDF vive en la página)', () => {
  render(<InformeCierrePrintable vista={vista()} onCerrar={() => {}} />);
  expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
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
