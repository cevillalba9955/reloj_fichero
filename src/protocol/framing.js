export const MARKER_COMMAND = Buffer.from([0x55, 0xAA]);
export const MARKER_RESPONSE = Buffer.from([0xAA, 0x55]);

// Verificado byte a byte contra research/protocolo_prosoft_rs596.md #6.1/#6.3:
// AA 55 01 01 [4 bytes flag] [2 bytes seq LE] = 10 bytes, sin byte final "00"
// (la plantilla en prosa del documento original sugeria 11 bytes; la
// correccion queda registrada en research.md, seccion "Framing del
// protocolo", nota de correccion 2026-07-02).
export const ACK_SIZE = 10;

export const KEEPALIVE_SIZE = 6;

// Tamanos de respuesta confirmados por tshark sobre research/*.pcapng (no
// documentados como "N bytes" en prosa en research.md secciones 3-4, ahora
// verificados byte a byte): ACK(10) + marcador 55 AA(2) + payload.
export const PARAMS_RESPONSE_SIZE = 64;
export const IDENTIFICATION_RESPONSE_SIZE = 1040;

export function encodeSequence(seq) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(seq & 0xffff, 0);
  return buffer;
}

export function decodeSequence(buffer, offset = 0) {
  return buffer.readUInt16LE(offset);
}

export function parseAckHeader(buffer) {
  if (buffer.length !== ACK_SIZE) {
    throw new RangeError(
      `ACK invalido: se esperaban ${ACK_SIZE} bytes exactos, se recibieron ${buffer.length}`
    );
  }
  if (buffer[0] !== MARKER_RESPONSE[0] || buffer[1] !== MARKER_RESPONSE[1]) {
    throw new Error('ACK invalido: no empieza con el marcador AA 55');
  }
  // research.md #5.17 (2026-07-08): el byte 2 no es una constante "01" — es
  // el ID DISPOSITIVO configurado en el equipo (Menu > Configuracion), que
  // el reloj hace eco en cada ACK. Con ID=1 (valor por defecto en todas las
  // capturas previas) era indistinguible de una constante; confirmado al
  // cambiar el parametro a 99 (0x63) y ver ese mismo valor en el byte 2 de
  // la respuesta real. El byte 3 si sigue siendo una constante fija (01) en
  // todas las capturas, con cualquier ID DISPOSITIVO.
  if (buffer[3] !== 0x01) {
    throw new Error('ACK invalido: byte constante 01 (posicion 3) ausente');
  }
  return {
    deviceId: buffer[2],
    flagBytes: buffer.subarray(4, 8),
    seq: decodeSequence(buffer, 8),
  };
}

export function hasPayloadMarker(buffer, offset) {
  return (
    buffer.length >= offset + 2 &&
    buffer[offset] === MARKER_COMMAND[0] &&
    buffer[offset + 1] === MARKER_COMMAND[1]
  );
}

export function isKeepalive(buffer) {
  return buffer.length === KEEPALIVE_SIZE && buffer.every((byte) => byte === 0);
}
