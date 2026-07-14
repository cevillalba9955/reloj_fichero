import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startService } from '../../src/service/consulta-programada-service.js';
import { createOracleActiveEmployeesProvider } from '../../src/roster/oracle-active-employees-provider.js';
import { createDailyCachedActiveEmployeesProvider } from '../../src/roster/daily-cached-active-employees-provider.js';
import { createRosterFetchLogger } from '../../src/logging/roster-fetch-logger.js';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildCloseOperationCommand,
} from '../../src/protocol/commands.js';
import { ACK_SIZE } from '../../src/protocol/framing.js';

function ackFor(seq) {
  const buffer = Buffer.alloc(ACK_SIZE);
  Buffer.from([0xaa, 0x55, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]).copy(buffer, 0);
  buffer.writeUInt16LE(seq, 8);
  return buffer;
}

// Construye una fichada de 20 bytes decodificable (mismo formato que la
// integración de la feature 002) para controlar legajo/hora.
function construirFichadaBuffer({ legajo, year, month, day, hour, minute, second = 0 }) {
  const buf = Buffer.alloc(20);
  buf.writeUInt32LE(legajo, 0);
  buf[7] = second;
  buf[8] = (((year - 1964) << 2) | 0b01) & 0xff;
  buf[9] = ((month << 4) | 0b0001) & 0xff;
  const hourMod8 = hour % 8;
  const block = Math.floor(hour / 8);
  buf[10] = ((hourMod8 << 5) | day) & 0xff;
  buf[11] = ((minute << 2) | block) & 0xff;
  buf.write('00000001', 12, 'hex');
  buf.write('00000010', 16, 'hex');
  return buf;
}

function construirPayloadA4Desfasado(registros) {
  if (registros.length === 0) return { header: Buffer.alloc(4), recordsBuffer: Buffer.alloc(0) };
  const header = registros[0].subarray(0, 4);
  const recordsBuffer = Buffer.concat([registros[0].subarray(4, 20), ...registros.slice(1), Buffer.alloc(4)]);
  return { header, recordsBuffer };
}

