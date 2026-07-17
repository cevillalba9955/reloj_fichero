export const RECORD_SIZE = 20;

const CONFIRMED_RECORD_TYPE = '00000001';

// Confirmados comparando fichadas reales contra el equipo/software oficial
// (research.md §5.6, §5.21): "0x40" rostro y "0x30" tarjeta confirmados por
// comparacion directa contra el software oficial; "0x20" clave confirmado
// contra el equipo real (§5.21, 2026-07-17). "0x10" huella es una formula
// fuerte (coincide con el orden de EnrollDataType del bloque de
// identificacion) pero sin una fichada real por huella comparada de forma
// independiente todavia.
const VERIFICATION_METHOD_LABELS = {
  '00000010': 'huella',
  '00000020': 'clave',
  '00000030': 'tarjeta',
  '00000040': 'rostro',
};

// research.md §5.9/§5.11: el legajo (bloque de 4 bytes re-encuadrado) se
// confirmo contra tres sesiones reales independientes, incluyendo dos
// fichadas verificadas por tarjeta dentro de la calibracion de 7
// registros (control_fichada.csv, filas 3 y 6): decodifican igual que
// huella/rostro, sin diferencia por metodo. (Una hipotesis anterior decia
// que tarjeta no tenia legajo confiable, basada en un valor que en
// realidad pertenecia a un registro colgante distinto, no a la fichada
// por tarjeta misma — retractada, ver research.md §5.11).
// research.md §5.15 (corregido 2026-07-16, ver §5.20): el legajo es un
// entero little-endian de (al menos) 2 bytes — una fichada de prueba real
// con legajo 9999 (0x270F) trajo legajoRaw "0F 27 00 00"; leer solo el
// primer byte daba 15. Una version anterior leia los 4 bytes completos
// como legajo, pero NO hay evidencia de que los bytes 2-3 sean parte del
// numero: en todas las capturas reales (incluidos los lotes paginados de
// 53 y 173) esos bytes son siempre "00 00", asi que 2 y 4 bytes son
// indistinguibles con los datos disponibles, y podrian codificar otra
// cosa aun no identificada. Se lee lo confirmado (2 bytes) y los bytes
// 2-3 se tratan como chequeo de plausibilidad: si algun dia llegan
// distintos de cero, no se puede saber si son parte del legajo u otra
// informacion, y el legajo se reporta como no confiable (null); el valor
// crudo completo queda siempre en rawHex.

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

