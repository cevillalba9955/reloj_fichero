import { render, screen, fireEvent } from '@testing-library/react';
import AppShell from './AppShell.jsx';

test('muestra las 3 secciones en el menú lateral', () => {
  render(
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  expect(screen.getByRole('menuitem', { name: /Calendario/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Fichadas de hoy/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Resumen período/ })).toBeInTheDocument();
});

test('clickear un ítem del menú invoca onCambiarSeccion con su key', () => {
  const onCambiarSeccion = vi.fn();
  render(
    <AppShell seccion="fichadas-hoy" onCambiarSeccion={onCambiarSeccion}>
      contenido
    </AppShell>,
  );
  fireEvent.click(screen.getByRole('menuitem', { name: /Calendario/ }));
  expect(onCambiarSeccion).toHaveBeenCalledWith('calendario');
});

test('el breadcrumb muestra el título de la sección activa', () => {
  render(
    <AppShell seccion="resumen-periodo" onCambiarSeccion={() => {}}>
      contenido
    </AppShell>,
  );
  const breadcrumb = screen.getByRole('navigation');
  expect(breadcrumb).toHaveTextContent('Resumen período');
});

test('renderiza el contenido recibido como children', () => {
  render(
    <AppShell seccion="calendario" onCambiarSeccion={() => {}}>
      <p>contenido de prueba</p>
    </AppShell>,
  );
  expect(screen.getByText('contenido de prueba')).toBeInTheDocument();
});
