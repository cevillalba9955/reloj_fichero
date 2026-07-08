// Prueba dirigida (2026-07-08) para el bug reportado: fichada #52 sale con
// legajo 37305 en produccion, pero el software oficial confirma legajo=1.
//
// Hipotesis: el equipo NO trunca un stream fijo — al pedir byteLen=1020
// (formula actual sin +4) los ultimos 4 bytes recibidos NO son el legajo
// valido del siguiente registro; hace falta pedir +4 EXTRA (byteLen=1024,
// como hace el software oficial) para que esos ultimos 4 bytes si sean el
// legajo real del proximo registro. El primer intento de implementar esto
// (ya abandonado) pedia +4 pero tenia un bug de indexado al extraer esos 4
// bytes del fullBuffer (usaba el offset equivocado). Este script prueba la
// version corregida.
//
// Uso: node experiments/probar-fix-carriedheader.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildPendingDetailContinuationCommand,
} from '../src/protocol/commands.js';
import { connectSocket, BufferedSocketReader, closeSession } from '../src/protocol/client.js';
import { parseAckHeader, ACK_SIZE, MARKER_COMMAND } from '../src/protocol/framing.js';
import { parseFichadaRecord, RECORD_SIZE } from '../src/protocol/records.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '5000' },
    'page-size': { type: 'string', default: '51' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-fix-carriedheader.mjs --host <IP_DEL_RELOJ>');
  process.exit(1);
}

const host = values.host;
const port = Number(values.port);
const timeoutMs = Number(values['timeout-ms']);
const PAGE_SIZE = Number(values['page-size']);

function hex(buffer) {
  return buffer.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
}

async function main() {
  console.log(`Conectando a ${host}:${port}...`);
  const socket = await connectSocket(host, port, timeoutMs);
  const reader = new BufferedSocketReader(socket);
  let seq = 1;

  socket.write(buildHandshakeCommand(seq));
  await reader.readExact(ACK_SIZE, { timeoutMs });
  seq += 1;

  socket.write(buildPendingCountCommand(seq));
  const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
  const countHeader = parseAckHeader(ackCount);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
  console.log(`declaredPendingCount=${declaredPendingCount}`);
  seq += 1;

  const allRecords = [];
  let remaining = declaredPendingCount;
  let carriedHeader = null;
  let pageIndex = 0;

  while (remaining > 0) {
    seq += 1;
    const isFirstPage = pageIndex === 0;
    const pageCount = Math.min(remaining, PAGE_SIZE);
    const hasMorePages = remaining > pageCount;
    // FIX: pedir SIEMPRE +4 cuando hay mas paginas, para que el equipo
    // incluya el "peek" del proximo legajo dentro de lo que manda.
    const trailerBytes = hasMorePages ? 4 : 0;
    const byteLen = pageCount * RECORD_SIZE + trailerBytes;

    const detailCmd = isFirstPage
      ? buildPendingDetailCommand(seq, declaredPendingCount, byteLen)
      : buildPendingDetailContinuationCommand(seq, pageIndex, byteLen);
    socket.write(detailCmd);

    const ackDetail = await reader.readExact(ACK_SIZE, { timeoutMs });
    parseAckHeader(ackDetail);
    const marker = await reader.readExact(2, { timeoutMs });
    if (marker[0] !== MARKER_COMMAND[0] || marker[1] !== MARKER_COMMAND[1]) {
      throw new Error('sin marcador 55 AA');
    }

    const header = isFirstPage ? await reader.readExact(4, { timeoutMs }) : carriedHeader;
    const recordsBuffer = await reader.readExact(byteLen, { timeoutMs });

    const fullBuffer = Buffer.concat([header, recordsBuffer]);
    console.log(`pagina ${pageIndex + 1}: pageCount=${pageCount} byteLen pedido=${byteLen} fullBuffer.length=${fullBuffer.length}`);

    for (let i = 0; i < pageCount; i += 1) {
      const offset = i * RECORD_SIZE;
      allRecords.push(fullBuffer.subarray(offset, offset + RECORD_SIZE));
    }

    if (hasMorePages) {
      // Variante B: usar el offset pageCount*RECORD_SIZE (no el final real
      // del buffer) — esto es lo que se probo originalmente antes de
      // "corregirlo", a ver si en realidad esta era la version correcta.
      carriedHeader = fullBuffer.subarray(pageCount * RECORD_SIZE, pageCount * RECORD_SIZE + 4);
      console.log(`   carriedHeader (offset pageCount*RECORD_SIZE) = ${hex(carriedHeader)}`);
    }

    remaining -= pageCount;
    pageIndex += 1;
  }

  console.log('');
  console.log(`Total: ${allRecords.length} registros (esperados ${declaredPendingCount})`);
  const decoded = allRecords.map(parseFichadaRecord);
  decoded.forEach((r, i) => {
    if (i >= 48) console.log(`  #${i + 1}: legajo=${r.legajo} fecha=${r.fecha} hora=${r.hora} metodo=${r.metodo}`);
  });

  const legajos = decoded.map((r) => r.legajo);
  console.log('legajos unicos:', new Set(legajos).size, '/', legajos.length);
  console.log('algun legajo implausible (>10000, excepto 9999 de prueba)?', legajos.some((l) => l > 10000 && l !== 9999));

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
