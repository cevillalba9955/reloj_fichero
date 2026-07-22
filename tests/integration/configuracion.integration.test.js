import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoConfiguracion } from '../helpers/configuracion-entorno.js';
import { loadCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';

// feature 014 — Integración end-to-end de la página de Configuración, un
// escenario por historia de usuario (spec.md, sección "Independent Test" de
// cada una).

// --- US1: guardar → releer host/puerto del reloj ---------------------------

// --- US4: resto de los parámetros operativos --------------------------------

test('US4: un valor fuera de rango en un parámetro operativo no persiste ningún campo del guardado', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entradaHora: '07:30', entradaDuracion: -5 }),
    });

    const releido = await (await fetch(`${e.base}/api/configuracion/reloj`)).json();
    assert.equal(releido.entradaHora, '07:00', 'valor default: el guardado completo se rechazó');
  } finally {
    e.close();
  }
});

test('US1: guardar host/puerto del reloj persiste y se refleja en una relectura posterior', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '192.168.1.50', port: 5010 }),
    });

    // Simula "recargar la página" / una request nueva independiente.
    const releido = await (await fetch(`${e.base}/api/configuracion/reloj`)).json();
    assert.equal(releido.host, '192.168.1.50');
    assert.equal(releido.port, 5010);
  } finally {
    e.close();
  }
});

// --- US2: un motivo creado/desactivado se refleja en el selector -----------

test('US2: un motivo creado en Configuración aparece en el selector de Justificación de Ausencias', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/motivos-ausencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'mudanza', etiqueta: 'Mudanza', tipoPago: 'No paga' }),
    });

    const selector = await (await fetch(`${e.base}/api/motivos-ausencia`)).json();
    assert.ok(selector.motivos.some((m) => m.id === 'mudanza'));
  } finally {
    e.close();
  }
});

test('US2: desactivar un motivo lo saca del selector sin tocar el catálogo completo', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/motivos-ausencia/enfermedad`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    });

    const selector = await (await fetch(`${e.base}/api/motivos-ausencia`)).json();
    assert.ok(!selector.motivos.some((m) => m.id === 'enfermedad'));

    const catalogo = await (await fetch(`${e.base}/api/configuracion/motivos-ausencia`)).json();
    assert.ok(catalogo.motivos.some((m) => m.id === 'enfermedad'), 'sigue en el catálogo completo, solo inactivo');
  } finally {
    e.close();
  }
});

// --- US3: modalidad/categoría editada afecta el próximo cálculo de presentismo --

test('US3: una categoría reasignada a otra modalidad usa el horario nuevo en el próximo cálculo', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/categorias/modalidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'quincenal_operarios',
        tipo: 'Quincenal',
        aperturaOficial: '06:00',
        cierreOficial: '14:00',
        margenAperturaMin: 15,
        margenCierreMin: 15,
        ventanaApertura: ['05:00', '10:00'],
        ventanaCierre: ['10:00', '23:59'],
      }),
    });
    await fetch(`${e.base}/api/configuracion/categorias/categorias/ADMIN`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modalidad: 'quincenal_operarios' }),
    });

    // Simula el próximo `npm run presentismo`: un proceso nuevo que recarga
    // categorias.json desde cero (misma función que usa el CLI).
    const configRecargada = loadCategoriasConfig(e.categoriasPath);
    const modalidad = configRecargada.resolverModalidadPorCategoria('ADMIN');
    assert.equal(modalidad.tipo, 'Quincenal');
    assert.equal(modalidad.aperturaOficial, 360); // 06:00 en minutos
  } finally {
    e.close();
  }
});

test('US3: eliminar una modalidad en uso se bloquea (no rompe la categoría que la usa)', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/categorias/modalidades/mensual`, { method: 'DELETE' });
    assert.equal(res.status, 409);

    const configRecargada = loadCategoriasConfig(e.categoriasPath);
    assert.equal(configRecargada.resolverModalidadPorCategoria('ADMIN').tipo, 'Mensual', 'sigue intacta');
  } finally {
    e.close();
  }
});
