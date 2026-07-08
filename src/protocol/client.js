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

  const rawRecords = [];
  let remaining = declaredPendingCount;
  let carriedHeader = null;
  let pageIndex = 0;
  let detailSeq = seq;

  while (remaining > 0) {
    detailSeq += 1;
    const isFirstPage = pageIndex === 0;
    const pageCount = Math.min(remaining, MAX_RECORDS_PER_PAGE);
    const hasMorePages = remaining > pageCount;

    // CORRECCION (2026-07-08, ver research.md §5.18 "bug real"): el equipo
    // NO trunca un stream fijo segun el byteLen pedido — el contenido de
    // los ultimos bytes CAMBIA segun cuanto se pida, no es un simple
    // prefijo mas corto. Se necesitan `bytesNecesarios` bytes reales de
    // recordsBuffer (pageCount registros, +4 extra si hay mas paginas para
    // capturar el header real de la proxima — confirmado en vivo: sin ese
    // "+4" el "proximo header" calculado da legajo 37305/37306 en vez del
    // legajo real 1, verificado contra el software oficial).
    //
    // El campo `byteLen` que va DENTRO del comando (bytes 12-13) no es
    // igual a `bytesNecesarios` en los dos casos:
    // - 1ra pagina: el equipo entrega EXACTO lo pedido, sin sobrante.
    // - paginas de continuacion: el equipo entrega SIEMPRE 4 bytes MAS de
    //   lo pedido (confirmado en vivo con dos pedidos distintos, 36->40 y
    //   40->44 recibidos) — hay que pedir 4 MENOS de `bytesNecesarios` para
    //   que lo recibido coincida exactamente y no queden bytes sin leer
    //   (FR-014). No hay captura real con una pagina de continuacion que a
    //   su vez tenga otra pagina despues; esta formula esta confirmada solo
    //   para el caso "ultima pagina de una continuacion".
    const bytesNecesarios = pageCount * RECORD_SIZE + (hasMorePages ? 4 : 0);
    const byteLenComando = isFirstPage ? bytesNecesarios : bytesNecesarios - 4;

    const detailCmd = isFirstPage
      ? buildPendingDetailCommand(detailSeq, declaredPendingCount, byteLenComando)
      : buildPendingDetailContinuationCommand(detailSeq, pageIndex, byteLenComando);
    socket.write(detailCmd);
    logger.log('command_sent', {
      commandCode: '0xA4',
      byteLength: detailCmd.length,
      detail: `pagina=${pageIndex + 1} pageCount=${pageCount}`,
    });

    const ackDetail = await reader.readExact(ACK_SIZE, { timeoutMs });
    parseAckHeader(ackDetail);

    const marker = await reader.readExact(2, { timeoutMs });
    if (marker[0] !== MARKER_COMMAND[0] || marker[1] !== MARKER_COMMAND[1]) {
      throw new RespuestaInesperadaError(
        'Respuesta a 0xA4 sin el marcador 55 AA esperado antes del payload (FR-010)'
      );
    }

    // Correccion de encuadre (research.md §5.9, 2026-07-03): este bloque de 4
    // bytes NO carece de significado - es el campo[4] (legajo) del primer
    // registro de la pagina. En la 1ra pagina se lee del socket; en
    // continuaciones ya se tiene (es la cola de la pagina anterior, §5.18).
    const header = isFirstPage ? await reader.readExact(4, { timeoutMs }) : carriedHeader;

    // No existe un campo de longitud en el protocolo: la unica forma de saber
    // cuantos bytes leer es asumir que coinciden con lo declarado por 0xB4
    // (acotado a esta pagina, mas el "+4" de arriba cuando corresponde). Se
    // lee `bytesNecesarios`, no `byteLenComando` — el equipo entrega ese
    // extra "+4" por su cuenta en continuaciones (ver comentario arriba).
    const recordsBuffer = await reader.readExact(bytesNecesarios, { timeoutMs });

    // research.md §5.14/§5.18: siempre sobran 4 bytes AL FINAL DEL BUFFER
    // COMPLETO (fullBuffer, no de recordsBuffer solo), sin importar
    // declaredPendingCount, cuyo significado sigue sin resolver (§5.14) —
    // se descartan sin usarlos. Cuando hay mas paginas, el header real de
    // la proxima esta 4 bytes ANTES de ese bloque final (ver carriedHeader
    // mas abajo), no en el mismo lugar.
    const closingBlockHex = recordsBuffer
      .subarray(recordsBuffer.length - 4)
      .toString('hex')
      .toUpperCase();
    logger.log('response_received', {
      commandCode: '0xA4',
      byteLength: ACK_SIZE + 2 + (isFirstPage ? 4 : 0) + recordsBuffer.length,
      detail: `bloqueCierre=${closingBlockHex}`,
    });

    // research.md §5.9: el stream real de campos es [header/legajo1][fichada1
    // sin su legajo][legajo2][fichada2 sin su legajo]... Concatenando header +
    // recordsBuffer y volviendo a trocear en bloques de RECORD_SIZE se obtiene
    // exactamente pageCount fichadas bien encuadradas de esta pagina.
    const fullBuffer = Buffer.concat([header, recordsBuffer]);
    for (let i = 0; i < pageCount; i += 1) {
      const offset = i * RECORD_SIZE;
      rawRecords.push(fullBuffer.subarray(offset, offset + RECORD_SIZE));
    }

    if (hasMorePages) {
      // El header de la proxima pagina son los 4 bytes que siguen
      // inmediatamente a los pageCount registros ya extraidos — NO los 4
      // bytes finales de fullBuffer (esos son el bloque misterioso de
      // arriba, un bloque DISTINTO, confirmado en vivo el 2026-07-08).
      carriedHeader = fullBuffer.subarray(pageCount * RECORD_SIZE, pageCount * RECORD_SIZE + 4);
    }

    remaining -= pageCount;
    pageIndex += 1;
  }

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
