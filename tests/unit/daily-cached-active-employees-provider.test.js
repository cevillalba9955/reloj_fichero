import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDailyCachedActiveEmployeesProvider } from '../../src/roster/daily-cached-active-employees-provider.js';
import { RosterNoDisponibleError } from '../../src/roster/active-employees-provider.js';

function fakeLogger() {
  const eventos = [];
  return { eventos, logEvento: (e) => eventos.push(e) };
}

// inner controlable: cuenta llamadas y responde según un guión mutable.
function innerControlable(respuestaInicial) {
  const state = { llamadas: 0, respuesta: respuestaInicial };
  return {
    state,
    inner: {
      async getActiveEmployees() {
        state.llamadas += 1;
        const r = typeof state.respuesta === 'function' ? state.respuesta() : state.respuesta;
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}

const DIA1 = new Date(2026, 6, 7, 7, 0, 0, 0);
const DIA1_TARDE = new Date(2026, 6, 7, 15, 0, 0, 0);
const DIA2 = new Date(2026, 6, 8, 7, 0, 0, 0);

test('DailyCached: primera llamada del día consulta inner, fija el snapshot y loguea padron_fresco (FR-014)', async () => {
  const { state, inner } = innerControlable([{ legajo: 101, activo: true }]);
  const logger = fakeLogger();
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1, logger });

  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados, [{ legajo: 101, activo: true }]);
  assert.equal(state.llamadas, 1);
  const fresco = logger.eventos.find((e) => e.evento === 'padron_fresco');
  assert.ok(fresco);
  assert.equal(fresco.cantidadLegajos, 1);
  assert.ok(fresco.obtenidoEn);
});

test('DailyCached: llamadas siguientes del mismo día NO vuelven a consultar inner (FR-014)', async () => {
  let ahora = DIA1;
  const { state, inner } = innerControlable([{ legajo: 101, activo: true }]);
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => ahora });

  await provider.getActiveEmployees();
  ahora = DIA1_TARDE;
  await provider.getActiveEmployees();
  await provider.getActiveEmployees();
  assert.equal(state.llamadas, 1, 'una sola consulta a la fuente por día de servicio');
});

test('DailyCached: al cambiar el día de servicio vuelve a consultar inner', async () => {
  let ahora = DIA1;
  const { state, inner } = innerControlable([{ legajo: 101, activo: true }]);
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => ahora });

  await provider.getActiveEmployees();
  assert.equal(state.llamadas, 1);
  ahora = DIA2;
  await provider.getActiveEmployees();
  assert.equal(state.llamadas, 2);
});

test('DailyCached: reentrancy — dos llamadas concurrentes disparan una sola consulta a inner', async () => {
  let resolver;
  const inner = {
    llamadas: 0,
    async getActiveEmployees() {
      this.llamadas += 1;
      await new Promise((r) => { resolver = r; });
      return [{ legajo: 101, activo: true }];
    },
  };
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1 });

  const p1 = provider.getActiveEmployees();
  const p2 = provider.getActiveEmployees();
  await new Promise((r) => setTimeout(r, 10));
  resolver();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.deepEqual(r1, [{ legajo: 101, activo: true }]);
  assert.deepEqual(r2, [{ legajo: 101, activo: true }]);
  assert.equal(inner.llamadas, 1, 'la promesa en vuelo se comparte, no se disparan dos consultas');
});

// ---- Filas de resiliencia (US2) ----

test('DailyCached: inner falla CON snapshot previo → sirve el último válido + loguea padron_error y padron_respaldo (FR-008)', async () => {
  let ahora = DIA1;
  const logger = fakeLogger();
  const { state, inner } = innerControlable(() => [{ legajo: 101, activo: true }]);
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => ahora, logger });

  await provider.getActiveEmployees(); // día 1 fija snapshot
  ahora = DIA2;
  state.respuesta = () => new RosterNoDisponibleError('fuente caída');

  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados, [{ legajo: 101, activo: true }], 'sirve el snapshot del día 1');
  assert.ok(logger.eventos.some((e) => e.evento === 'padron_error'));
  const respaldo = logger.eventos.find((e) => e.evento === 'padron_respaldo');
  assert.ok(respaldo, 'debe registrar el uso del respaldo');
  assert.ok(respaldo.obtenidoEn, 'el respaldo debe registrar la antigüedad (obtenidoEn) del snapshot servido');
});

test('DailyCached: inner falla SIN snapshot previo → rechaza RosterNoDisponibleError (FR-007) y loguea padron_error', async () => {
  const logger = fakeLogger();
  const { inner } = innerControlable(() => new RosterNoDisponibleError('primer arranque, fuente caída'));
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1, logger });

  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  assert.ok(logger.eventos.some((e) => e.evento === 'padron_error'));
});

test('DailyCached: inner responde vacío → tratado como fallo, nunca se fija como snapshot, loguea padron_vacio (FR-011)', async () => {
  const logger = fakeLogger();
  const { state, inner } = innerControlable(() => []);
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1, logger });

  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  assert.ok(logger.eventos.some((e) => e.evento === 'padron_vacio'));

  // El vacío no consumió el éxito del día: la próxima llamada REINTENTA.
  state.respuesta = () => [{ legajo: 101, activo: true }];
  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados, [{ legajo: 101, activo: true }]);
  assert.equal(state.llamadas, 2, 'el vacío no consume el éxito del día: se reintenta');
});

test('DailyCached: fallo en la primera llamada, luego reintento exitoso el mismo día', async () => {
  const { state, inner } = innerControlable(() => new RosterNoDisponibleError('caída transitoria'));
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1 });

  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
  state.respuesta = () => [{ legajo: 101, activo: true }];
  const empleados = await provider.getActiveEmployees();
  assert.deepEqual(empleados, [{ legajo: 101, activo: true }]);
  assert.equal(state.llamadas, 2);
});

test('DailyCached: nunca devuelve [] como sustituto de un error (regla heredada 002)', async () => {
  const { inner } = innerControlable(() => []);
  const provider = createDailyCachedActiveEmployeesProvider({ inner, now: () => DIA1 });
  await assert.rejects(() => provider.getActiveEmployees(), RosterNoDisponibleError);
});
