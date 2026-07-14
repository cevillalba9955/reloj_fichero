import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startService } from '../../src/service/consulta-programada-service.js';
import { createFichadasMemoryStore } from '../../src/store/fichadas-memory-store.js';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-service-state-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Mock minimo: 0 fichadas pendientes (alcanza para validar la forma del
// snapshot completo, contracts/state-schema.json).
function startEmptyMockServer() {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let stepIndex = 0;
      let received = Buffer.alloc(0);
      const steps = [
        { expect: buildHandshakeCommand(1), respond: ackFor(1) },
        {
          expect: buildPendingCountCommand(2),
          respond: (() => {
            const buffer = ackFor(2);
            buffer.writeUInt32LE(0, 4);
            return buffer;
          })(),
        },
        { expect: buildCloseOperationCommand(3), respond: ackFor(3) },
      ];
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        const step = steps[stepIndex];
        if (!step) return;
        if (received.length >= step.expect.length) {
          const actual = received.subarray(0, step.expect.length);
          received = received.subarray(step.expect.length);
          assert.deepEqual(actual, step.expect, `paso ${stepIndex}: bytes recibidos no coinciden con el guion`);
          socket.write(step.respond);
          stepIndex += 1;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('getState(): cumple la forma completa de contracts/state-schema.json cuando hay rosterProvider configurado', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startEmptyMockServer();
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const rosterProvider = { getActiveEmployees: async () => [{ legajo: 1, activo: true }] };

    const handle = startService({
      host: '127.0.0.1',
      port,
      logDir,
      now,
      timeoutMs: 2000,
      tickIntervalMs: 60 * 60 * 1000,
      checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
      rosterProvider,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const state = handle.getState();

      // contracts/state-schema.json: required top-level fields.
      for (const campo of ['fechaServicio', 'checkpoints', 'empleados', 'periodos', 'ultimoCiclo']) {
        assert.ok(campo in state, `getState() debe incluir "${campo}"`);
      }
      assert.match(state.fechaServicio, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(Array.isArray(state.checkpoints));
      for (const cp of state.checkpoints) {
        for (const campo of ['id', 'horaEsperada', 'duracionMinutos', 'estado']) {
          assert.ok(campo in cp, `cada checkpoint debe incluir "${campo}"`);
        }
      }
      assert.ok(Array.isArray(state.empleados));
      for (const empleado of state.empleados) {
        for (const campo of ['legajo', 'activo', 'checkpoints']) {
          assert.ok(campo in empleado, `cada empleado debe incluir "${campo}"`);
        }
        for (const cp of state.checkpoints) {
          assert.ok('completo' in empleado.checkpoints[cp.id], `empleado.checkpoints.${cp.id} debe incluir "completo"`);
        }
      }
      assert.ok(Array.isArray(state.periodos));
      assert.ok(state.ultimoCiclo);
      for (const campo of ['ejecutadoEn', 'resultado', 'fichadasNuevas', 'duracionMs']) {
        assert.ok(campo in state.ultimoCiclo, `ultimoCiclo debe incluir "${campo}"`);
      }
      assert.ok(['success', 'error', 'omitido'].includes(state.ultimoCiclo.resultado));
    } finally {
      handle.stop();
      server.close();
    }
  });
});

test('FichadasMemoryStore/getPeriodos(): fichadas del mismo legajo en meses distintos quedan en períodos separados', () => {
  const store = createFichadasMemoryStore();
  store.addFichada(
    {
      legajo: 1,
      metodo: 'huella',
      fecha: '2026-06-30',
      hora: '23:59:00',
      rawHex: '1'.repeat(40),
    },
    { now: new Date(2026, 5, 30, 23, 59, 0) }
  );
  store.addFichada(
    {
      legajo: 1,
      metodo: 'huella',
      fecha: '2026-07-01',
      hora: '00:01:00',
      rawHex: '2'.repeat(40),
    },
    { now: new Date(2026, 6, 1, 0, 1, 0) }
  );

  const periodos = store.getPeriodos();
  const idsDelLegajo1 = periodos.filter((p) => p.legajo === 1).map((p) => p.id).sort();
  assert.deepEqual(idsDelLegajo1, ['2026-06', '2026-07']);
  assert.equal(periodos.find((p) => p.id === '2026-06').fichadas.length, 1);
  assert.equal(periodos.find((p) => p.id === '2026-07').fichadas.length, 1);
});

test('FichadasMemoryStore/getPeriodos(): una fichada con fecha null se agrupa por la fecha de recolección, marcada como aproximada', () => {
  const store = createFichadasMemoryStore();
  const now = new Date(2026, 6, 7, 12, 0, 0);
  const { fichada } = store.addFichada(
    { legajo: 2, metodo: null, fecha: null, hora: null, rawHex: '3'.repeat(40) },
    { now }
  );

  assert.equal(fichada.periodo, '2026-07');
  assert.equal(fichada.periodoAproximado, true);
  const periodo = store.getPeriodos().find((p) => p.legajo === 2 && p.id === '2026-07');
  assert.ok(periodo);
  assert.equal(periodo.fichadas[0].periodoAproximado, true);
});
