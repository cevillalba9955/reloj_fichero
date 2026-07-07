import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFichadasMemoryStore } from '../../src/store/fichadas-memory-store.js';
import { Checkpoint } from '../../src/scheduling/checkpoint.js';

function fichada(overrides = {}) {
  return {
    legajo: 1,
    metodo: 'huella',
    fecha: '2026-07-07',
    hora: '07:10:00',
    rawHex: '0'.repeat(40),
    ...overrides,
  };
}

test('FichadasMemoryStore: agrupa una fichada por legajo y período (derivado de fecha)', () => {
  const store = createFichadasMemoryStore();
  const now = new Date(2026, 6, 7, 7, 10, 0);
  const { agregada, fichada: guardada } = store.addFichada(fichada(), { now });

  assert.equal(agregada, true);
  assert.equal(guardada.periodo, '2026-07');
  assert.equal(guardada.periodoAproximado, false);

  const periodos = store.getPeriodos();
  assert.equal(periodos.length, 1);
  assert.equal(periodos[0].id, '2026-07');
  assert.equal(periodos[0].legajo, 1);
  assert.equal(periodos[0].fichadas.length, 1);
});

test('FichadasMemoryStore: cuando fecha es null, deriva el período de la fecha de recolección y lo marca aproximado', () => {
  const store = createFichadasMemoryStore();
  const now = new Date(2026, 6, 7, 12, 0, 0);
  const { fichada: guardada } = store.addFichada(
    fichada({ fecha: null, hora: null, rawHex: '1'.repeat(40) }),
    { now }
  );

  assert.equal(guardada.periodo, '2026-07');
  assert.equal(guardada.periodoAproximado, true);
});

test('FichadasMemoryStore: asocia la fichada al checkpoint cuya ventana de aceptación contiene su hora', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const salida = new Checkpoint({ id: 'salida', horaEsperada: '16:00', margenMinutos: 30 });
  const now = new Date(2026, 6, 7, 7, 10, 0);

  const { fichada: guardada } = store.addFichada(fichada({ hora: '07:10:00' }), {
    checkpoints: [entrada, salida],
    now,
  });

  assert.equal(guardada.checkpointId, 'entrada');
});

test('FichadasMemoryStore: si la hora no calza con ningún checkpoint (o es null), usa el checkpoint abierto al momento de la descarga', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const now = new Date(2026, 6, 7, 7, 10, 0);
  entrada.evaluar(now, false); // abre el checkpoint

  const { fichada: guardada } = store.addFichada(fichada({ hora: null, rawHex: '2'.repeat(40) }), {
    checkpoints: [entrada],
    now,
  });

  assert.equal(guardada.checkpointId, 'entrada');
});

test('FichadasMemoryStore: si ningún checkpoint está abierto ni matchea la hora, la fichada queda sin checkpoint asignado pero no se pierde', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const now = new Date(2026, 6, 7, 20, 0, 0); // fuera de cualquier ventana; checkpoint sigue "pendiente"

  const { agregada, fichada: guardada } = store.addFichada(fichada({ hora: null, rawHex: '3'.repeat(40) }), {
    checkpoints: [entrada],
    now,
  });

  assert.equal(agregada, true);
  assert.equal(guardada.checkpointId, null);
});

test('FichadasMemoryStore: una fichada con rawHex ya visto se ignora (FR-017)', () => {
  const store = createFichadasMemoryStore();
  const now = new Date(2026, 6, 7, 7, 10, 0);
  const primera = store.addFichada(fichada({ rawHex: 'ABCD'.repeat(10) }), { now });
  assert.equal(primera.agregada, true);

  const segunda = store.addFichada(fichada({ rawHex: 'ABCD'.repeat(10) }), { now });
  assert.equal(segunda.agregada, false);

  const periodos = store.getPeriodos();
  assert.equal(periodos.length, 1);
  assert.equal(periodos[0].fichadas.length, 1);
});

test('FichadasMemoryStore: la deduplicación por rawHex funciona sin importar en qué checkpoint/ciclo se reciba de nuevo', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', margenMinutos: 30 });
  const salida = new Checkpoint({ id: 'salida', horaEsperada: '16:00', margenMinutos: 30 });

  const primerCiclo = store.addFichada(fichada({ rawHex: 'DEAD'.repeat(10), hora: '07:05:00' }), {
    checkpoints: [entrada, salida],
    now: new Date(2026, 6, 7, 7, 5, 0),
  });
  assert.equal(primerCiclo.agregada, true);

  // El reloj la vuelve a reportar horas después (research.md §9): el reloj no
  // borra fichadas, así que sigue apareciendo como pendiente en ciclos
  // posteriores, incluso durante otro checkpoint.
  const segundoCiclo = store.addFichada(fichada({ rawHex: 'DEAD'.repeat(10), hora: '07:05:00' }), {
    checkpoints: [entrada, salida],
    now: new Date(2026, 6, 7, 16, 5, 0),
  });
  assert.equal(segundoCiclo.agregada, false);

  assert.equal(store.getFichadasPorLegajo(1).length, 1);
});
