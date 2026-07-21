import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScheduler } from '../../src/scheduling/scheduler.js';
import { createFichadasMemoryStore } from '../../src/store/fichadas-memory-store.js';
import { Checkpoint } from '../../src/scheduling/checkpoint.js';
import { startService } from '../../src/service/consulta-programada-service.js';
import { createFichadasSink } from '../../src/cli/consulta-programada.js';
import { cargarFichadasArchivadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';
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

// Registro real de fichada3.pcapng stream 19 (ver 001-consulta-fichadas-rs596).
const REGISTRO_REAL = Buffer.from('0100002df9712279000000010000004074030000', 'hex');

// Construye un registro de 20 bytes ya re-encuadrado y totalmente decodificable
// (fecha/hora/legajo/metodo), siguiendo el formato de
// 001-consulta-fichadas-rs596 (research.md §5.16), para controlar con
// precision legajo/hora en los tests de completitud por checkpoint (US2).
function construirFichadaBuffer({
  legajo,
  year,
  month,
  day,
  hour,
  minute,
  second = 0,
  verificationMethodCode = '00000010',
  recordTypeConstant = '00000001',
}) {
  const buf = Buffer.alloc(20);
  buf.writeUInt32LE(legajo, 0);
  buf[7] = second;
  buf[8] = (((year - 1964) << 2) | 0b01) & 0xff;
  buf[9] = ((month << 4) | 0b0001) & 0xff;
  const hourMod8 = hour % 8;
  const block = Math.floor(hour / 8);
  buf[10] = ((hourMod8 << 5) | day) & 0xff;
  buf[11] = ((minute << 2) | block) & 0xff;
  buf.write(recordTypeConstant, 12, 'hex');
  buf.write(verificationMethodCode, 16, 'hex');
  return buf;
}

function withTempLogDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'rs596-scheduler-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Servidor mock que, en cada conexion TCP nueva, ejecuta la secuencia
// reducida (handshake -> 0xB4 -> [0xA4] -> 0x81), devolviendo en cada
// conexion el conteo que indique `obtenerDeclaredPendingCount`.
function startSchedulerMockServer(obtenerDeclaredPendingCount) {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      const declaredPendingCount = obtenerDeclaredPendingCount();
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
        steps.push({
          expect: buildPendingDetailCommand(3, declaredPendingCount),
          respond: Buffer.concat([
            ackFor(3),
            Buffer.from([0x55, 0xaa]),
            Buffer.from('01000000', 'hex'),
            ...Array(declaredPendingCount).fill(REGISTRO_REAL),
          ]),
        });
      }
      const closeSeq = declaredPendingCount > 0 ? 4 : 3;
      steps.push({ expect: buildCloseOperationCommand(closeSeq), respond: ackFor(closeSeq) });
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

// El cliente de 001-consulta-fichadas-rs596 reconstruye cada registro de 20
// bytes concatenando un "header" de 4 bytes previo con el resto del payload
// y volviendo a trocear en bloques de 20 (research.md §5.9/§5.14 de esa
// feature: es un desfasaje real del protocolo, no un bug). Para que el mock
// entregue exactamente los registros ya construidos (con legajo/hora
// controlados), hay que armar el payload en el mismo formato "desfasado":
// header = primeros 4 bytes del registro 0; el resto del buffer es
// [registro0[4:20]] + [registros 1..N-1 completos] + 4 bytes de cierre
// (descartados por el cliente, research.md §5.14).
function construirPayloadA4Desfasado(registros) {
  if (registros.length === 0) {
    return { header: Buffer.alloc(4), recordsBuffer: Buffer.alloc(0) };
  }
  const header = registros[0].subarray(0, 4);
  const recordsBuffer = Buffer.concat([
    registros[0].subarray(4, 20),
    ...registros.slice(1),
    Buffer.alloc(4),
  ]);
  return { header, recordsBuffer };
}

// Variante de startSchedulerMockServer que devuelve, en cada conexion, un
// arreglo arbitrario de registros de 20 bytes ya construidos (en vez de
// repetir siempre el mismo REGISTRO_REAL) — usado en los tests de US2 para
// controlar legajo/hora por fichada.
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

test('scheduler: consulta al reloj mientras el checkpoint esta abierto, acumula fichadas nuevas (sin duplicar), y deja de consultar tras vencer la ventana', async () => {
  await withTempLogDir(async (logDir) => {
    let conexiones = 0;
    const server = await startSchedulerMockServer(() => {
      conexiones += 1;
      return 1; // el reloj no borra fichadas: reporta la misma cada vez
    });
    const { port } = server.address();

    const store = createFichadasMemoryStore();
    const checkpoint = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 10 });

    // horaEsperada=07:00 (420 min), duracion=10 -> ventana de un solo lado
    // [420,430] = 07:00-07:10.
    let minutosSimulados = -15; // 06:45, fuera de ventana (antes de 07:00)
    const now = () => {
      const d = new Date(2026, 6, 7, 7, 0, 0, 0);
      d.setMinutes(d.getMinutes() + minutosSimulados);
      return d;
    };

    const scheduler = createScheduler({
      host: '127.0.0.1',
      port,
      checkpoints: [checkpoint],
      store,
      logDir,
      now,
      timeoutMs: 2000,
    });

    // Tick 1: 06:45, fuera de ventana -> no debe consultar.
    await scheduler.tick();
    assert.equal(scheduler.getUltimoCiclo().resultado, 'omitido');
    assert.equal(conexiones, 0);

    // Tick 2: 07:00, dentro de ventana -> consulta y acumula la fichada.
    minutosSimulados = 0;
    await scheduler.tick();
    assert.equal(scheduler.getUltimoCiclo().resultado, 'success');
    assert.equal(scheduler.getUltimoCiclo().fichadasNuevas, 1);
    assert.equal(
      store.getPeriodos().reduce((acc, p) => acc + p.fichadas.length, 0),
      1
    );

    // Tick 3: 07:05, todavia dentro de la ventana -> vuelve a consultar, pero el
    // reloj repite la misma fichada (no la borra): 0 nuevas (FR-017).
    minutosSimulados = 5;
    await scheduler.tick();
    assert.equal(scheduler.getUltimoCiclo().resultado, 'success');
    assert.equal(scheduler.getUltimoCiclo().fichadasNuevas, 0);
    assert.equal(conexiones, 2);

    // Tick 4: 07:11, ventana vencida -> el checkpoint cierra, no debe consultar mas.
    minutosSimulados = 11;
    await scheduler.tick();
    assert.equal(checkpoint.estado, 'cerrado_ventana_vencida');
    assert.equal(scheduler.getUltimoCiclo().resultado, 'omitido');
    assert.equal(conexiones, 2);

    server.close();
  });
});

