import { render, screen, fireEvent } from '@testing-library/react';
import DialogoDetalleEmpleado from './DialogoDetalleEmpleado.jsx';

// T020 (feature 011, US2) — pide el detalle al abrirse, renderiza los días
// señalando corregidos/retiros, y cierra por botón sin efecto (FR-006).

function detalle(over = {}) {
  return {
    periodo: '202607',
    legajo: 1,
    nombre: 'Ana Pérez',
    dias: [
      {
        fecha: '2026-07-01',
        clasificacion: 'Laborable',
        estado: 'Completa',
        entrada: '07:00',
        salida: '16:00',
        horas: 540,
        llegadaTarde: false,
        corregida: false,
        pausas: [],
      },
      {
        fecha: '2026-07-02',
        clasificacion: 'Laborable',
        estado: 'Completa',
        entrada: '07:00',
        salida: '16:00',
        horas: 540,
        llegadaTarde: false,
        corregida: true,
        pausas: [{ desde: '14:30', hasta: '16:00', tipo: 'retiro_anticipado' }],
      },
    ],
    ...over,
  };
}

test('pide el detalle al abrirse y renderiza los días', async () => {
  const cliente = { obtenerDetalle: vi.fn().mockResolvedValue(detalle()) };
  render(
    <DialogoDetalleEmpleado cliente={cliente} legajo={1} nombre="Ana Pérez" periodo="202607" onCerrar={vi.fn()} />,
  );
  expect(await screen.findByText('2026-07-01')).toBeInTheDocument();
  expect(cliente.obtenerDetalle).toHaveBeenCalledWith(1, '202607');
});

test('señala días corregidos y retiros anticipados', async () => {
  const cliente = { obtenerDetalle: vi.fn().mockResolvedValue(detalle()) };
  render(
    <DialogoDetalleEmpleado cliente={cliente} legajo={1} nombre="Ana Pérez" periodo="202607" onCerrar={vi.fn()} />,
  );
  await screen.findByText('2026-07-02');
  expect(screen.getByText(/\(corregida\)/)).toBeInTheDocument();
  expect(screen.getByText(/\(retiro anticipado\)/)).toBeInTheDocument();
});

test('un fallo al pedir el detalle muestra el error', async () => {
  const cliente = { obtenerDetalle: vi.fn().mockRejectedValue(new Error('boom')) };
  render(
    <DialogoDetalleEmpleado cliente={cliente} legajo={1} nombre="Ana Pérez" periodo="202607" onCerrar={vi.fn()} />,
  );
  expect(await screen.findByText(/Ocurrió un error: boom/)).toBeInTheDocument();
});

test('el botón Cerrar invoca onCerrar sin alterar datos', async () => {
  const cliente = { obtenerDetalle: vi.fn().mockResolvedValue(detalle()) };
  const onCerrar = vi.fn();
  render(
    <DialogoDetalleEmpleado cliente={cliente} legajo={1} nombre="Ana Pérez" periodo="202607" onCerrar={onCerrar} />,
  );
  await screen.findByText('2026-07-01');
  fireEvent.click(screen.getByText('Cerrar'));
  expect(onCerrar).toHaveBeenCalledTimes(1);
});
