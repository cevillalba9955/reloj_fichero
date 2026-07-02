export const RECORD_SIZE = 20;

const CONFIRMED_RECORD_TYPE = '00000001';

// Confirmados comparando fichadas reales contra el software oficial
// (research.md §5.6): "0x40" rostro, "0x30" tarjeta, "0x10" huella. "0x20"
// (clave) nunca se observo en ninguna captura real, por lo que no se lista
// (Constitucion, Principio III: no se inventan valores sin evidencia).
const VERIFICATION_METHOD_HYPOTHESES = {
  '00000010': 'huella',
  '00000030': 'tarjeta',
  '00000040': 'rostro',
};

function hexField(buffer, start, end) {
  return buffer.subarray(start, end).toString('hex').toUpperCase();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// research.md §5.7: segundo (campo[0] byte 3, binario directo) y minuto
// (campo[1] byte 3 = minuto*4+1) confirmados byte a byte contra
// research/control_fichada.csv (7/7 y 8/8 coincidencias exactas). La hora
// (campo[1] byte 2 = (32*hora+2) mod 256) ajusta para los dos valores de
// hora probados (13 y 14) pero la formula se repite cada 8 horas — el
// resultado puede estar equivocado por un multiplo de 8 para horas nunca
// probadas. Se expone igual (dado por valido sin mas pruebas, a pedido del
// usuario), siempre con unconfirmed: true.
function decodeTimestampHypothesis(buffer) {
  const second = buffer[3];
  const hourByte = buffer[6];
  const minuteByte = buffer[7];

  const looksValid =
    second <= 59 &&
    (hourByte & 0b00011111) === 0b00010 &&
    (minuteByte & 0b00000011) === 0b01 &&
    (minuteByte >> 2) <= 59;

  if (!looksValid) {
    return { value: null, unconfirmed: true };
  }

  const hourMod8 = hourByte >> 5;
  const minute = minuteByte >> 2;

  return {
    value: `${pad2(hourMod8)}:${pad2(minute)}:${pad2(second)}`,
    unconfirmed: true,
  };
}

// Parsea un registro de fichada de 20 bytes segun
// research/protocolo_prosoft_rs596.md §5.2. Devuelve un FichadaRecord
// (data-model.md §1): separa explicitamente los campos confirmados por el
// protocolo de los que siguen sin resolver, sin mezclarlos (spec FR-005).
export function parseFichadaRecord(buffer) {
  if (buffer.length !== RECORD_SIZE) {
    throw new RangeError(
      `Registro de fichada invalido: se esperaban ${RECORD_SIZE} bytes exactos, se recibieron ${buffer.length}`
    );
  }

  const recordTypeConstant = hexField(buffer, 8, 12);
  const verificationMethodCode = hexField(buffer, 12, 16);

  return {
    rawHex: buffer.toString('hex').toUpperCase(),
    recordTypeConstant,
    anomaly: recordTypeConstant !== CONFIRMED_RECORD_TYPE,
    verificationMethodCode,
    // Hipotesis (research.md §5.6): aunque "rostro" ya se confirmo
    // comparando contra el software oficial, el campo se sigue exponiendo
    // con unconfirmed: true para todo valor (asi lo exige
    // contracts/output-schema.json) — el "value" es una ayuda de lectura,
    // no una garantia del protocolo.
    verificationMethodLabel: {
      value: VERIFICATION_METHOD_HYPOTHESES[verificationMethodCode] ?? null,
      unconfirmed: true,
    },
    // Hipotesis (research.md §5.7): "hourMod8" en el valor puede repetirse
    // cada 8 horas (ver el comentario de decodeTimestampHypothesis); minuto
    // y segundo estan confirmados. Formato "HH:MM:SS" con HH = hora mod 8.
    timestampHypothesis: decodeTimestampHypothesis(buffer),
    unresolvedFields: {
      field0: hexField(buffer, 0, 4),
      field1: hexField(buffer, 4, 8),
      field4: hexField(buffer, 16, 20),
    },
  };
}