test('scheduler: persiste las fichadas del ciclo en el archivo por período, legible por el consumidor (spec 005/US1)', async () => {
  await withTempLogDir(async (logDir) => {
    const repoDir = mkdtempSync(join(tmpdir(), 'rs596-fichadas-'));
    const registros = [
      construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
      construirFichadaBuffer({ legajo: 2, year: 2026, month: 7, day: 7, hour: 7, minute: 1 }),
    ];
    const server = await startSchedulerMockServerConRegistros(() => registros);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const store = createFichadasMemoryStore();
    const checkpoint = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });

    const scheduler = createScheduler({
      host: '127.0.0.1',
      port,
      checkpoints: [checkpoint],
      store,
      logDir,
      now,
      timeoutMs: 2000,
      persistirFichadas: createFichadasSink({ repoDir, now }),
    });

    try {
      await scheduler.tick();
      assert.equal(scheduler.getUltimoCiclo().resultado, 'success');

      // El consumidor (archive-fichadas-provider) lee lo que el servicio escribió,
      // en forma de dominio y sin rawHex.
      const provider = createArchiveFichadasProvider({ repoDir });
      const f1 = await provider.obtenerFichadasDelMes(1, '202607');
      const f2 = await provider.obtenerFichadasDelMes(2, '202607');
      assert.equal(f1.length, 1);
      assert.equal(f2.length, 1);
      assert.ok([...f1, ...f2].every((f) => f.rawHex === undefined), 'el dominio no ve rawHex');

      // El archivo durable SÍ guarda rawHex (trazabilidad técnica).
      const guardadas = cargarFichadasArchivadas({ repoDir, periodo: '202607' });
      assert.equal(guardadas.length, 2);
      assert.ok(guardadas.every((f) => typeof f.rawHex === 'string'));
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
      server.close();
    }
  });
});

