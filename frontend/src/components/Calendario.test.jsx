import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Calendario from './Calendario.jsx';

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
    reclasificar: vi.fn(),
    ...over,
  };
}

// Estado vacío global: sin calendarios generados
test('muestra el estado vacío global cuando no hay calendarios', () => {
  const generarCalendarioDelPeriodo = vi.fn();
  render(
    <Calendario
      estado={{ tipo: 'vacio-global' }}
      ultimo={null}
      periodos={[]}
      generables={['202607']}
      mesActual="202607"
      periodoMostrado={null}
      cliente={clienteMock()}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={generarCalendarioDelPeriodo}
      onEstadoActualizado={vi.fn()}
    />,
  );
  expect(screen.getByText(/Aún no se generó ningún calendario/)).toBeInTheDocument();
});

// Estado cargando
test('muestra indicador de carga', () => {
  render(
    <Calendario
      estado={{ tipo: 'cargando' }}
      ultimo={null}
      periodos={[]}
      generables={[]}
      mesActual={null}
      periodoMostrado={null}
      cliente={clienteMock()}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={vi.fn()}
    />,
  );
  expect(screen.getByText('Cargando…')).toBeInTheDocument();
});

// Estado error
test('muestra error con botón de reintento', () => {
  const inicializar = vi.fn();
  render(
    <Calendario
      estado={{ tipo: 'error', mensaje: 'Error de conexión' }}
      ultimo={null}
      periodos={[]}
      generables={[]}
      mesActual={null}
      periodoMostrado={null}
      cliente={clienteMock()}
      inicializar={inicializar}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={vi.fn()}
    />,
  );
  expect(screen.getByText(/Ocurrió un error/)).toBeInTheDocument();
  expect(screen.getByText(/Error de conexión/)).toBeInTheDocument();
  const botonReintento = screen.getByText('Reintentar');
  fireEvent.click(botonReintento);
  expect(inicializar).toHaveBeenCalled();
});

// Estado con datos: muestra grilla
test('muestra el calendario cuando hay datos', () => {
  render(
    <Calendario
      estado={{ tipo: 'con-datos', vista: vista() }}
      ultimo="202607"
      periodos={['202607']}
      generables={[]}
      mesActual="202607"
      periodoMostrado="202607"
      cliente={clienteMock()}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={vi.fn()}
    />,
  );
  expect(screen.getByText('Julio 2026')).toBeInTheDocument();
  expect(screen.getByRole('grid')).toBeInTheDocument();
});

// Diálogo de reclasificación
test('abre el diálogo cuando se solicita reclasificar y permite cancelar', async () => {
  render(
    <Calendario
      estado={{ tipo: 'con-datos', vista: vista() }}
      ultimo="202607"
      periodos={['202607']}
      generables={[]}
      mesActual="202607"
      periodoMostrado="202607"
      cliente={clienteMock()}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={vi.fn()}
    />,
  );
  // Abrir diálogo
  fireEvent.change(screen.getByLabelText(/Reclasificar 2026-07-01/), { target: { value: 'Feriado' } });
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  // Cancelar
  fireEvent.click(screen.getByText('Cancelar'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

// Diálogo confirmar reclasificación
test('reclasificar: confirmar llama a la API y actualiza el estado', async () => {
  const vistaFeriado = vista({
    dias: [{ ...vista().dias[0], clasificacion: 'Feriado', resaltado: 'feriado' }],
  });
  const cliente = clienteMock({
    reclasificar: vi.fn().mockResolvedValue(vistaFeriado),
  });
  const onEstadoActualizado = vi.fn();
  
  render(
    <Calendario
      estado={{ tipo: 'con-datos', vista: vista() }}
      ultimo="202607"
      periodos={['202607']}
      generables={[]}
      mesActual="202607"
      periodoMostrado="202607"
      cliente={cliente}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={onEstadoActualizado}
    />,
  );
  
  // Abrir diálogo y confirmar
  fireEvent.change(screen.getByLabelText(/Reclasificar 2026-07-01/), { target: { value: 'Feriado' } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Confirmar'));
  
  await waitFor(() =>
    expect(cliente.reclasificar).toHaveBeenCalledWith(
      '202607',
      expect.objectContaining({ fecha: '2026-07-01', clasificacion: 'Feriado' }),
    ),
  );
  
  expect(onEstadoActualizado).toHaveBeenCalledWith(
    expect.objectContaining({ tipo: 'con-datos' }),
  );
});

// Avisos por error de reclasificación
test('muestra aviso cuando hay error en reclasificación', async () => {
  const cliente = clienteMock({
    reclasificar: vi.fn().mockRejectedValue(new Error('No se pudo guardar')),
  });
  
  render(
    <Calendario
      estado={{ tipo: 'con-datos', vista: vista() }}
      ultimo="202607"
      periodos={['202607']}
      generables={[]}
      mesActual="202607"
      periodoMostrado="202607"
      cliente={cliente}
      inicializar={vi.fn()}
      cargarMes={vi.fn()}
      generarCalendarioDelPeriodo={vi.fn()}
      onEstadoActualizado={vi.fn()}
    />,
  );
  
  // Abrir diálogo y confirmar
  fireEvent.change(screen.getByLabelText(/Reclasificar 2026-07-01/), { target: { value: 'Feriado' } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Confirmar'));
  
  expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument();
});
