export const RECORD_SIZE = 20;

const CONFIRMED_RECORD_TYPE = '00000001';

// Hipotesis de research.md §5.6: "0x40" (rostro) y "0x30" (tarjeta) se
// confirmaron comparando fichadas reales contra el software oficial; "0x10"
// (huella) es una hipotesis fuerte por la misma formula (EnrollDataType:
// {fp,pwd,idcard,face} numerado x 0x10) pero sin confirmacion independiente
// propia. Solo se listan valores vistos en capturas reales; no se inventan
// valores para codigos nunca observados (Constitucion, Principio III).
const VERIFICATION_METHOD_HYPOTHESES = {
  '00000010': 'huella',
  '00000030': 'tarjeta',
  '00000040': 'rostro',
};

function hexField(buffer, start, end) {
  return buffer.subarray(start, end).toString('hex').toUpperCase();
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
    unresolvedFields: {
      field0: hexField(buffer, 0, 4),
      field1: hexField(buffer, 4, 8),
      field4: hexField(buffer, 16, 20),
    },
  };
}
