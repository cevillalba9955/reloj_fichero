// Experimento manual (2026-07-03): determinar si el reloj RS956 acepta la
// sesion con SOLO DOS llamados 0x13 (parametros + identificacion), sin
// repetir "parametros" una segunda vez, a diferencia de la secuencia real
// confirmada (0x80, 0x13 parametros, 0x13 identificacion, 0x13 parametros
// de nuevo) que usa src/protocol/client.js hoy.
//
// No modifica nada del cliente real: arma la secuencia a mano, paso a
// paso, y reporta que responde el reloj en cada uno. No ejecuta 0xA8
// (borrado) en ningun momento.
//
// Uso: node experiments/probar-dos-0x13.mjs --host <IP_DEL_RELOJ>

import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildParamsCommand,
  buildIdentificationCommand,
  buildPendingCountCommand,
  buildCloseOperationCommand,
} from '../src/protocol/commands.js';
import { connectSocket, BufferedSocketReader, closeSession } from '../src/protocol/client.js';
import { ACK_SIZE, PARAMS_RESPONSE_SIZE, IDENTIFICATION_RESPONSE_SIZE, parseAckHeader } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '3000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-dos-0x13.mjs --host <IP_DEL_RELOJ>');
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

    const paramsCmd = buildParamsCommand(seq);
    socket.write(paramsCmd);
    await reader.readExact(PARAMS_RESPONSE_SIZE, { timeoutMs });
    logPaso('0x13 parametros (1ra vez)', true);
    seq += 1;

    const identificationCmd = buildIdentificationCommand(seq);
    socket.write(identificationCmd);
    await reader.readExact(IDENTIFICATION_RESPONSE_SIZE, { timeoutMs });
    logPaso('0x13 identificacion', true);
    seq += 1;

    console.log('--- SIN repetir 0x13 parametros: probando 0xB4 directo ---');

    const countCmd = buildPendingCountCommand(seq);
    socket.write(countCmd);
    const ackCount = await reader.readExact(ACK_SIZE, { timeoutMs });
    const countHeader = parseAckHeader(ackCount);
    const declaredPendingCount = countHeader.flagBytes.readUInt32LE(0);
    logPaso('0xB4 conteo de pendientes', true, `declaredPendingCount=${declaredPendingCount}`);
    seq += 1;
  } catch (err) {
    huboError = true;
    logPaso('secuencia con 2 llamados 0x13', false, err.message);
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
      ? 'RESULTADO: el reloj RECHAZO o fallo con solo 2 llamados 0x13 -> los 3 llamados (parametros, identificacion, parametros) parecen obligatorios.'
      : 'RESULTADO: el reloj ACEPTO la sesion y respondio 0xB4 con solo 2 llamados 0x13 (parametros + identificacion, sin repetir parametros) -> el 2do 0x13 podria ser opcional.'
  );
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
