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

// Correccion de encuadre (research.md §5.9, 2026-07-03): el orden real de
// campos dentro de cada fichada de 20 bytes es
// [legajo(0-3)] [campo0/segundo(4-7)] [campo1/hora-minuto(8-11)]
// [campo2/tipo(12-15)] [campo3/metodo(16-19)] — no
// [campo0][campo1][campo2][campo3][campo4] como se asumia antes. El caller
// (src/protocol/client.js) ya entrega el buffer con este encuadre corregido
// (antepone el header de 4 bytes que antes se descartaba).

// research.md §5.7: segundo (byte 7, binario directo) y minuto (byte 11 =
// minuto*4+1) confirmados byte a byte contra research/control_fichada.csv
// (7/7 y 8/8 coincidencias exactas).
//
// research.md §5.10: el byte de hora (byte 10) trae, en sus bits 1-4, un
// flag fijo "0001", y en el bit 0 un flag tipo AM/PM: 1 = hora real <= 12,
// 0 = hora real > 12. Confirmado 7/7 contra los horarios reales conocidos
// (13, 14, 16, 6, 7, 11, 12) — el limite correcto es "<=12", no "<12"
// (corregido 2026-07-03 con una fichada real de hora 12: hourMod8=4,
// bit0=1, que con el limite viejo se resolvia mal como hora 4). Los bits
// 5-7 siguen dando solo "hourMod8" (se repite cada 8 horas). Combinando
// ambos: de los 3 candidatos {hourMod8, hourMod8+8, hourMod8+16}, el flag
// AM/PM separa los que son <=12 de los que son >12; si exactamente uno de
// los 3 cae del lado que indica el flag, la hora queda resuelta sin
// ambiguedad; si quedan 2 candidatos del mismo lado (pasa para hourMod8
// 0-3 con flag<=12, y para hourMod8 4-7 con flag>12 — notablemente
// hourMod8=4 con flag<=12 es ambiguo entre 4 y 12, el caso que motivo esta
// correccion), sigue sin poder resolverse solo con estos bytes. Con 7
// horas confirmadas (de 24 posibles) esto sigue siendo hipotesis sin
// validar del todo (falta el resto de las horas, y hora=0 en particular,
// que podria no seguir el mismo patron que 1-12); se expone igual, a
// pedido del usuario, siempre con unconfirmed: true.
function decodeTimestampHypothesis(buffer) {
  const second = buffer[7];
  const hourByte = buffer[10];
  const minuteByte = buffer[11];

  const looksValid =
    second <= 59 &&
    (hourByte & 0b00011110) === 0b00010 &&
    (minuteByte & 0b00000011) === 0b01 &&
    (minuteByte >> 2) <= 59;

  if (!looksValid) {
    return { value: null, unconfirmed: true };
  }

  const hourMod8 = hourByte >> 5;
  const isAtMostTwelve = (hourByte & 1) === 1;
  const minute = minuteByte >> 2;

  const candidates = [hourMod8, hourMod8 + 8, hourMod8 + 16];
  const matching = candidates.filter((h) => (h <= 12) === isAtMostTwelve);
  const hour = matching.length === 1 ? matching[0] : null;

  if (hour === null) {
    return { value: null, unconfirmed: true };
  }

  return {
    value: `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
    unconfirmed: true,
  };
}

// Parsea un registro de fichada de 20 bytes segun
// research/protocolo_prosoft_rs596.md §5.2/§5.9. Devuelve un FichadaRecord
// (data-model.md §1): separa explicitamente los campos confirmados por el
// protocolo de los que siguen sin resolver, sin mezclarlos (spec FR-005).
export function parseFichadaRecord(buffer) {
  if (buffer.length !== RECORD_SIZE) {
    throw new RangeError(
      `Registro de fichada invalido: se esperaban ${RECORD_SIZE} bytes exactos, se recibieron ${buffer.length}`
    );
  }

  const recordTypeConstant = hexField(buffer, 12, 16);
  const verificationMethodCode = hexField(buffer, 16, 20);

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
    // Hipotesis (research.md §5.7/§5.10): minuto y segundo confirmados; la
    // hora combina "hourMod8" con un flag AM/PM (ver el comentario de
    // decodeTimestampHypothesis) — a veces alcanza para resolverla sin
    // ambiguedad, a veces no (en ese caso value es null).
    timestampHypothesis: decodeTimestampHypothesis(buffer),
    // Hipotesis (research.md §5.9): primer byte confirmado como legajo del
    // empleado (27/27 coincidencias verificadas contra dos sesiones reales
    // independientes, una vez corregido el encuadre). Se sigue exponiendo
    // con unconfirmed: true: no hay confirmacion sobre el resto de los 3
    // bytes ni sobre el caso de verificacion por tarjeta.
    legajoHipotesis: {
      value: buffer[0],
      unconfirmed: true,
    },
    unresolvedFields: {
      legajoRaw: hexField(buffer, 0, 4),
      field0: hexField(buffer, 4, 8),
      field1: hexField(buffer, 8, 12),
    },
  };
}
