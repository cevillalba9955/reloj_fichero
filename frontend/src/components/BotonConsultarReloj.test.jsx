import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BotonConsultarReloj from './BotonConsultarReloj.jsx';
import PaginaFichadasHoy from './PaginaFichadasHoy.jsx';

// T051 (feature 010, US4) — el botón se deshabilita mientras la consulta está
// en curso, muestra el error sin perder la tabla, y un éxito refresca la vista.

test('mientras la consulta está en curso, el botón queda deshabilitado', async () => {
  let liberar;
  const onConsultar = vi.fn(
    () => new Promise((r) => { liberar = () => r({ resultado: 'ok', fichadasNuevas: 0 }); }),
  );
  render(<BotonConsultarReloj onConsultar={onConsultar} />);

  fireEvent.click(screen.getByText('Consultar reloj'));
  expect(screen.getByText('Consultando…')).toBeDisabled();
  // Un segundo clic no dispara otra consulta.
  fireEvent.click(screen.getByText('Consultando…'));
  expect(onConsultar).toHaveBeenCalledTimes(1);

  liberar();
  expect(await screen.findByText('Consultar reloj')).not.toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('0 fichada(s) nueva(s)');
});

test('una consulta omitida (ya en curso en el servicio) se informa sin error', async () => {
  const onConsultar = vi.fn().mockResolvedValue({ resultado: 'omitido', fichadasNuevas: 0 });
  render(<BotonConsultarReloj onConsultar={onConsultar} />);
  fireEvent.click(screen.getByText('Consultar reloj'));
  expect(await screen.findByRole('status')).toHaveTextContent('Ya había una consulta en curso');
});

test('un fallo muestra el error y permite reintentar', async () => {
  const onConsultar = vi.fn().mockRejectedValue(new Error('el servicio de fichadas no responde'));
  render(<BotonConsultarReloj onConsultar={onConsultar} />);
  fireEvent.click(screen.getByText('Consultar reloj'));
  expect(await screen.findByRole('alert')).toHaveTextContent('el servicio de fichadas no responde');
  expect(screen.getByText('Consultar reloj')).not.toBeDisabled();
});

// Flujo en la página: el éxito refresca la tabla; el fallo la deja intacta.

function vista(empleados) {
  return {
    fecha: '2026-07-16',
    periodo: '202607',
    diaClasificacion: 'Laborable',
    // iteración 2: el botón de consultar reloj solo se muestra cuando esHoy.
    navegacion: { anterior: '2026-07-15', siguiente: null, esHoy: true },
    empleados,
  };
}

const filaBase = {
  legajo: 1,
  nombre: 'Ana Pérez',
  entrada: null,
  salida: null,
  horasTrabajadas: 0,
  situacion: 'ESPERANDO',
  correccionVigente: false,
  pausas: [],
  anomalias: [],
};

test('en la página, una consulta exitosa refresca la tabla con la vista devuelta', async () => {
  const cliente = {
    obtenerFichadasHoy: vi.fn().mockResolvedValue(vista([filaBase])),
    consultarReloj: vi.fn().mockResolvedValue({
      resultado: 'ok',
      fichadasNuevas: 1,
      vista: vista([{ ...filaBase, entrada: '07:03', situacion: 'PRESENTE' }]),
    }),
  };
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');
  expect(screen.getByRole('table')).toHaveTextContent('ESPERANDO');

  fireEvent.click(screen.getByText('Consultar reloj'));
  await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('PRESENTE'));
  expect(screen.getByRole('table')).toHaveTextContent('07:03');
});

test('en la página, un fallo de la consulta no pierde la tabla existente (FR-010)', async () => {
  const cliente = {
    obtenerFichadasHoy: vi.fn().mockResolvedValue(vista([filaBase])),
    consultarReloj: vi.fn().mockRejectedValue(new Error('HTTP 502')),
  };
  render(<PaginaFichadasHoy cliente={cliente} />);
  await screen.findByRole('table');

  fireEvent.click(screen.getByText('Consultar reloj'));
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 502');
  expect(screen.getByRole('table')).toHaveTextContent('Ana Pérez');
});
