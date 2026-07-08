// Diagnostico dirigido (2026-07-08): confirmar contra el equipo real, sin
// asumir nada de mi propio modelo de encuadre, que bytes exactos llegan
// para la 2da pagina (continuacion) de un 0xA4 paginado. El usuario
// reporto legajo incorrecto (37305) para la fichada #52 (primer registro
// de la pagina 2); el software oficial confirma que el legajo real es 1.
//
// Uso: node experiments/diagnosticar-pagina2-raw.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildPendingDetailContinuationCommand,
} from '../src/protocol/commands.js';
import { connectSocket, closeSession } from '../src/protocol/client.js';
import { parseAckHeader } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '5000' },
    'wait-ms': { type: 'string', default: '2000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/diagnosticar-pagina2-raw.mjs --host <IP_DEL_RELOJ>');
  process.exit(1);
}

const host = values.host;
const port = Number(values.port);
const timeoutMs = Number(values['timeout-ms']);
const waitMs = Number(values['wait-ms']);

function hex(buffer) {
  return buffer.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
}

async function main() {
  console.log(`Conectando a ${host}:${port}...`);
  const socket = await connectSocket(host, port, timeoutMs);

  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));

  socket.write(buildHandshakeCommand(1));
  await new Promise((r) => setTimeout(r, 300));
  chunks.length = 0;

  socket.write(buildPendingCountCommand(2));
  await new Promise((r) => setTimeout(r, 300));
  const ackCountBuf = Buffer.concat(chunks.splice(0, chunks.length));
  const countHeader = parseAckHeader(ackCountBuf);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
  console.log(`0xB4 declaredPendingCount=${declaredPendingCount}`);

  const pageCount1 = 51;
  const detailCmd1 = buildPendingDetailCommand(3, declaredPendingCount, pageCount1 * 20);
  socket.write(detailCmd1);
  await new Promise((r) => setTimeout(r, waitMs));
  const page1Full = Buffer.concat(chunks.splice(0, chunks.length));
  console.log(`pagina1: ${page1Full.length} bytes totales recibidos`);
  const page1RecordsBuffer = page1Full.subarray(16); // ACK(10)+marker(2)+header(4)
  console.log(`pagina1 recordsBuffer: ${page1RecordsBuffer.length} bytes`);
  console.log(`pagina1 ultimos 20 bytes (ultimo registro completo, 20B): ${hex(page1RecordsBuffer.subarray(-20))}`);

  const remaining = declaredPendingCount - pageCount1;
  console.log(`remaining tras pagina1: ${remaining}`);

  // Pagina 2, EXACTAMENTE como produccion: byteLen = remaining*20-4
  const byteLen2 = remaining * 20 - 4;
  const detailCmd2 = buildPendingDetailContinuationCommand(4, 1, byteLen2);
  console.log(`-> 0xA4 pagina2 comando (byteLen pedido=${byteLen2}): ${hex(detailCmd2)}`);
  socket.write(detailCmd2);
  await new Promise((r) => setTimeout(r, waitMs));
  const page2Full = Buffer.concat(chunks.splice(0, chunks.length));
  console.log('');
  console.log(`pagina2: ${page2Full.length} bytes totales recibidos (ACK10+marker2+resto)`);
  const page2Payload = page2Full.subarray(12); // ACK(10)+marker(2), SIN asumir header
  console.log(`pagina2 payload (sin ACK/marker): ${page2Payload.length} bytes`);
  console.log(`pagina2 payload completo: ${hex(page2Payload)}`);

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
