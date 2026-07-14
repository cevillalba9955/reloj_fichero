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
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const now = new Date(2026, 6, 7, 7, 10, 0);

  const { fichada: guardada } = store.addFichada(fichada({ hora: '07:10:00' }), {
    checkpoints: [entrada],
    now,
  });

  assert.equal(guardada.checkpointId, 'entrada');
});

test('FichadasMemoryStore: si la hora no calza con ningún checkpoint (o es null), usa el checkpoint abierto al momento de la descarga', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
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
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const now = new Date(2026, 6, 7, 20, 0, 0); // fuera de cualquier ventana; checkpoint sigue "pendiente"

  const { agregada, fichada: guardada } = store.addFichada(fichada({ hora: null, rawHex: '3'.repeat(40) }), {
    checkpoints: [entrada],
    now,
  });

  assert.equal(agregada, true);
  assert.equal(guardada.checkpointId, null);
});

test('FichadasMemoryStore: una fichada con hora válida fuera de toda ventana NO se taguea al checkpoint abierto (fallback solo para hora null, FR-006)', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const now = new Date(2026, 6, 8, 7, 5, 0); // entrada abierta (07:05 de hoy)
  entrada.evaluar(now, false);

  // Salida de ayer (16:10) que el reloj recién reporta hoy, durante la ventana
  // de entrada: tiene hora válida pero fuera de la ventana -> checkpointId null.
  const { agregada, fichada: guardada } = store.addFichada(
    fichada({ fecha: '2026-07-07', hora: '16:10:00', rawHex: '4'.repeat(40) }),
    { checkpoints: [entrada], now }
  );

  assert.equal(agregada, true);
  assert.equal(guardada.checkpointId, null);
});

test('FichadasMemoryStore: la completitud por checkpoint se acota al día de servicio (una fichada de un día previo no completa el checkpoint de hoy)', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });

  // Fichada de entrada de AYER (2026-07-07), tagueada 'entrada'.
  store.addFichada(
    fichada({ fecha: '2026-07-07', hora: '07:05:00', rawHex: '5'.repeat(40) }),
    { checkpoints: [entrada], now: new Date(2026, 6, 7, 7, 5, 0) }
  );

  assert.equal(store.tieneFichadaValidaParaCheckpoint(1, 'entrada', '2026-07-07'), true, 'completo ayer');
  assert.equal(store.tieneFichadaValidaParaCheckpoint(1, 'entrada', '2026-07-08'), false, 'no completa hoy con la fichada de ayer');

  // Cuando el legajo ficha HOY, sí queda completo hoy.
  store.addFichada(
    fichada({ fecha: '2026-07-08', hora: '07:05:00', rawHex: '6'.repeat(40) }),
    { checkpoints: [entrada], now: new Date(2026, 6, 8, 7, 5, 0) }
  );
  assert.equal(store.tieneFichadaValidaParaCheckpoint(1, 'entrada', '2026-07-08'), true);
});

test('FichadasMemoryStore: una fichada con hora null tagueada por el checkpoint abierto cuenta para el día de su recolección', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  const now = new Date(2026, 6, 8, 7, 5, 0);
  entrada.evaluar(now, false);

  store.addFichada(
    fichada({ fecha: null, hora: null, rawHex: '7'.repeat(40) }),
    { checkpoints: [entrada], now }
  );

  assert.equal(store.tieneFichadaValidaParaCheckpoint(1, 'entrada', '2026-07-08'), true);
  assert.equal(store.tieneFichadaValidaParaCheckpoint(1, 'entrada', '2026-07-07'), false);
});

test('FichadasMemoryStore: getFichadaQueCompleta devuelve la fichada del día (con su rawHex) o null', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
  store.addFichada(
    fichada({ fecha: '2026-07-08', hora: '07:05:00', rawHex: '8'.repeat(40) }),
    { checkpoints: [entrada], now: new Date(2026, 6, 8, 7, 5, 0) }
  );

  const completa = store.getFichadaQueCompleta(1, 'entrada', '2026-07-08');
  assert.equal(completa?.rawHex, '8'.repeat(40));
  assert.equal(store.getFichadaQueCompleta(1, 'entrada', '2026-07-07'), null);
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

test('FichadasMemoryStore: la deduplicación por rawHex funciona sin importar en qué ciclo se reciba de nuevo', () => {
  const store = createFichadasMemoryStore();
  const entrada = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });

  const primerCiclo = store.addFichada(fichada({ rawHex: 'DEAD'.repeat(10), hora: '07:05:00' }), {
    checkpoints: [entrada],
    now: new Date(2026, 6, 7, 7, 5, 0),
  });
  assert.equal(primerCiclo.agregada, true);

  // El reloj la vuelve a reportar horas después (research.md §9): el reloj no
  // borra fichadas, así que sigue apareciendo como pendiente en ciclos
  // posteriores, incluso con la ventana de "entrada" ya cerrada.
  const segundoCiclo = store.addFichada(fichada({ rawHex: 'DEAD'.repeat(10), hora: '07:05:00' }), {
    checkpoints: [entrada],
    now: new Date(2026, 6, 7, 16, 5, 0),
  });
  assert.equal(segundoCiclo.agregada, false);

  assert.equal(store.getFichadasPorLegajo(1).length, 1);
});