test('scheduler: un fallo de persistencia registra el ciclo como error y se reintenta sin perder fichadas (spec 005/FR-004)', async () => {
  await withTempLogDir(async (logDir) => {
    const repoDir = mkdtempSync(join(tmpdir(), 'rs596-fichadas-'));
    const registros = [construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 })];
    const server = await startSchedulerMockServerConRegistros(() => registros);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const store = createFichadasMemoryStore();
    const checkpoint = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });

    const realSink = createFichadasSink({ repoDir, now });
    let fallar = true;
    const persistirFichadas = (fichadas) => {
      if (fallar) {
        fallar = false;
        throw new Error('disco no disponible (simulado)');
      }
      return realSink(fichadas);
    };
    const scheduler = createScheduler({
      host: '127.0.0.1',
      port,
      checkpoints: [checkpoint],
      store,
      logDir,
      now,
      timeoutMs: 2000,
      persistirFichadas,
    });

    try {
      // Tick 1: la persistencia falla → ciclo error, nada persistido.
      await scheduler.tick();
      assert.equal(scheduler.getUltimoCiclo().resultado, 'error');
      assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202607' }).length, 0);

      // Tick 2: el reloj re-reporta la misma fichada; se persiste (dedup por rawHex).
      await scheduler.tick();
      assert.equal(scheduler.getUltimoCiclo().resultado, 'success');
      assert.equal(cargarFichadasArchivadas({ repoDir, periodo: '202607' }).length, 1);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
      server.close();
    }
  });
});

test('scheduler: si una consulta todavia esta en curso, un tick concurrente no dispara una segunda consulta en paralelo (single-flight)', async () => {
  await withTempLogDir(async (logDir) => {
    let conexionesAbiertas = 0;
    const server = createServer((socket) => {
      conexionesAbiertas += 1;
      // Responde muy lento a proposito para mantener la "consulta en curso"
      // el tiempo suficiente como para que el segundo tick la encuentre activa.
      let received = Buffer.alloc(0);
      const handshakeCmd = buildHandshakeCommand(1);
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.length >= handshakeCmd.length) {
          setTimeout(() => socket.write(ackFor(1)), 200);
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const store = createFichadasMemoryStore();
    const checkpoint = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);

    const scheduler = createScheduler({
      host: '127.0.0.1',
      port,
      checkpoints: [checkpoint],
      store,
      logDir,
      now,
      timeoutMs: 2000,
    });

    const primerTick = scheduler.tick();
    // Se dispara un segundo tick mientras el primero sigue esperando la
    // respuesta lenta del mock -> debe quedar "omitido" de inmediato.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await scheduler.tick();
    assert.equal(scheduler.getUltimoCiclo().resultado, 'omitido');
    assert.equal(conexionesAbiertas, 1, 'el segundo tick no debe abrir una nueva conexion TCP');

    await primerTick;
    server.close();
  });
});

test('startService/stop: orquesta scheduler + store + cliente existente, y getState() refleja fichadas acumuladas sin empleados[] todavia (US1)', async () => {
  await withTempLogDir(async (logDir) => {
    const server = await startSchedulerMockServer(() => 1);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);

    const handle = startService({
      host: '127.0.0.1',
      port,
      logDir,
      now,
      timeoutMs: 2000,
      tickIntervalMs: 60 * 60 * 1000, // no queremos un segundo tick real durante el test
      checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
    });

    try {
      // start() dispara un primer tick de inmediato (Edge Case: arranque a
      // mitad de ventana); esperamos a que termine antes de inspeccionar.
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = handle.getState();
      assert.equal(state.fechaServicio, '2026-07-07');
      assert.ok(Array.isArray(state.checkpoints));
      assert.equal(state.checkpoints.find((cp) => cp.id === 'entrada')?.estado, 'abierto');
      assert.equal(
        state.periodos.reduce((acc, p) => acc + p.fichadas.length, 0),
        1
      );
      assert.equal(state.empleados, undefined, 'US1 todavia no expone empleados[] (lo agrega US2)');
      assert.ok(state.ultimoCiclo);
      assert.equal(state.ultimoCiclo.resultado, 'success');
    } finally {
      // Siempre detener el scheduler y cerrar el mock, incluso si una
      // aserción falla: de lo contrario el setInterval real queda vivo y
      // cuelga la corrida de tests (research.md/contracts no lo advierten,
      // es un detalle de higiene de los tests).
      handle.stop();
      server.close();
    }
  });
});

