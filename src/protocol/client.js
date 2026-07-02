import { connect as netConnect } from 'node:net';
import {
  isKeepalive,
  KEEPALIVE_SIZE,
  ACK_SIZE,
  MARKER_COMMAND,
  PARAMS_RESPONSE_SIZE,
  IDENTIFICATION_RESPONSE_SIZE,
  parseAckHeader,
} from './framing.js';
import {
  buildHandshakeCommand,
  buildParamsCommand,
  buildIdentificationCommand,
  buildCloseOperationCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
} from './commands.js';
import { RECORD_SIZE } from './records.js';

export class ConexionRechazadaError extends Error {}
export class RespuestaInesperadaError extends Error {}

// Lee un socket TCP como stream de bytes acumulados, entregando trozos
// exactos bajo demanda (research.md §2: el tamano de cada mensaje depende
// del comando en curso, no hay delimitador generico). Descarta de forma
// transparente los paquetes "keepalive" de 6 bytes en 00 que el research
// doc documenta como intercalados entre mensajes reales (research.md §3).
export class BufferedSocketReader {
  constructor(socket, { onKeepalive } = {}) {
    this.socket = socket;
    this.chunks = [];
    this.length = 0;
    this.waiters = [];
    this.onKeepalive = onKeepalive;
    this.closed = false;
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
  }

  _onData(chunk) {
    this.chunks.push(chunk);
    this.length += chunk.length;
    this._stripLeadingKeepalives();
    this._drainWaiters();
  }

  _onClose() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new RespuestaInesperadaError('El socket se cerro mientras se esperaba una respuesta'));
    }
  }

  _stripLeadingKeepalives() {
    while (this.length >= KEEPALIVE_SIZE) {
      const buffer = Buffer.concat(this.chunks, this.length);
      const head = buffer.subarray(0, KEEPALIVE_SIZE);
      if (!isKeepalive(head)) break;
      const rest = buffer.subarray(KEEPALIVE_SIZE);
      this.chunks = rest.length > 0 ? [rest] : [];
      this.length = rest.length;
      this.onKeepalive?.(head);
    }
  }

  _drainWaiters() {
    while (this.waiters.length > 0 && this.length >= this.waiters[0].n) {
      const waiter = this.waiters.shift();
      waiter.resolve(this._takeExact(waiter.n));
    }
  }

  _takeExact(n) {
    const buffer = Buffer.concat(this.chunks, this.length);
    const result = Buffer.from(buffer.subarray(0, n));
    const rest = buffer.subarray(n);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.length = rest.length;
    return result;
  }

  readExact(n, { timeoutMs }) {
    this._stripLeadingKeepalives();
    if (this.length >= n) {
      return Promise.resolve(this._takeExact(n));
    }
    if (this.closed) {
      return Promise.reject(new RespuestaInesperadaError('El socket ya esta cerrado'));
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        n,
        resolve: (buf) => {
          clearTimeout(timer);
          resolve(buf);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new RespuestaInesperadaError(`Timeout esperando ${n} bytes (limite ${timeoutMs}ms)`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

export function connectSocket(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ConexionRechazadaError(`Timeout conectando a ${host}:${port} (limite ${timeoutMs}ms)`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new ConexionRechazadaError(`No se pudo conectar a ${host}:${port}: ${err.message}`));
    });
  });
}

// FR-008: cierre garantizado del socket sin importar como termino la sesion.
export function closeSession(socket, logger) {
  socket.destroy();
  logger.log('session_closed', {});
}

function nowIso() {
  return new Date().toISOString();
}

// FR-003/FR-004: consulta cuantas fichadas hay pendientes (0xB4) y, si hay
// alguna, pide el detalle (0xA4), verificado byte a byte contra
// research/protocolo_prosoft_rs596.md §6.
export async function queryPendingFichadas(socket, reader, logger, { timeoutMs, seq }) {
  const countCmd = buildPendingCountCommand(seq);
  socket.write(countCmd);
  logger.log('command_sent', { commandCode: '0xB4', byteLength: countCmd.length });

  const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
  logger.log('response_received', { commandCode: '0xB4', byteLength: ackCount.length });
  const countHeader = parseAckHeader(ackCount);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);

  if (declaredPendingCount === 0) {
    return { declaredPendingCount, rawRecords: [] };
  }

  const detailSeq = seq + 1;
  const detailCmd = buildPendingDetailCommand(detailSeq, declaredPendingCount);
  socket.write(detailCmd);
  logger.log('command_sent', { commandCode: '0xA4', byteLength: detailCmd.length });

  const ackDetail = await reader.readExact(ACK_SIZE, { timeoutMs });
  parseAckHeader(ackDetail);

  const marker = await reader.readExact(2, { timeoutMs });
  if (marker[0] !== MARKER_COMMAND[0] || marker[1] !== MARKER_COMMAND[1]) {
    throw new RespuestaInesperadaError(
      'Respuesta a 0xA4 sin el marcador 55 AA esperado antes del payload (FR-010)'
    );
  }

  // El header de 4 bytes no tiene un significado confirmado (research.md
  // §5.2); se lee y se descarta para mantener el framing, sin interpretarlo.
  await reader.readExact(4, { timeoutMs });

  // No existe un campo de longitud en el protocolo: la unica forma de saber
  // cuantos bytes leer es asumir que coinciden con lo declarado por 0xB4.
  const expectedRecordsBytes = declaredPendingCount * RECORD_SIZE;
  const recordsBuffer = await reader.readExact(expectedRecordsBytes, { timeoutMs });
  logger.log('response_received', {
    commandCode: '0xA4',
    byteLength: ACK_SIZE + 2 + 4 + recordsBuffer.length,
  });

  // FR-014 (comportamiento interino, research.md §5): si ya llegaron mas
  // bytes de los que se leyeron para los registros declarados, es senal de
  // que el reloj mando mas fichadas de las declaradas por 0xB4. Se trata
  // como el mismo error de payload inesperado de FR-010, sin reconciliar.
  if (reader.length > 0) {
    throw new RespuestaInesperadaError(
      `Discrepancia entre fichadas declaradas por 0xB4 (${declaredPendingCount}) y datos recibidos en 0xA4 ` +
      `(sobraron ${reader.length} bytes sin consumir). Comportamiento interino sin resolver (spec FR-014, research.md §5).`
    );
  }

  const rawRecords = [];
  for (let offset = 0; offset < recordsBuffer.length; offset += RECORD_SIZE) {
    rawRecords.push(recordsBuffer.subarray(offset, offset + RECORD_SIZE));
  }

  return { declaredPendingCount, rawRecords };
}

