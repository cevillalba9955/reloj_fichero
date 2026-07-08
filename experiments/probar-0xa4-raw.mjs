// Experimento manual (2026-07-08): tras corregir parseAckHeader para el
// nuevo ID DISPOSITIVO=99 (ver experiments/probar-handshake-raw.mjs), el
// handshake y el 0xB4 funcionan, pero 0xA4 da timeout esperando el ACK.
// Este script dumpea crudo lo que responde el equipo a 0xB4 y 0xA4, sin
// asumir tamanos exactos, para ver si el ID DISPOSITIVO tambien afecto el
// formato de esas respuestas.
//
// Uso: node experiments/probar-0xa4-raw.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
} from '../src/protocol/commands.js';
import { connectSocket, closeSession } from '../src/protocol/client.js';
import { parseAckHeader, ACK_SIZE } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '3000' },
    'wait-ms': { type: 'string', default: '3000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-0xa4-raw.mjs --host <IP_DEL_RELOJ>');
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
  socket.on('data', (chunk) => {
    console.log(`  <- llego chunk de ${chunk.length} bytes: ${hex(chunk)}`);
    chunks.push(chunk);
  });
  socket.on('close', (hadError) => console.log(`  [socket close, hadError=${hadError}]`));
  socket.on('error', (err) => console.log(`  [socket error] ${err.message}`));

  const handshakeCmd = buildHandshakeCommand(1);
  console.log(`-> 0x80: ${hex(handshakeCmd)}`);
  socket.write(handshakeCmd);
  await new Promise((r) => setTimeout(r, 500));

  let buf = Buffer.concat(chunks.splice(0, chunks.length));
  console.log(`0x80 respuesta (${buf.length} bytes): ${hex(buf)}`);
  const ackHandshake = parseAckHeader(buf.subarray(0, ACK_SIZE));
  console.log('parseAckHeader 0x80 OK:', ackHandshake);

  const countCmd = buildPendingCountCommand(2);
  console.log(`-> 0xB4: ${hex(countCmd)}`);
  socket.write(countCmd);
  await new Promise((r) => setTimeout(r, 500));

  buf = Buffer.concat(chunks.splice(0, chunks.length));
  console.log(`0xB4 respuesta (${buf.length} bytes): ${hex(buf)}`);
  const ackCount = parseAckHeader(buf.subarray(0, ACK_SIZE));
  const declaredPendingCount = ackCount.flagBytes.readUInt32LE(0);
  console.log('parseAckHeader 0xB4 OK:', ackCount, 'declaredPendingCount=', declaredPendingCount);

  const detailCmd = buildPendingDetailCommand(3, declaredPendingCount);
  console.log(`-> 0xA4: ${hex(detailCmd)}`);
  socket.write(detailCmd);
  await new Promise((r) => setTimeout(r, waitMs));

  buf = Buffer.concat(chunks.splice(0, chunks.length));
  console.log(`0xA4 respuesta total en ${waitMs}ms (${buf.length} bytes): ${hex(buf)}`);

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
