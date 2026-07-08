import { encodeSequence } from './framing.js';
import { RECORD_SIZE } from './records.js';

export class ProtocoloNoImplementadoError extends Error {
  constructor(comando) {
    super(
      `Comando ${comando} no tiene captura hex real en research/protocolo_prosoft_rs596.md ` +
      `(ver research.md §2-bis de la feature 001-consulta-fichadas-rs596). ` +
      `No se fabrican bytes de protocolo sin respaldo de trafico capturado (Constitucion, Principio III). ` +
      `Hace falta capturar una sesion real con Wireshark que incluya este comando y actualizar el research doc.`
    );
    this.name = 'ProtocoloNoImplementadoError';
    this.comando = comando;
  }
}

// Plantillas reales capturadas en research/protocolo_prosoft_rs596.md #6,
// transcritas con espacios para poder auditarlas a simple vista contra el
// documento original. Los ultimos 2 bytes son el contador de secuencia (LE)
// y se sobreescriben en cada llamada; el resto se envia tal cual fue
// capturado, sin reinterpretar los bytes "variables" que el research doc no
// logro decodificar por completo.
function template(hexWithSpaces) {
  return Buffer.from(hexWithSpaces.replace(/\s+/g, ''), 'hex');
}

// 55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 [seq LE] -> 16 bytes totales
const PENDING_COUNT_BASE = template('55 AA 01 B4 08 00 00 00 00 00 FF FF 00 00 00 00');
// 55 AA 01 A4 00 00 00 00 [count LE32] [count*20 LE16] [seq LE] -> 16 bytes totales.
// research.md #6.1 documentaba esto con 15 bytes (le faltaba un "00" en el
// campo de cantidad); corregido a 16 bytes tras comparar 3 capturas reales
// independientes con 1 y 2 registros pendientes (research/fichada2.pcapng
// stream 11, research/fichada3.pcapng stream 19) via tshark.
const PENDING_DETAIL_BASE = template('55 AA 01 A4 00 00 00 00 00 00 00 00 00 00 00 00');
// 55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 [seq LE] -> 16 bytes totales.
// Confirmado byte a byte en 2 de 3 capturas reales (research/fichada1.pcapng
// stream 176, research/fichada2.pcapng stream 13); en la 3ra los bytes 8-9
// traian un valor distinto ("4C D3") que el equipo acepto igual, por lo que
// no parecen validarse.
const HANDSHAKE_BASE = template('55 AA 01 80 00 00 00 00 00 00 FF FF 00 00 00 00');
// 55 AA 01 13 00 00 00 00 00 00 00 00 30 00 [seq LE] -> 16 bytes totales.
// Variante "parametros" del 0x13 (respuesta de 64 bytes). Se envia 2 veces
// por sesion real (1ra y 3ra vez, con un 0x13 de "identificacion" en medio).
const PARAMS_BASE = template('55 AA 01 13 00 00 00 00 00 00 00 00 30 00 00 00');
// 55 AA 01 13 01 00 00 00 00 00 00 00 00 04 [seq LE] -> 16 bytes totales.
// Variante "identificacion" del 0x13 (respuesta de 1040 bytes, ver research.md
// seccion 4). Se envia 1 sola vez, entre las dos llamadas a PARAMS_BASE.
const IDENTIFICATION_BASE = template('55 AA 01 13 01 00 00 00 00 00 00 00 00 04 00 00');
// 55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 [seq LE] -> 16 bytes totales.
// Variante "cierre de operacion" del 0x81 (byte4=01), usada al final de la
// sesion de descarga de fichadas en las 3 capturas reales revisadas. Existe
// otra variante con byte4=00 ("apertura de operacion", usada antes de 0xA8)
// que no hace falta para esta feature.
const CLOSE_OPERATION_BASE = template('55 AA 01 81 01 00 00 00 00 00 FF FF 00 00 00 00');

function withSequence(base, seq) {
  const buffer = Buffer.from(base);
  encodeSequence(seq).copy(buffer, buffer.length - 2);
  return buffer;
}

export function buildPendingCountCommand(seq) {
  return withSequence(PENDING_COUNT_BASE, seq);
}

// research.md §5.18 (2026-07-08, calibrado contra un equipo real con 53
// pendientes, research/fichada_id_99.pcapng): el equipo se niega a
// responder un solo 0xA4 pidiendo mas de este tope de registros (recordsBuffer
// resultante quedaba sin ACK, timeout, socket cerrado). El software oficial
// pagina en llamadas de a lo sumo este valor. 51 esta confirmado como
// seguro (probado end-to-end); no se probo el limite exacto (podria
// aceptar hasta 52, o el tope real podria ser un limite de bytes distinto
// a 51*20 — ver research.md §5.18 para el detalle de la incertidumbre).
export const MAX_RECORDS_PER_PAGE = 51;

export function buildPendingDetailCommand(seq, count, byteLength = count * RECORD_SIZE) {
  const buffer = Buffer.from(PENDING_DETAIL_BASE);
  buffer.writeUInt32LE(count, 8);
  buffer.writeUInt16LE(byteLength, 12);
  encodeSequence(seq).copy(buffer, buffer.length - 2);
  return buffer;
}

// Continuacion de un 0xA4 paginado (research.md §5.18): a diferencia de la
// primera llamada (donde el campo "count" de bytes 8-11 es el
// declaredPendingCount total), reenviar el mismo count ahi hace que el
// equipo reinicie la entrega desde el primer registro pendiente (probado
// en vivo: se repetian los primeros registros). El software oficial usa en
// cambio, en esa misma posicion, un valor que coincide con
// "indice de pagina de continuacion (1-based) desplazado 16 bits"
// (`pageIndex << 16`; confirmado un unico punto de calibracion,
// pageIndex=1 -> 0x00010000). No se sabe si esta formula generaliza a mas
// de dos paginas — no hay una captura real con >102 pendientes para
// confirmarlo.
export function buildPendingDetailContinuationCommand(seq, pageIndex, byteLength) {
  return buildPendingDetailCommand(seq, pageIndex << 16, byteLength);
}

export function buildHandshakeCommand(seq) {
  return withSequence(HANDSHAKE_BASE, seq);
}

export function buildParamsCommand(seq) {
  return withSequence(PARAMS_BASE, seq);
}

export function buildIdentificationCommand(seq) {
  return withSequence(IDENTIFICATION_BASE, seq);
}

export function buildCloseOperationCommand(seq) {
  return withSequence(CLOSE_OPERATION_BASE, seq);
}

// 0xA8 (borrar) esta deliberadamente fuera de alcance de esta feature
// (spec FR-007) y no se expone ningun builder para el, aunque su tamano
// real (16 bytes) esta documentado en research.md a modo de referencia.
