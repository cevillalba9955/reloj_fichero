// Experimento manual (2026-07-03): determinar si el reloj RS956 acepta la
// sesion con SOLO el handshake 0x80, sin ningun 0x13, antes de pedir el
// conteo de pendientes (0xB4). Complementa
// experiments/probar-dos-0x13.mjs (que prueba con 2 de los 3 llamados
// 0x13 reales).
//
// No modifica nada del cliente real: arma la secuencia a mano y reporta
// que responde el reloj en cada paso. No ejecuta 0xA8 (borrado).
//
// Uso: node experiments/probar-solo-handshake.mjs --host <IP_DEL_RELOJ>

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildCloseOperationCommand,
} from '../src/protocol/commands.js';
import { connectSocket, BufferedSocketReader, closeSession } from '../src/protocol/client.js';
import { ACK_SIZE, parseAckHeader } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '3000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-solo-handshake.mjs --host <IP_DEL_RELOJ>');
  process.exit(1);
}

const host = values.host;
const port = Number(values.port);
const timeoutMs = Number(values['timeout-ms']);

function logPaso(nombre, ok, detalle) {
  console.log(`[${ok ? 'OK  ' : 'FAIL'}] ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

async function main() {
  console.log(`Conectando a ${host}:${port}...`);
  const socket = await connectSocket(host, port, timeoutMs);
  const reader = new BufferedSocketReader(socket);
  let seq = 1;
  let huboError = false;

  try {
    const handshakeCmd = buildHandshakeCommand(seq);
    socket.write(handshakeCmd);
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logPaso('0x80 handshake', true);
    seq += 1;

    console.log('--- SIN ningun 0x13: probando 0xB4 directo ---');

    const countCmd = buildPendingCountCommand(seq);
    socket.write(countCmd);
    const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
    const countHeader = parseAckHeader(ackCount);
    const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
    logPaso('0xB4 conteo de pendientes', true, `declaredPendingCount=${declaredPendingCount}`);
    seq += 1;
  } catch (err) {
    huboError = true;
    logPaso('secuencia sin 0x13', false, err.message);
  }

  try {
    const closeCmd = buildCloseOperationCommand(seq);
    socket.write(closeCmd);
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logPaso('0x81 cierre', true);
  } catch (err) {
    logPaso('0x81 cierre', false, err.message);
  } finally {
    closeSession(socket, { log: () => {} });
  }

  console.log('');
  console.log(
    huboError
      ? 'RESULTADO: el reloj RECHAZO o fallo sin ningun 0x13 -> los llamados 0x13 parecen obligatorios.'
      : 'RESULTADO: el reloj ACEPTO la sesion y respondio 0xB4 sin ningun 0x13 -> los 0x13 podrian no ser necesarios para esta operacion.'
  );
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