// research.md §5.7: segundo (byte 7, binario directo) confirmado byte a
// byte contra research/control_fichada.csv (7/7 coincidencias exactas).
//
// research.md §5.16 (2026-07-06): modelo completo de fecha/hora, calibrado
// probando el reloj a proposito con la fecha cambiada (dia, mes y año):
//
//   byte8  (year):  bits 2-7 = (año - 1964); bits 0-1 = flag fijo "01"
//   byte9  (month): bits 4-7 = mes (1-12);   bits 0-3 = flag fijo "0001"
//   byte10 (day/h): bits 5-7 = hourMod8;     bits 0-4 = dia del mes (1-31, binario directo)
//   byte11 (min/b): bits 2-7 = minuto (0-59); bits 0-1 = bloque de hora (0=0-7hs, 1=8-15hs, 2=16-23hs)
//   hora = hourMod8 + 8*bloque
//
// Lo que una version anterior de este archivo interpretaba como "bit0 de
// byte10 = flag AM/PM (hora<=12)" era en realidad el bit menos
// significativo del dia del mes (dia impar/par) — solo parecia un flag de
// hora porque toda la calibracion original vino de fichadas de un unico
// dia real (2 de julio), asi que ese bit nunca varió por otro motivo que
// no fuera la hora en ese dataset puntual. Y lo que se creia "criterio de
// desempate, siempre bloque 8-15hs" era en realidad no leer el bloque de
// hora real, ya presente en los bits 0-1 de byte11 — el "empate" nunca
// existio, solo faltaba mirar el byte correcto. Confirmado con 8 fichadas
// de prueba reales (dias 1, 10, 15, 30, 31; años 2015, 2020, 2026; horas
// 0, 10, 11, 12, 23 — research/calibracion_fecha_hora_bytes_7_a_11.csv)
// mas, retroactivamente, contra los 7 registros de control_fichada.csv y
// las 5 fichadas de research/muestras-hora-ampm-2026-07-03.json: 100% de
// coincidencia en dia/mes/año/hora/minuto/segundo, incluido el caso
// hora=0 que antes fallaba (el criterio de desempate viejo elegia "8" en
// vez de "0").
function decodeFechaHora(buffer) {
  const second = buffer[7];
  const yearByte = buffer[8];
  const monthByte = buffer[9];
  const dayHourByte = buffer[10];
  const minuteBlockByte = buffer[11];

  const year = (yearByte >> 2) + 1964;
  const month = monthByte >> 4;
  const day = dayHourByte & 0b00011111;
  const hourMod8 = dayHourByte >> 5;
  const block = minuteBlockByte & 0b11;
  const hour = hourMod8 + 8 * block;
  const minute = minuteBlockByte >> 2;

  // Los flags fijos (bits bajos de year/month) se mantienen como chequeo
  // de plausibilidad barato: en todas las fichadas reales vistas hasta
  // ahora nunca variaron; si no calzan, el registro probablemente no
  // tiene este formato (o esta corrupto).
  const looksValid =
    (yearByte & 0b11) === 0b01 &&
    (monthByte & 0b1111) === 0b0001 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= 31 &&
    minute <= 59 &&
    second <= 59;

  if (!looksValid) {
    return { fecha: null, hora: null };
  }

  return {
    fecha: `${year}-${pad2(month)}-${pad2(day)}`,
    hora: `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
  };
}

// Parsea un registro de fichada de 20 bytes segun
// research/protocolo_prosoft_rs596.md §5.2/§5.9/§5.16. Devuelve un
// FichadaRecord (data-model.md §1) con los campos legibles (fecha, hora,
// legajo, metodo) como valores directos: un valor presente significa que
// hay evidencia real detras (research.md §5.6/§5.9/§5.11/§5.15/§5.16);
// `null` significa que todavia no se pudo resolver, o que se sabe que no
// es confiable para ese caso puntual (spec FR-005/FR-015) — nunca se
// combina un valor sin evidencia con uno confirmado.
// Invariante estructural de una fichada (feature 006, research.md §D4): un
// tramo de 20 bytes es una fichada valida sii su constante de tipo (bytes
// 12-15) es 00000001 Y su fecha/hora pasa la validacion de plausibilidad. Se
// usa para encuadrar por forma en vez de por posicion fija, de modo que el
// encuadre se re-sincroniza ante los reenvios/solapes de la paginacion 0xA4.
export function looksLikeRecordStart(buffer, offset) {
  if (offset + RECORD_SIZE > buffer.length) {
    return false;
  }
  if (hexField(buffer, offset + 12, offset + 16) !== CONFIRMED_RECORD_TYPE) {
    return false;
  }
  return decodeFechaHora(buffer.subarray(offset, offset + RECORD_SIZE)).fecha !== null;
}

// Encuadra un buffer continuo en fichadas de 20 bytes reconociendo el
// invariante estructural (looksLikeRecordStart), no por posicion fija: avanza
// de a un registro cuando el molde calza y se re-sincroniza byte a byte cuando
// no (saltando bloques de cierre, bytes de arrastre y cualquier relleno de
// frontera de pagina). Devuelve una lista de sub-buffers de 20 bytes.
export function frameRecords(buffer) {
  const records = [];
  let offset = 0;
  while (offset + RECORD_SIZE <= buffer.length) {
    if (looksLikeRecordStart(buffer, offset)) {
      records.push(buffer.subarray(offset, offset + RECORD_SIZE));
      offset += RECORD_SIZE;
    } else {
      offset += 1;
    }
  }
  return records;
}

export function parseFichadaRecord(buffer) {
  if (buffer.length !== RECORD_SIZE) {
    throw new RangeError(
      `Registro de fichada invalido: se esperaban ${RECORD_SIZE} bytes exactos, se recibieron ${buffer.length}`
    );
  }

  const recordTypeConstant = hexField(buffer, 12, 16);
  const verificationMethodCode = hexField(buffer, 16, 20);
  const metodo = VERIFICATION_METHOD_LABELS[verificationMethodCode] ?? null;
  // research.md §5.9/§5.11: legajo se decodifica igual para los tres
  // metodos (huella, rostro, tarjeta) — confirmado contra dos fichadas
  // reales por tarjeta en control_fichada.csv.
  // research.md §5.15/§5.20: entero little-endian de 2 bytes (lo unico
  // confirmado); los bytes 2-3 del campo, siempre "00 00" en todas las
  // capturas reales, tienen significado desconocido — si llegan con otro
  // valor, el legajo deja de ser confiable y se reporta null (ver
  // comentario arriba).
  const legajoFieldUpperBytesZero = buffer[2] === 0x00 && buffer[3] === 0x00;
  const legajo = legajoFieldUpperBytesZero ? buffer.readUInt16LE(0) : null;
  const { fecha, hora } = decodeFechaHora(buffer);

  return {
    rawHex: buffer.toString('hex').toUpperCase(),
    recordTypeConstant,
    anomaly: recordTypeConstant !== CONFIRMED_RECORD_TYPE,
    verificationMethodCode,
    metodo,
    fecha,
    hora,
    legajo,
  };
}
