// Experimento manual (2026-07-03): extension de probar-solo-handshake.mjs
// que ademas pide el detalle real (0xA4), no solo el conteo (0xB4), para
// terminar de validar si la secuencia completa de tres 0x13 es evitable
// de punta a punta (research.md §6.6, T035 de tasks.md).
//
// Reutiliza queryPendingFichadas() y parseFichadaRecord() tal cual las usa
// el cliente real (src/protocol/client.js, src/protocol/records.js), asi
// que el encuadre/decodificado es exactamente el mismo que en produccion
// — solo se salta la apertura de sesion (0x13 x3) para probar si hace
// falta.
//
// Uso: node experiments/probar-solo-handshake-con-a4.mjs --host <IP_DEL_RELOJ>

import { parseArgs } from 'node:util';
import { buildHandshakeCommand, buildCloseOperationCommand } from '../src/protocol/commands.js';
import { connectSocket, BufferedSocketReader, closeSession, queryPendingFichadas } from '../src/protocol/client.js';
import { parseFichadaRecord } from '../src/protocol/records.js';
import { ACK_SIZE } from '../src/protocol/framing.js';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    port: { type: 'string', default: '5005' },
    'timeout-ms': { type: 'string', default: '8000' },
  },
});

if (!values.host) {
  console.error('Uso: node experiments/probar-solo-handshake-con-a4.mjs --host <IP_DEL_RELOJ>');
  process.exit(1);
}

const host = values.host;
const port = Number(values.port);
const timeoutMs = Number(values['timeout-ms']);

function logPaso(nombre, ok, detalle) {
  console.log(`[${ok ? 'OK  ' : 'FAIL'}] ${nombre}${detalle ? ' — ' + detalle : ''}`);
}

const nullLogger = { log: () => {} };

async function main() {
  console.log(`Conectando a ${host}:${port}...`);
  const socket = await connectSocket(host, port, timeoutMs);
  const reader = new BufferedSocketReader(socket);
  let seq = 1;
  let huboError = false;
  let declaredPendingCount = null;
  let rawRecords = [];

  try {
    const handshakeCmd = buildHandshakeCommand(seq);
    socket.write(handshakeCmd);
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logPaso('0x80 handshake', true);
    seq += 1;

    console.log('--- SIN ningun 0x13: probando 0xB4 + 0xA4 real (mismo codigo que produccion) ---');

    const result = await queryPendingFichadas(socket, reader, nullLogger, { timeoutMs, seq });
    declaredPendingCount = result.declaredPendingCount;
    rawRecords = result.rawRecords;
    seq += declaredPendingCount > 0 ? 2 : 1;

    logPaso('0xB4 conteo de pendientes', true, `declaredPendingCount=${declaredPendingCount}`);
    if (declaredPendingCount > 0) {
      logPaso('0xA4 detalle', true, `recibidos ${rawRecords.length} registros (esperados ${declaredPendingCount})`);
    }
  } catch (err) {
    huboError = true;
    logPaso('secuencia sin 0x13 con 0xA4', false, err.message);
  }

  try {
    const closeCmd = buildCloseOperationCommand(seq);
    socket.write(closeCmd);
    await reader.readExact(ACK_SIZE, { timeoutMs });
    logPaso('0x81 cierre', true);
  } catch (err) {
    logPaso('0x81 cierre', false, err.message);
  } finally {
    closeSession(socket, nullLogger);
  }

  if (!huboError && rawRecords.length > 0) {
    console.log('');
    console.log('Registros decodificados (mismo parser que produccion):');
    rawRecords.forEach((raw, i) => {
      const record = parseFichadaRecord(raw);
      console.log(
        `  #${i + 1}: legajo=${record.legajoHipotesis.value} metodo=${record.verificationMethodLabel.value} ` +
        `hora=${record.timestampHypothesis.value ?? 'null'} recordTypeConstant=${record.recordTypeConstant}`
      );
    });
  }

  console.log('');
  console.log(
    huboError
      ? 'RESULTADO: fallo pidiendo 0xA4 real sin ningun 0x13 -> los 0x13 podrian ser necesarios para la descarga de detalle, aunque no para el conteo.'
      : `RESULTADO: 0xA4 real funciono sin ningun 0x13 (declarados=${declaredPendingCount}, recibidos=${rawRecords.length}) -> la secuencia de 0x13 tambien parece evitable para el detalle completo.`
  );
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
