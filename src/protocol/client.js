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
  buildPendingDetailContinuationCommand,
  MAX_RECORDS_PER_PAGE,
} from './commands.js';
import { RECORD_SIZE, frameRecords, dedupeFichadas } from './records.js';

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
//
// research.md §5.18 (2026-07-08): para lotes grandes (declaredPendingCount >
// MAX_RECORDS_PER_PAGE) el equipo no responde una sola llamada 0xA4 pidiendo
// todo de una vez (probado en vivo: timeout, socket cerrado sin ACK). Hace
// falta paginar en llamadas sucesivas, replicando el comportamiento
// confirmado del software oficial: la 1ra llamada pide
// min(remaining, MAX_RECORDS_PER_PAGE) registros con el count habitual
// (declaredPendingCount total); las llamadas de continuacion usan un campo
// "count" distinto (indice de pagina, ver buildPendingDetailContinuationCommand)
// y reutilizan como header los ultimos 4 bytes de la pagina anterior en vez
// de leer un header nuevo — el equipo, si se le repite el count original,
// reinicia la entrega desde el primer pendiente en vez de continuar
// (confirmado en vivo, no solo hipotesis).
export async function queryPendingFichadas(socket, reader, logger, { timeoutMs, seq }) {
  const countCmd = buildPendingCountCommand(seq);
  socket.write(countCmd);
  logger.log('command_sent', { commandCode: '0xB4', byteLength: countCmd.length });

  const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
  logger.log('response_received', { commandCode: '0xB4', byteLength: ackCount.length });
  const countHeader = parseAckHeader(ackCount);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);

  if (declaredPendingCount === 0) {
    return { declaredPendingCount, rawRecords: [], nextSeq: seq + 1 };
  }

  const collected = [];
  let remaining = declaredPendingCount;
  // Bytes de arrastre para completar el primer registro de la pagina en curso.
  // Vacio en la pagina inicial; luego lo fija la pagina anterior (ver abajo).
  let carryIn = Buffer.alloc(0);
  let pageIndex = 0;
  let detailSeq = seq;

  while (remaining > 0) {
    detailSeq += 1;
    const isFirstPage = pageIndex === 0;
    const pageCount = Math.min(remaining, MAX_RECORDS_PER_PAGE);
    const hasMorePages = remaining > pageCount;

    // Fórmula de `byteLen` (feature 006, research.md §D1, verificada byte a
    // byte contra el software oficial en research/fichada.pcapng, lote de 123):
    // - Si hay más páginas por venir: `pageCount*20 + 4` (páginas 1 y 2 = 1024).
    // - En la última página: `pageCount*20 - carryIn.length`. `carryIn` mide 0
    //   en la inicial, 4 si la previa fue la inicial (caso de 2 páginas → -4,
    //   comportamiento previo ya validado) y 8 si la previa fue una
    //   continuación (caso de 3+ páginas → -8; página 3 = 412). El equipo omite
    //   justo esos `carryIn` bytes del primer registro y los espera arrastrados.
    const byteLen = hasMorePages
      ? pageCount * RECORD_SIZE + 4
      : pageCount * RECORD_SIZE - carryIn.length;

    const detailCmd = isFirstPage
      ? buildPendingDetailCommand(detailSeq, declaredPendingCount, byteLen)
      : buildPendingDetailContinuationCommand(detailSeq, pageIndex, byteLen);
    socket.write(detailCmd);
    logger.log('command_sent', {
      commandCode: '0xA4',
      byteLength: detailCmd.length,
      detail: `pagina=${pageIndex + 1} pageCount=${pageCount} byteLen=${byteLen}`,
    });

    const ackDetail = await reader.readExact(ACK_SIZE, { timeoutMs });
    parseAckHeader(ackDetail);

    const marker = await reader.readExact(2, { timeoutMs });
    if (marker[0] !== MARKER_COMMAND[0] || marker[1] !== MARKER_COMMAND[1]) {
      throw new RespuestaInesperadaError(
        'Respuesta a 0xA4 sin el marcador 55 AA esperado antes del payload (FR-010)'
      );
    }

    // El equipo responde SIEMPRE `byteLen + 4` bytes de payload tras el
    // marcador (research.md §D2; confirmado en las 3 páginas de la captura).
    // Los últimos 4 son un bloque de cierre que se descarta.
    const payload = await reader.readExact(byteLen + 4, { timeoutMs });
    const closingBlockHex = payload.subarray(payload.length - 4).toString('hex').toUpperCase();
    logger.log('response_received', {
      commandCode: '0xA4',
      byteLength: ACK_SIZE + 2 + payload.length,
      detail: `bloqueCierre=${closingBlockHex}`,
    });

    // fullBuffer = arrastre + payload. En la inicial el legajo del 1er registro
    // viene inline en el payload; en continuaciones lo aporta `carryIn`.
    const fullBuffer = Buffer.concat([carryIn, payload]);

    // Encuadre por invariante estructural (research.md §D4, FR-006): en vez de
    // trocear por posición fija, se reconocen los registros por su forma. Debe
    // dar exactamente `pageCount` registros; si no, el payload no encuadra y se
    // reporta como error explícito en vez de exportar basura (FR-010).
    const framed = frameRecords(fullBuffer);
    if (framed.length !== pageCount) {
      throw new RespuestaInesperadaError(
        `La página ${pageIndex + 1} del detalle 0xA4 no encuadra: se esperaban ${pageCount} ` +
        `fichadas y el invariante estructural detectó ${framed.length} (research.md §D4, FR-010).`
      );
    }
    for (const rec of framed) {
      collected.push(rec);
    }

    if (hasMorePages) {
      // Arrastre hacia la próxima página (research.md §D3, FR-004/005):
      // - Desde la página inicial: 4 bytes (el legajo del 1er registro NUEVO de
      //   la próxima), tomados justo después de los registros ya encuadrados.
      //   La próxima página NO reenvía ningún registro.
      // - Desde una continuación: 8 bytes = la cabeza del ÚLTIMO registro de
      //   esta página; el equipo reenvía ese registro entero al inicio de la
      //   próxima (duplicado que luego colapsa la deduplicación, FR-005/007).
      carryIn = isFirstPage
        ? Buffer.from(fullBuffer.subarray(pageCount * RECORD_SIZE, pageCount * RECORD_SIZE + 4))
        : Buffer.from(fullBuffer.subarray((pageCount - 1) * RECORD_SIZE, (pageCount - 1) * RECORD_SIZE + 8));
    }

    remaining -= pageCount;
    pageIndex += 1;
  }

  if (reader.length > 0) {
    throw new RespuestaInesperadaError(
      `Sobraron ${reader.length} bytes sin consumir tras leer el detalle 0xA4 declarado por 0xB4 ` +
      `(${declaredPendingCount}). Payload inesperado (FR-010).`
    );
  }

  // Deduplicación por (legajo, fecha, hora, método): colapsa los registros que
  // el equipo reenvía en cada frontera de continuación (research.md §D5,
  // FR-007). `overlapCount` = declarados por 0xB4 menos únicos; es una
  // condición ESPERADA por el solapamiento entre páginas (FR-009), no un error.
  const { records: rawRecords, removed: overlapCount } = dedupeFichadas(collected);
  if (overlapCount > 0) {
    logger.log('pagination_overlap', {
      detail:
        `declarados=${declaredPendingCount} unicos=${rawRecords.length} overlap=${overlapCount} ` +
        `(registros reenviados en fronteras de pagina colapsados por dedup, FR-009)`,
    });
  }

  return { declaredPendingCount, rawRecords, nextSeq: detailSeq + 1 };
}

