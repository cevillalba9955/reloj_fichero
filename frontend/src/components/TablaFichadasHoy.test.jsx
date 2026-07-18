import { render, screen } from '@testing-library/react';
import TablaFichadasHoy from './TablaFichadasHoy.jsx';

// T015 (feature 010, US1) — la tabla muestra por fila los datos del
// data-model (legajo, nombre, entrada, salida, horas, situación) con la
// situación correcta y distinguible, sin datos personales de más (FR-015).

function fila(over = {}) {
  return {
    legajo: 1,
    nombre: 'Ana Pérez',
    entrada: '07:05',
    salida: null,
    horasTrabajadas: 0,
    situacion: 'PRESENTE',
    correccionVigente: false,
    pausas: [],
    anomalias: [],
    ...over,
  };
}

test('muestra una fila por empleado con su situación', () => {
  render(
    <TablaFichadasHoy
      empleados={[
        fila(),
        fila({ legajo: 2, nombre: 'Bruno Espera', entrada: null, situacion: 'ESPERANDO' }),
        fila({ legajo: 3, nombre: 'Carla Tarde', entrada: '08:10', situacion: 'TARDE' }),
        fila({
          legajo: 4,
          nombre: 'Dario Completo',
          salida: '15:58',
          horasTrabajadas: 540,
          situacion: 'Completa',
        }),
      ]}
    />,
  );
  const filas = screen.getAllByRole('row').slice(1); // sin el encabezado
  expect(filas).toHaveLength(4);
  expect(filas[0]).toHaveTextContent('PRESENTE');
  expect(filas[1]).toHaveTextContent('ESPERANDO');
  expect(filas[2]).toHaveTextContent('TARDE');
  expect(filas[3]).toHaveTextContent('Completa');
  // Horas trabajadas legibles (540 min → 9:00).
  expect(filas[3]).toHaveTextContent('9:00');
  // La distinción visual va por clase, además del texto (accesibilidad).
  expect(filas[0].className).toContain('situacion-presente');
  expect(filas[2].className).toContain('situacion-tarde');
});

test('una anomalía se señala distinguida, con su explicación (FR-014)', () => {
  render(
    <TablaFichadasHoy
      empleados={[
        fila({
          legajo: 9,
          nombre: 'Zoe Anomalía',
          entrada: null,
          situacion: 'ANOMALIA',
          anomalias: ['categoría "XXX" no configurada'],
        }),
      ]}
    />,
  );
  const [datos] = screen.getAllByRole('row').slice(1);
  expect(datos.className).toContain('situacion-anomalia');
  expect(datos).toHaveTextContent('Anomalía');
  expect(datos).toHaveTextContent('categoría "XXX" no configurada');
});

test('no expone datos personales de más (solo legajo y nombre)', () => {
  const { container } = render(
    <TablaFichadasHoy
      empleados={[
        fila({ categoria: 'ADMIN', dni: '12.345.678', rawHex: 'aa55', template: 'xxx' }),
      ]}
    />,
  );
  const texto = container.textContent;
  expect(texto).toContain('Ana Pérez');
  expect(texto).not.toContain('ADMIN');
  expect(texto).not.toContain('12.345.678');
  expect(texto).not.toContain('aa55');
});

test('sin empleados muestra el estado vacío en vez de una tabla', () => {
  render(<TablaFichadasHoy empleados={[]} />);
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByText(/No hay empleados esperados/)).toBeInTheDocument();
});

// T066 (feature 010, iteración 2, FR-001) — Columnas «Inicio pausa» /
// «Fin pausa»: muestran la primera pausa intermedia vigente por `desde` (+N si
// hay más); los retiros anticipados no aparecen en estas columnas.

function pausaIntermedia(desde, hasta) {
  return { desde, hasta, tipo: 'intermedia', motivo: 'corte' };
}

test('las columnas de pausa existen y una fila sin pausas muestra —', () => {
  render(<TablaFichadasHoy empleados={[fila()]} />);
  expect(screen.getByText('Inicio pausa')).toBeInTheDocument();
  expect(screen.getByText('Fin pausa')).toBeInTheDocument();
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  // legajo, nombre, entrada, salida, inicio pausa, fin pausa, horas, situación
  expect(celdas[4]).toHaveTextContent('—');
  expect(celdas[5]).toHaveTextContent('—');
});

test('una pausa intermedia se muestra en sus columnas', () => {
  render(
    <TablaFichadasHoy empleados={[fila({ pausas: [pausaIntermedia('12:00', '13:00')] })]} />,
  );
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[4]).toHaveTextContent('12:00');
  expect(celdas[5]).toHaveTextContent('13:00');
});

test('con dos pausas intermedias muestra la primera por desde, con indicador +1', () => {
  render(
    <TablaFichadasHoy
      empleados={[
        fila({ pausas: [pausaIntermedia('14:00', '14:30'), pausaIntermedia('12:00', '13:00')] }),
      ]}
    />,
  );
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[4]).toHaveTextContent('12:00', 'la primera por desde, no por orden de alta');
  expect(celdas[5]).toHaveTextContent('13:00');
  expect(celdas[5]).toHaveTextContent('+1');
});

test('un retiro anticipado no aparece en las columnas de pausa', () => {
  render(
    <TablaFichadasHoy
      empleados={[
        fila({
          situacion: 'RETIRO_ANTICIPADO',
          pausas: [{ desde: '14:30', hasta: '16:00', tipo: 'retiro_anticipado', motivo: 'médico' }],
        }),
      ]}
    />,
  );
  const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
  expect(celdas[4]).toHaveTextContent('—');
  expect(celdas[5]).toHaveTextContent('—');
});
