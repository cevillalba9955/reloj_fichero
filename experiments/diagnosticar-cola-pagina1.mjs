// Diagnostico dirigido (2026-07-08): el usuario reporto que la fichada
// #52 (indice 51, primer registro de la pagina 2) sale con legajo 37305
// en el JSON de produccion, pero el software oficial confirma que el
// legajo real es 1. Este script pide EXACTAMENTE lo mismo que
// src/protocol/client.js (byteLen=51*20=1020 para la pagina 1), pero en
// vez de leer con readExact(1020) (que corta ahi y sigue), lee una
// ventana mucho mas grande sin asumir el tamaño, para ver si el equipo
// esta mandando MAS bytes de los 1020 pedidos — lo que dejaria bytes sin
// consumir en el reader, desalineando todo lo que viene despues (incluido
// el calculo de carriedHeader).
//
// Uso: node experiments/diagnosticar-cola-pagina1.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import { buildHandshakeCommand, buildPendingCountCommand, buildPendingDetailCommand } from '../src/protocol/commands.js';
import { connectSocket, closeSession } from '../src/protocol/client.js';
import { parseAckHeader, ACK_SIZE } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '5000' },
    'wait-ms': { type: 'string', default: '2000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/diagnosticar-cola-pagina1.mjs --host <IP_DEL_RELOJ>');
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
  let totalReceived = 0;
  socket.on('data', (chunk) => {
    chunks.push(chunk);
    totalReceived += chunk.length;
  });

  const handshakeCmd = buildHandshakeCommand(1);
  socket.write(handshakeCmd);
  await new Promise((r) => setTimeout(r, 300));
  console.log(`0x80 respuesta: ${totalReceived} bytes`);
  chunks.length = 0;
  totalReceived = 0;

  const countCmd = buildPendingCountCommand(2);
  socket.write(countCmd);
  await new Promise((r) => setTimeout(r, 300));
  const ackCountBuf = Buffer.concat(chunks.splice(0, chunks.length));
  totalReceived = 0;
  const countHeader = parseAckHeader(ackCountBuf);
  const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
  console.log(`0xB4 declaredPendingCount=${declaredPendingCount}`);

  const pageCount = 51;
  const byteLen = pageCount * 20; // EXACTAMENTE lo que pide produccion hoy
  const detailCmd = buildPendingDetailCommand(3, declaredPendingCount, byteLen);
  console.log(`-> 0xA4 comando (byteLen pedido=${byteLen}): ${hex(detailCmd)}`);
  socket.write(detailCmd);
  await new Promise((r) => setTimeout(r, waitMs));

  const full = Buffer.concat(chunks.splice(0, chunks.length));
  console.log('');
  console.log(`Total bytes RECIBIDOS en ${waitMs}ms: ${full.length}`);
  console.log(`(ACK=10 + marker=2 + header=4 + recordsBuffer=? -> recordsBuffer real = total - 16)`);
  const recordsBufferRealLength = full.length - 16;
  console.log(`recordsBuffer REAL recibido: ${recordsBufferRealLength} bytes (yo pedi byteLen=${byteLen})`);

  if (recordsBufferRealLength !== byteLen) {
    console.log(`*** DISCREPANCIA: el equipo mando ${recordsBufferRealLength - byteLen} bytes MAS/MENOS de los pedidos ***`);
  }

  const header = full.subarray(16 - 4, 16); // los 4 bytes de header van justo antes del recordsBuffer
  console.log(`header (primer legajo): ${hex(header)}`);

  const recordsBuffer = full.subarray(16);
  console.log(`recordsBuffer completo (${recordsBuffer.length} bytes):`);
  console.log(hex(recordsBuffer));
  console.log('');
  console.log(`Ultimos 8 bytes de recordsBuffer (2 posibles "colas"): ${hex(recordsBuffer.subarray(-8))}`);
  console.log(`  -> ultimos 4 (mi formula actual, sin +4): ${hex(recordsBuffer.subarray(-4))}`);
  if (recordsBuffer.length >= 8) {
    console.log(`  -> anteultimos 4 (si el equipo mando 4 de mas): ${hex(recordsBuffer.subarray(-8, -4))}`);
  }

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