// Orquesta una sesion de consulta completa segun la secuencia real
// confirmada en 3 capturas independientes (research/fichada1.pcapng stream
// 176, research/fichada2.pcapng stream 11, research/fichada3.pcapng stream
// 19, ver research.md §6.4): handshake -> 0x13 parametros -> 0x13
// identificacion -> 0x13 parametros (de nuevo) -> conteo de pendientes ->
// detalle -> cierre de operacion. Los payloads de parametros/identificacion
// no se interpretan (no aportan nada a la consulta de fichadas); solo se
// leen y descartan para mantener el framing del socket sincronizado.
export async function runQuerySession({ host, port, timeoutMs, sessionId, logger }) {
  const session = {
    sessionId,
    deviceHost: host,
    devicePort: port,
    startedAt: nowIso(),
    endedAt: null,
    declaredPendingCount: 0,
    receivedRecordCount: 0,
    status: 'error',
    errorReason: null,
    errorStage: null,
  };

  let socket;
  try {
    socket = await connectSocket(host, port, timeoutMs);
  } catch (err) {
    session.errorReason = err.message;
    session.errorStage = 'connecting';
    session.endedAt = nowIso();
    logger.log('error', { detail: err.message });
    return { session, rawRecords: [] };
  }

  const reader = new BufferedSocketReader(socket, {
    onKeepalive: () => logger.log('keepalive_discarded', {}),
  });

  try {
    let seq = 1;
    const handshakeCmd = buildHandshakeCommand(seq);
    socket.write(handshakeCmd);
    logger.log('command_sent', { commandCode: '0x80', byteLength: handshakeCmd.length });
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x80', byteLength: ACK_SIZE });
    seq += 1;

    const paramsCmd1 = buildParamsCommand(seq);
    socket.write(paramsCmd1);
    logger.log('command_sent', { commandCode: '0x13', byteLength: paramsCmd1.length });
    await reader.readExact(PARAMS_RESPONSE_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x13', byteLength: PARAMS_RESPONSE_SIZE });
    seq += 1;

    const identificationCmd = buildIdentificationCommand(seq);
    socket.write(identificationCmd);
    logger.log('command_sent', { commandCode: '0x13', byteLength: identificationCmd.length });
    await reader.readExact(IDENTIFICATION_RESPONSE_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x13', byteLength: IDENTIFICATION_RESPONSE_SIZE });
    seq += 1;

    const paramsCmd2 = buildParamsCommand(seq);
    socket.write(paramsCmd2);
    logger.log('command_sent', { commandCode: '0x13', byteLength: paramsCmd2.length });
    await reader.readExact(PARAMS_RESPONSE_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x13', byteLength: PARAMS_RESPONSE_SIZE });
    seq += 1;

    const { declaredPendingCount, rawRecords } = await queryPendingFichadas(socket, reader, logger, {
      timeoutMs,
      seq,
    });
    seq += declaredPendingCount > 0 ? 2 : 1;

    const closeCmd = buildCloseOperationCommand(seq);
    socket.write(closeCmd);
    logger.log('command_sent', { commandCode: '0x81', byteLength: closeCmd.length });
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x81', byteLength: ACK_SIZE });

    session.declaredPendingCount = declaredPendingCount;
    session.receivedRecordCount = rawRecords.length;
    session.status = 'success';
    session.endedAt = nowIso();
    closeSession(socket, logger);
    return { session, rawRecords };
  } catch (err) {
    session.errorReason = err.message;
    session.errorStage = err instanceof RespuestaInesperadaError ? 'querying' : 'handshake';
    session.endedAt = nowIso();
    logger.log('error', { detail: err.message });
    closeSession(socket, logger);
    return { session, rawRecords: [] };
  }
}
