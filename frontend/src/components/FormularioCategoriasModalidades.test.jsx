import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormularioCategoriasModalidades from './FormularioCategoriasModalidades.jsx';
import { seleccionarOpcion } from '../test-utils/antd.js';

// feature 014 (US3) — esquema semanal compartido, modalidades (alta/edición/
// baja bloqueada si está en uso) y categorías (alta y reasignación de
// modalidad, sin eliminación, FR-012a).

function datosMock() {
  return {
    esquemaSemanal: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    modalidades: {
      mensual: {
        tipo: 'Mensual', aperturaOficial: '07:00', cierreOficial: '16:00',
        margenAperturaMin: 30, margenCierreMin: 30,
        ventanaApertura: ['05:00', '12:00'], ventanaCierre: ['12:00', '23:59'],
      },
    },
    categorias: { ADMIN: { modalidad: 'mensual' } },
  };
}

function clienteMock(over = {}) {
  return {
    obtenerCategorias: vi.fn().mockResolvedValue(datosMock()),
    guardarEsquemaSemanal: vi.fn().mockResolvedValue({}),
    crearModalidad: vi.fn().mockResolvedValue({}),
    editarModalidad: vi.fn().mockResolvedValue({}),
    eliminarModalidad: vi.fn().mockResolvedValue({ eliminada: true }),
    crearCategoria: vi.fn().mockResolvedValue({}),
    editarCategoria: vi.fn().mockResolvedValue({}),
    ...over,
  };
}

test('muestra el esquema semanal, las modalidades y las categorías actuales', async () => {
  render(<FormularioCategoriasModalidades cliente={clienteMock()} />);

  expect(await screen.findByText('Mensual')).toBeInTheDocument(); // columna "Tipo"
  expect(screen.getAllByText('mensual').length).toBeGreaterThanOrEqual(2); // nombre de modalidad + modalidad asignada a ADMIN
  expect(screen.getByText('ADMIN')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Lunes' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked();
});

test('la tabla de categorías nunca ofrece eliminar (FR-012a)', async () => {
  render(<FormularioCategoriasModalidades cliente={clienteMock()} />);

  await screen.findByText('ADMIN');
  const filaAdmin = screen.getByText('ADMIN').closest('tr');
  expect(within(filaAdmin).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  expect(within(filaAdmin).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
});

test('cambiar el esquema semanal y guardar lo envía al cliente', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock();
  render(<FormularioCategoriasModalidades cliente={cliente} />);

  await screen.findByText('ADMIN');
  await user.click(screen.getByRole('checkbox', { name: 'Sábado' }));
  await user.click(screen.getByRole('button', { name: 'Guardar esquema semanal' }));

  await waitFor(() =>
    expect(cliente.guardarEsquemaSemanal).toHaveBeenCalledWith(
      expect.arrayContaining(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']),
    ),
  );
});

test('eliminar una modalidad en uso muestra el error del servidor', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({
    eliminarModalidad: vi.fn().mockRejectedValue(new Error('la modalidad "mensual" está en uso por: ADMIN')),
  });
  render(<FormularioCategoriasModalidades cliente={cliente} />);

  await screen.findByText('ADMIN');
  await user.click(screen.getByRole('button', { name: 'Eliminar' }));
  const confirmar = await screen.findByRole('button', { name: /ok|s[ií]/i });
  await user.click(confirmar);

  expect(await screen.findByText(/está en uso por: ADMIN/)).toBeInTheDocument();
});

test('reasignar la modalidad de una categoría existente', async () => {
  const user = userEvent.setup();
  const cliente = clienteMock({
    obtenerCategorias: vi.fn().mockResolvedValue({
      ...datosMock(),
      modalidades: {
        ...datosMock().modalidades,
        quincenal_operarios: {
          tipo: 'Quincenal', aperturaOficial: '06:00', cierreOficial: '14:00',
          margenAperturaMin: 15, margenCierreMin: 15,
          ventanaApertura: ['05:00', '10:00'], ventanaCierre: ['10:00', '23:59'],
        },
      },
    }),
  });
  render(<FormularioCategoriasModalidades cliente={cliente} />);

  await screen.findByText('ADMIN');
  const filaAdmin = screen.getByText('ADMIN').closest('tr');
  await user.click(within(filaAdmin).getByRole('button', { name: 'Editar' }));

  await screen.findByRole('dialog');
  await seleccionarOpcion('Modalidad', 'quincenal_operarios');
  await user.click(screen.getByRole('button', { name: 'Guardar' }));

  await waitFor(() => expect(cliente.editarCategoria).toHaveBeenCalledWith('ADMIN', { modalidad: 'quincenal_operarios' }));
});