function startSchedulerMockServerConRegistros(obtenerRegistros) {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      const registros = obtenerRegistros();
      const declaredPendingCount = registros.length;
      let stepIndex = 0;
      let received = Buffer.alloc(0);
      const steps = [
        { expect: buildHandshakeCommand(1), respond: ackFor(1) },
        {
          expect: buildPendingCountCommand(2),
          respond: (() => {
            const buffer = ackFor(2);
            buffer.writeUInt32LE(declaredPendingCount, 4);
            return buffer;
          })(),
        },
      ];
      if (declaredPendingCount > 0) {
        const { header, recordsBuffer } = construirPayloadA4Desfasado(registros);
        steps.push({
          expect: buildPendingDetailCommand(3, declaredPendingCount),
          respond: Buffer.concat([ackFor(3), Buffer.from([0x55, 0xaa]), header, recordsBuffer]),
        });
      }
      const closeSeq = declaredPendingCount > 0 ? 4 : 3;
      steps.push({ expect: buildCloseOperationCommand(closeSeq), respond: ackFor(closeSeq) });
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

async function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-oracle-roster-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function leerEventos(logDir, serviceId) {
  const path = join(logDir, `roster-${serviceId}.ndjson`);
  try {
    return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// Ensambla la cadena real repositorio(fake) → provider Oracle → decorator diario.
function armarCadenaOracle({ repository, now, logDir, serviceId }) {
  const logger = createRosterFetchLogger({ serviceId, logDir, now });
  const inner = createOracleActiveEmployeesProvider({ repository, logger });
  return createDailyCachedActiveEmployeesProvider({ inner, now, logger });
}

// ---- Escenario 2 (US1 / FR-001): drop-in, completitud contra el padrón Oracle ----
test('drop-in: el checkpoint cierra por cerrado_completo con el padrón Oracle (fake), sin archivo local', async () => {
  await withTempLogDir(async (logDir) => {
    const registros = [
      construirFichadaBuffer({ legajo: 101, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
      construirFichadaBuffer({ legajo: 102, year: 2026, month: 7, day: 7, hour: 7, minute: 1 }),
    ];
    const server = await startSchedulerMockServerConRegistros(() => registros);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const repository = { fetchLegajosActivos: async () => [101, 102] };
    const rosterProvider = armarCadenaOracle({ repository, now, logDir, serviceId: 'svc-drop-in' });

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
      assert.equal(state.checkpoints.find((cp) => cp.id === 'entrada').estado, 'cerrado_completo');
      assert.deepEqual(state.empleados.map((e) => e.legajo).sort(), [101, 102]);
      assert.ok(leerEventos(logDir, 'svc-drop-in').some((e) => e.evento === 'padron_fresco'));
    } finally {
      handle.stop();
      server.close();
    }
  });
});

// ---- Escenario 5 (US1 / FR-014): una consulta a la fuente por día de servicio ----
test('una consulta a la fuente por día: N llamadas el mismo día → 1 fetch; al día siguiente → 2', async () => {
  await withTempLogDir(async (logDir) => {
    let ahora = new Date(2026, 6, 7, 7, 0, 0, 0);
    let fetches = 0;
    const repository = {
      async fetchLegajosActivos() {
        fetches += 1;
        return [101, 102];
      },
    };
    const rosterProvider = armarCadenaOracle({ repository, now: () => ahora, logDir, serviceId: 'svc-diario' });

    for (let i = 0; i < 5; i += 1) await rosterProvider.getActiveEmployees();
    assert.equal(fetches, 1, 'todas las llamadas del mismo día comparten un único fetch');

    ahora = new Date(2026, 6, 8, 7, 0, 0, 0);
    await rosterProvider.getActiveEmployees();
    assert.equal(fetches, 2, 'el nuevo día vuelve a consultar la fuente');
  });
});

// ---- Escenario 3 (US2 / FR-008): respaldo con el último padrón válido ----
test('respaldo: caído el día 2, sigue evaluando con el snapshot del día 1 y loguea padron_respaldo con obtenidoEn', async () => {
  await withTempLogDir(async (logDir) => {
    let ahora = new Date(2026, 6, 7, 7, 0, 0, 0);
    let caido = false;
    const repository = {
      async fetchLegajosActivos() {
        if (caido) throw new Error('fuente RRHH caída');
        return [101, 102];
      },
    };
    const rosterProvider = armarCadenaOracle({ repository, now: () => ahora, logDir, serviceId: 'svc-respaldo' });

    const dia1 = await rosterProvider.getActiveEmployees();
    assert.deepEqual(dia1.map((e) => e.legajo), [101, 102]);

    // Día 2: la fuente cae.
    ahora = new Date(2026, 6, 8, 7, 0, 0, 0);
    caido = true;
    const dia2 = await rosterProvider.getActiveEmployees();
    assert.deepEqual(dia2.map((e) => e.legajo), [101, 102], 'sirve el respaldo del día 1');

    const eventos = leerEventos(logDir, 'svc-respaldo');
    const respaldo = eventos.find((e) => e.evento === 'padron_respaldo');
    assert.ok(respaldo && respaldo.obtenidoEn, 'registra el respaldo con la antigüedad del snapshot (SC-003)');

    // La fuente se recupera el día 3 → padrón fresco de nuevo.
    ahora = new Date(2026, 6, 9, 7, 0, 0, 0);
    caido = false;
    await rosterProvider.getActiveEmployees();
    assert.ok(leerEventos(logDir, 'svc-respaldo').filter((e) => e.evento === 'padron_fresco').length >= 2);
  });
});

// ---- Escenario 4 (US2 / FR-011): padrón vacío no cierra nada y se reintenta ----
test('padrón vacío: se registra como error/padron_vacio, no cierra por completitud y reintenta', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startSchedulerMockServerConRegistros(() => [
      construirFichadaBuffer({ legajo: 101, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
    ]);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const repository = { fetchLegajosActivos: async () => [] }; // vacío exitoso, sin snapshot previo
    const rosterProvider = armarCadenaOracle({ repository, now, logDir, serviceId: 'svc-vacio' });

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
      assert.equal(state.ultimoCiclo.resultado, 'error', 'el padrón vacío se trata como fuente no disponible');
      assert.notEqual(
        state.checkpoints.find((cp) => cp.id === 'entrada').estado,
        'cerrado_completo',
        'ningún checkpoint cierra por completitud con universo vacío'
      );
      assert.ok(leerEventos(logDir, 'svc-vacio').some((e) => e.evento === 'padron_vacio'));
    } finally {
      handle.stop();
      server.close();
    }
  });
});
