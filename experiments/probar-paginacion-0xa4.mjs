// Experimento manual (2026-07-08): validar en vivo la hipotesis de
// paginacion de 0xA4 documentada en research.md §5.18, derivada de
// research/fichada_id_99.pcapng (captura del software oficial con 53
// pendientes). Antes de tocar el cliente de produccion, se prueba contra
// el equipo real si el dispositivo acepta un comando 0xA4 de continuacion
// donde el campo "count" (bytes 8-11) sigue siendo el declaredPendingCount
// total (en vez de replicar el valor misterioso "00 00 01 00" que mando el
// software oficial, cuyo significado no esta confirmado).
//
// Estrategia de lectura (no de comando): en vez de confiar en el campo
// byteLen que manda el software oficial (cuyo comportamiento parece
// inconsistente entre la 1ra y 2da llamada, ver research.md §5.18), el
// script decide cuantos bytes LEER de la respuesta basandose en lo que
// declaro 0xB4, igual que ya hace src/protocol/client.js para el caso sin
// paginar.
//
// Uso: node experiments/probar-paginacion-0xa4.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
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
  console.error('Uso: node experiments/probar-paginacion-0xa4.mjs --host <IP_DEL_RELOJ>');
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

  const handshakeCmd = buildHandshakeCommand(seq);
  socket.write(handshakeCmd);
  await reader.readExact(ACK_SIZE, { timeoutMs });
  console.log('[OK] handshake');
  seq += 1;

  const countCmd = buildPendingCountCommand(seq);
  socket.write(countCmd);
  const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
  const countHeader = parseAckHeader(ackCount);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
  console.log(`[OK] 0xB4 declaredPendingCount=${declaredPendingCount}`);
  seq += 1;

  const allRecords = [];
  let remaining = declaredPendingCount;
  let carriedHeader = null;
  let pageNum = 0;

  while (remaining > 0) {
    pageNum += 1;
    const pageCount = Math.min(remaining, PAGE_SIZE);
    const hasMorePages = remaining > pageCount;
    // Hipotesis research.md §5.18: en la 1ra llamada el campo "count"
    // (bytes 8-11) es declaredPendingCount total; en continuaciones, la
    // captura real del software oficial mostro "00 00 01 00" en esa
    // posicion en vez del conteo — probando la hipotesis de que sea un
    // indice de pagina en el word alto (pageIndex << 16), no un conteo.
    const isFirstCall = pageNum === 1;
    const countField = isFirstCall ? declaredPendingCount : (pageNum - 1) << 16;
    const byteLenField = isFirstCall ? pageCount * RECORD_SIZE : pageCount * RECORD_SIZE - 4;

    const detailCmd = buildPendingDetailCommand(seq, countField, byteLenField);
    console.log(`-> 0xA4 pagina ${pageNum}: pageCount=${pageCount} hasMorePages=${hasMorePages} comando=${hex(detailCmd)}`);
    socket.write(detailCmd);
    seq += 1;

    const ackDetail = await reader.readExact(ACK_SIZE, { timeoutMs });
    parseAckHeader(ackDetail);

    const marker = await reader.readExact(2, { timeoutMs });
    if (marker[0] !== MARKER_COMMAND[0] || marker[1] !== MARKER_COMMAND[1]) {
      throw new Error('Sin marcador 55 AA esperado antes del payload de 0xA4');
    }

    let header;
    if (carriedHeader) {
      header = carriedHeader;
    } else {
      header = await reader.readExact(4, { timeoutMs });
    }

    const recordsBytes = pageCount * RECORD_SIZE;
    const recordsBuffer = await reader.readExact(recordsBytes, { timeoutMs });
    console.log(`   <- pagina ${pageNum} recibida: header=${hex(header)} recordsBuffer=${recordsBuffer.length} bytes`);

    const fullBuffer = Buffer.concat([header, recordsBuffer]);
    for (let i = 0; i < pageCount; i += 1) {
      const offset = i * RECORD_SIZE;
      const raw = fullBuffer.subarray(offset, offset + RECORD_SIZE);
      console.log(`     pagina${pageNum}[${i}] raw=${hex(raw)}`);
      allRecords.push(raw);
    }
    console.log(`     pagina${pageNum} bytes sobrantes al final=${hex(fullBuffer.subarray(pageCount * RECORD_SIZE))}`);

    if (hasMorePages) {
      carriedHeader = fullBuffer.subarray(pageCount * RECORD_SIZE, pageCount * RECORD_SIZE + 4);
    }

    remaining -= pageCount;
  }

  console.log('');
  console.log(`RESULTADO: ${allRecords.length} registros obtenidos (esperados ${declaredPendingCount})`);
  const legajos = allRecords.map((r) => parseFichadaRecord(r).legajo);
  console.log('Legajos:', legajos.join(', '));
  console.log('Legajos unicos:', new Set(legajos).size, '/', legajos.length);

  const closeCmd = (await import('../src/protocol/commands.js')).buildCloseOperationCommand(seq);
  socket.write(closeCmd);
  await reader.readExact(ACK_SIZE, { timeoutMs });
  console.log('[OK] cierre');

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
