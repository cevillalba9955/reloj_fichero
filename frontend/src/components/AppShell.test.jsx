import { screen, fireEvent } from '@testing-library/react';
import AppShell from './AppShell.jsx';
import { renderConRol } from '../test-utils/rol.jsx';

test('muestra las secciones en el menú lateral (rol lector)', async () => {
  renderConRol(
    'lector',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  expect(await screen.findByRole('menuitem', { name: /Calendario/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Fichadas de hoy/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Resumen período/ })).toBeInTheDocument();
});

test('clickear un ítem del menú invoca onCambiarSeccion con su key', async () => {
  const onCambiarSeccion = vi.fn();
  renderConRol(
    'lector',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={onCambiarSeccion}>
      contenido
    </AppShell>,
  );
  fireEvent.click(await screen.findByRole('menuitem', { name: /Calendario/ }));
  expect(onCambiarSeccion).toHaveBeenCalledWith('calendario');
});

test('renderiza el contenido recibido como children', async () => {
  renderConRol(
    'lector',
    <AppShell seccion="calendario" onCambiarSeccion={() => {}}>
      <p>contenido de prueba</p>
    </AppShell>,
  );
  expect(await screen.findByText('contenido de prueba')).toBeInTheDocument();
});

// --- feature 016 (FR-007, FR-011, FR-012) -----------------------------------

test('rol lector: no ve la entrada "Configuración"', async () => {
  renderConRol(
    'lector',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  await screen.findByRole('menuitem', { name: /Calendario/ });
  expect(screen.queryByRole('menuitem', { name: /Configuración/ })).not.toBeInTheDocument();
});

test('rol editor: tampoco ve la entrada "Configuración"', async () => {
  renderConRol(
    'editor',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  await screen.findByRole('menuitem', { name: /Calendario/ });
  expect(screen.queryByRole('menuitem', { name: /Configuración/ })).not.toBeInTheDocument();
});

test('rol configurador: ve la entrada "Configuración" (US3)', async () => {
  renderConRol(
    'configurador',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  expect(await screen.findByRole('menuitem', { name: /Configuración/ })).toBeInTheDocument();
});

test('muestra el rol actual del usuario (FR-012)', async () => {
  renderConRol(
    'editor',
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  expect(await screen.findByText(/Rol: Editor/)).toBeInTheDocument();
});