test('startService: el checkpoint "entrada" se cierra por completitud (cerrado_completo) antes de vencer su ventana cuando todos los empleados activos ya ficharon (US2)', async () => {
  await withTempLogDir(async (logDir) => {
    const registros = [
      construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
      construirFichadaBuffer({ legajo: 2, year: 2026, month: 7, day: 7, hour: 7, minute: 1 }),
    ];
    const server = await startSchedulerMockServerConRegistros(() => registros);
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const rosterProvider = {
      getActiveEmployees: async () => [
        { legajo: 1, activo: true },
        { legajo: 2, activo: true },
      ],
    };

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
      assert.equal(state.empleados.find((e) => e.legajo === 1).checkpoints.entrada.completo, true);
      assert.equal(state.empleados.find((e) => e.legajo === 2).checkpoints.entrada.completo, true);
    } finally {
      handle.stop();
      server.close();
    }
  });
});

test('startService: al vencer la ventana con empleados activos incompletos, el checkpoint cierra por ventana vencida sin alertas ni valores forzados (US2)', async () => {
  await withTempLogDir(async (logDir) => {
    // Solo el legajo 1 ficha; el legajo 2 (activo) nunca lo hace.
    const registros = [construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 })];
    const server = await startSchedulerMockServerConRegistros(() => registros);
    const { port } = server.address();

    let simulado = new Date(2026, 6, 7, 7, 0, 0, 0);
    const now = () => simulado;
    const rosterProvider = {
      getActiveEmployees: async () => [
        { legajo: 1, activo: true },
        { legajo: 2, activo: true },
      ],
    };

    const handle = startService({
      host: '127.0.0.1',
      port,
      logDir,
      now,
      timeoutMs: 2000,
      tickIntervalMs: 30,
      checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
      rosterProvider,
    });

    try {
      // Primer tick (07:00, dentro de ventana): recolecta legajo 1, pero
      // legajo 2 sigue faltando -> el checkpoint no puede cerrar por
      // completitud todavia.
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(handle.getState().checkpoints.find((cp) => cp.id === 'entrada').estado, 'abierto');

      // Vence la ventana (07:00 + 30min = 07:30) sin que legajo 2 fiche.
      simulado = new Date(2026, 6, 7, 7, 35, 0, 0);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const state = handle.getState();
      assert.equal(state.checkpoints.find((cp) => cp.id === 'entrada').estado, 'cerrado_ventana_vencida');
      assert.equal(state.empleados.find((e) => e.legajo === 1).checkpoints.entrada.completo, true);
      assert.equal(
        state.empleados.find((e) => e.legajo === 2).checkpoints.entrada.completo,
        false,
        'legajo 2 debe quedar expuesto como incompleto, sin ningun valor forzado'
      );
    } finally {
      handle.stop();
      server.close();
    }
  });
});

test('startService: si el reloj esta inalcanzable, el ciclo se registra como error y el servicio sigue reintentando en el proximo tick (Edge Case, FR-012)', async () => {
  await withTempLogDir(async (logDir) => {
    // Puerto sin nada escuchando: connectSocket va a rechazar la conexion.
    const rejectedServer = createServer();
    await new Promise((resolve) => rejectedServer.listen(0, '127.0.0.1', resolve));
    const { port } = rejectedServer.address();
    await new Promise((resolve) => rejectedServer.close(resolve));

    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const handle = startService({
      host: '127.0.0.1',
      port,
      logDir,
      now,
      timeoutMs: 500,
      tickIntervalMs: 60 * 60 * 1000,
      checkpoints: { entrada: { horaEsperada: '07:00', duracionMinutos: 30 } },
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const state = handle.getState();
      assert.equal(state.ultimoCiclo.resultado, 'error');
      // El checkpoint sigue "abierto" (no se cerro por completitud ni se
      // rompio el servicio); el proximo tick programado va a reintentar.
      assert.equal(state.checkpoints.find((cp) => cp.id === 'entrada').estado, 'abierto');
    } finally {
      handle.stop();
    }
  });
});

test('startService: si arranca despues de que la ventana de un checkpoint ya vencio, lo cierra de inmediato por ventana vencida sin llegar a consultar (Edge Case)', async () => {
  await withTempLogDir(async (logDir) => {
    let conexiones = 0;
    const server = await startSchedulerMockServer(() => {
      conexiones += 1;
      return 0;
    });
    const { port } = server.address();
    // 08:00, muy por encima de 07:00 + 30min de ventana.
    const now = () => new Date(2026, 6, 7, 8, 0, 0, 0);

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
      await new Promise((resolve) => setTimeout(resolve, 100));
      const state = handle.getState();
      assert.equal(state.checkpoints.find((cp) => cp.id === 'entrada').estado, 'cerrado_ventana_vencida');
      assert.equal(conexiones, 0, 'no debe llegar a consultar al reloj si el checkpoint ya vencio antes de arrancar');
    } finally {
      handle.stop();
      server.close();
    }
  });
});

