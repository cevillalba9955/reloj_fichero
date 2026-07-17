import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startService } from '../../src/service/consulta-programada-service.js';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';

// T040 (feature 010, US4) — startService() expone `tick()` en el handle
// devuelto (antes solo { getState, stop }), para que el servidor de control
// HTTP local (research.md §4) pueda disparar un ciclo bajo demanda y devolver
// su resultado (misma forma que getUltimoCiclo()).

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

// Mock de reloj: cada conexión responde 0 fichadas pendientes (guion por
// conexión, mismo patrón que service-state.test.js).
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
          received = received.subarray(step.expect.length);
          socket.write(step.respond);
          stepIndex += 1;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('handle.tick(): consulta al reloj aunque no haya ventana de checkpoint abierta', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'rs596-tick-fuera-'));
  const server = await startEmptyMockServer();
  const { port } = server.address();
  // 15:00: bien fuera de la ventana de entrada (07:00 + 30 min).
  const now = () => new Date(2026, 6, 7, 15, 0, 0, 0);

  const handle = startService({
    host: '127.0.0.1',
    port,
    logDir,
    now,
    timeoutMs: 2000,
    tickIntervalMs: 60 * 60 * 1000,
    checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
  });

  try {
    await new Promise((r) => setTimeout(r, 200));
    // El ciclo AUTOMÁTICO del start() respeta la ventana: fuera de horario se
    // omite sin abrir sesión (comportamiento de 002, sin cambios).
    assert.equal(handle.getState().ultimoCiclo.resultado, 'omitido');

    // La consulta MANUAL (feature 010) es un disparo explícito del
    // administrador: fuerza la sesión aunque la ventana esté cerrada.
    const ciclo = await handle.tick();
    assert.equal(ciclo.resultado, 'success', 'la consulta manual no depende de la ventana');
    assert.equal(ciclo.fichadasNuevas, 0);
  } finally {
    handle.stop();
    server.close();
    rmSync(logDir, { recursive: true, force: true });
  }
});

test('startService(): el handle expone tick() y devuelve el resultado del ciclo', async () => {
  const logDir = mkdtempSync(join(tmpdir(), 'rs596-tick-'));
  const server = await startEmptyMockServer();
  const { port } = server.address();
  const now = () => new Date(2026, 6, 7, 7, 0, 0, 0); // dentro de la ventana

  const handle = startService({
    host: '127.0.0.1',
    port,
    logDir,
    now,
    timeoutMs: 2000,
    tickIntervalMs: 60 * 60 * 1000,
    checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
  });

  try {
    assert.equal(typeof handle.tick, 'function', 'el handle expone tick()');
    // Deja terminar el primer ciclo del start() para no chocar el single-flight.
    await new Promise((r) => setTimeout(r, 200));

    const ciclo = await handle.tick();
    assert.ok(ciclo, 'tick() devuelve el ciclo registrado');
    assert.ok(['success', 'error', 'omitido'].includes(ciclo.resultado));
    assert.equal(typeof ciclo.fichadasNuevas, 'number');
  } finally {
    handle.stop();
    server.close();
    rmSync(logDir, { recursive: true, force: true });
  }
});