// Orquesta una sesion de consulta completa segun la secuencia real
// confirmada en 3 capturas independientes (research/fichada1.pcapng stream
// 176, research/fichada2.pcapng stream 11, research/fichada3.pcapng stream
// 19, ver research.md §6.4): handshake -> 0x13 parametros -> 0x13
// identificacion -> 0x13 parametros (de nuevo) -> conteo de pendientes ->
// detalle -> cierre de operacion. Los payloads de parametros/identificacion
// no se interpretan (no aportan nada a la consulta de fichadas); solo se
// leen y descartan para mantener el framing del socket sincronizado.
// research.md §6.6: 13/13 corridas reales (conteo 0xB4 solo, secuencia
// parcial, y detalle 0xA4 completo) confirmaron que el reloj no requiere
// los tres 0x13 (parametros, identificacion, parametros) para ninguna
// operacion de esta feature. Por eso quedan como opcionales
// (fullHandshake=false por defecto) en vez de eliminarse: si se conecta
// un reloj nuevo, otro firmware, o el comportamiento observado cambia,
// alcanza con pasar fullHandshake:true (o --full-handshake en el CLI)
// para volver a la secuencia completa sin tocar codigo.
export async function runQuerySession({ host, port, timeoutMs, sessionId, logger, fullHandshake = false }) {
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
    logger.log('command_sent', {
      commandCode: '0x80',
      byteLength: handshakeCmd.length,
      detail: fullHandshake ? 'full-handshake (0x13 x3)' : 'reduced-handshake (sin 0x13)',
    });
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logger.log('response_received', { commandCode: '0x80', byteLength: ACK_SIZE });
    seq += 1;

    if (fullHandshake) {
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
    }

    const { declaredPendingCount, rawRecords, nextSeq } = await queryPendingFichadas(socket, reader, logger, {
      timeoutMs,
      seq,
    });
    seq = nextSeq;

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