test('scheduler: una fichada nueva (rawHex distinto) del mismo legajo se agrega igual mientras la ventana sigue abierta, y una vez cerrada por ventana vencida el checkpoint no se reabre ni se vuelve a consultar (Edge Case)', async () => {
  await withTempLogDir(async (logDir) => {
    // Modelo 2026-07-14: un unico checkpoint "entrada". Sin rosterProvider, la
    // completitud queda en false, asi que el checkpoint permanece ABIERTO
    // durante toda su ventana [07:00, 07:30] y solo cierra por vencimiento.
    // Se manejan los ticks a mano para controlar el instante simulado.
    let simulado = new Date(2026, 6, 7, 7, 2, 0, 0);
    const now = () => simulado;

    let registrosDelProximoTick = [
      construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
    ];
    const server = await startSchedulerMockServerConRegistros(() => registrosDelProximoTick);
    const { port } = server.address();

    const store = createFichadasMemoryStore();
    const checkpoint = new Checkpoint({ id: 'entrada', horaEsperada: '07:00', duracionMinutos: 30 });
    const scheduler = createScheduler({
      host: '127.0.0.1',
      port,
      checkpoints: [checkpoint],
      store,
      logDir,
      now,
      timeoutMs: 2000,
    });

    try {
      // Tick 1 (07:02, ventana abierta): legajo 1 ficha a las 07:00 -> se acumula.
      await scheduler.tick();
      assert.equal(checkpoint.estado, 'abierto');
      assert.equal(store.getFichadasPorLegajo(1).length, 1);

      // Tick 2 (07:05, ventana todavia abierta): el reloj re-reporta la @07:00
      // (dedup por rawHex, FR-017) y ademas una fichada nueva y distinta del
      // mismo legajo -> solo se agrega la nueva (2 en total), sin perturbar el
      // checkpoint.
      registrosDelProximoTick = [
        construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 0 }),
        construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 5 }),
      ];
      simulado = new Date(2026, 6, 7, 7, 5, 0, 0);
      await scheduler.tick();
      assert.equal(checkpoint.estado, 'abierto');
      assert.equal(store.getFichadasPorLegajo(1).length, 2);

      // Tick 3 (07:35, ventana vencida): el checkpoint cierra; el tick no
      // consulta al reloj (omitido).
      simulado = new Date(2026, 6, 7, 7, 35, 0, 0);
      await scheduler.tick();
      assert.equal(checkpoint.estado, 'cerrado_ventana_vencida');
      assert.equal(scheduler.getUltimoCiclo().resultado, 'omitido');

      // Tick 4 (07:40): aunque el reloj tuviera una fichada nueva, el checkpoint
      // ya cerrado no se reabre y no se vuelve a consultar -> el acumulado no cambia.
      registrosDelProximoTick = [
        construirFichadaBuffer({ legajo: 1, year: 2026, month: 7, day: 7, hour: 7, minute: 20 }),
      ];
      simulado = new Date(2026, 6, 7, 7, 40, 0, 0);
      await scheduler.tick();
      assert.equal(checkpoint.estado, 'cerrado_ventana_vencida');
      assert.equal(scheduler.getUltimoCiclo().resultado, 'omitido');
      assert.equal(store.getFichadasPorLegajo(1).length, 2);
    } finally {
      scheduler.stop();
      server.close();
    }
  });
});

test('startService: si ActiveEmployeesProvider.getActiveEmployees() falla, el ciclo se registra como error y el servicio no asume un padron vacio (US2/FR-013)', async () => {
  await withTempLogDir(async (logDir) => {
    let conexiones = 0;
    const server = await startSchedulerMockServer(() => {
      conexiones += 1;
      return 1;
    });
    const { port } = server.address();
    const now = () => new Date(2026, 6, 7, 7, 0, 0, 0);
    const rosterProvider = {
      getActiveEmployees: async () => {
        throw new Error('padron RRHH/Oracle no disponible (simulado)');
      },
    };

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
      assert.equal(state.ultimoCiclo.resultado, 'error');
      assert.equal(conexiones, 0, 'no debe intentar consultar al reloj si no pudo evaluar el padron primero');
      assert.notEqual(
        state.checkpoints.find((cp) => cp.id === 'entrada').estado,
        'cerrado_completo',
        'nunca debe asumir completitud (padron vacio ficticio) ante un fallo del padron'
      );
    } finally {
      handle.stop();
      server.close();
    }
  });
});
