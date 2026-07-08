// Experimento manual (2026-07-08): el usuario cambio el parametro "ID
// DISPOSITIVO" del equipo de 1 a 99 (Menu > Configuracion, ver
// research/protocolo_prosoft_rs596.md). Desde ese cambio, el handshake real
// falla con "ACK invalido" (parseAckHeader, src/protocol/framing.js).
//
// Este script NO usa parseAckHeader para leer la respuesta: lee todos los
// bytes que el equipo mande tras el 0x80 (con una ventana de espera fija,
// no un tamano exacto) y los vuelca en hex crudo, para ver que cambio
// realmente en el ACK cuando ID DISPOSITIVO != 1. Tambien intenta
// parseAckHeader aparte y reporta el motivo exacto del rechazo.
//
// Uso: node experiments/probar-handshake-raw.mjs --host 192.168.1.66

import { parseArgs } from 'node:util';
import { buildHandshakeCommand } from '../src/protocol/commands.js';
import { connectSocket, closeSession } from '../src/protocol/client.js';
import { parseAckHeader } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '3000' },
    'wait-ms': { type: 'string', default: '1500' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-handshake-raw.mjs --host <IP_DEL_RELOJ>');
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

  const handshakeCmd = buildHandshakeCommand(1);
  console.log(`-> enviando 0x80 handshake: ${hex(handshakeCmd)}`);
  socket.write(handshakeCmd);

  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const total = Buffer.concat(chunks);
  console.log('');
  console.log(`Total recibido en ${waitMs}ms: ${total.length} bytes`);
  console.log(`Hex completo: ${hex(total)}`);

  if (total.length === 0) {
    console.log('RESULTADO: el equipo no respondio nada dentro de la ventana de espera.');
  } else {
    try {
      const parsed = parseAckHeader(total.subarray(0, Math.min(total.length, 10)));
      console.log('parseAckHeader (primeros 10 bytes) OK:', {
        flagBytes: hex(parsed.flagBytes),
        seq: parsed.seq,
      });
    } catch (err) {
      console.log(`parseAckHeader (primeros 10 bytes) FALLO: ${err.message}`);
    }
  }

  closeSession(socket, { log: () => {} });
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
