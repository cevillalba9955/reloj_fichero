export const RECORD_SIZE = 20;

const CONFIRMED_RECORD_TYPE = '00000001';

// Confirmados comparando fichadas reales contra el software oficial
// (research.md §5.6): "0x40" rostro, "0x30" tarjeta confirmados por
// comparacion directa. "0x10" huella es una formula fuerte (coincide con
// el orden de EnrollDataType del bloque de identificacion) pero sin una
// fichada real por huella comparada de forma independiente contra el
// software oficial todavia. "0x20" (clave) nunca se observo en ninguna
// captura real, por lo que no se lista (Constitucion, Principio III: no
// se inventan valores sin evidencia).
const VERIFICATION_METHOD_LABELS = {
  '00000010': 'huella',
  '00000030': 'tarjeta',
  '00000040': 'rostro',
};

// research.md §5.9/§5.11: el legajo (primer byte del bloque re-encuadrado)
// se confirmo contra tres sesiones reales independientes, incluyendo dos
// fichadas verificadas por tarjeta dentro de la calibracion de 7
// registros (control_fichada.csv, filas 3 y 6): decodifican igual que
// huella/rostro, sin diferencia por metodo. (Una hipotesis anterior decia
// que tarjeta no tenia legajo confiable, basada en un valor que en
// realidad pertenecia a un registro colgante distinto, no a la fichada
// por tarjeta misma — retractada, ver research.md §5.11).

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
// AM/PM separa los que son <=12 de los que son >12, dejando siempre 1 o 2
// candidatos del lado que indica el flag.
//
// research.md §5.12: cuando quedan 2 candidatos (hourMod8 0-4 con
// flag<=12, o hourMod8 4-7 con flag>12), se desempata a favor del
// candidato del bloque 8-15hs (`hourMod8 + 8`) — confirmado 4/4 veces
// contra horarios reales externos (11, 12, 13, 14: en los cuatro casos el
// candidato correcto fue siempre el del bloque 8-15, nunca el de 0-7 ni
// el de 16-23). Es un criterio de desempate explicito basado en el
// horario tipico de una jornada laboral, no un hecho de protocolo
// confirmado — podria no generalizar a turnos nocturnos u otros horarios
// fuera de oficina; falta calibracion para saberlo con certeza.
//
// Con 7 horas confirmadas (de 24 posibles) esto sigue siendo hipotesis sin
// validar del todo (falta el resto de las horas, y hora=0 en particular,
// que podria no seguir el mismo patron que 1-12). Cuando el byte no tiene
// el formato esperado devuelve null — null ya comunica "no se sabe", no
// hace falta un flag aparte (2026-07-03: se saco el wrapper
// {value, unconfirmed} a pedido del usuario, ver research.md §5.11).
//
// research.md §5.13: el chequeo original exigia que los 2 bits bajos de
// minuteByte fueran exactamente "01" (confirmado asi en la calibracion
// original de 7 fichadas, research.md §5.7). Datos reales posteriores
// (lotes de 28, 4 y 5 fichadas) muestran minuteByte con bits bajos en "10"
// y "00" — y en todos esos casos el minuto decodificado (`minuteByte >> 2`)
// coincidio igual con la hora real confirmada externamente. Ese chequeo
// se saca: los bits bajos de minuteByte no son un flag de validez fijo
// (probablemente codifican otra cosa, sin resolver todavia), y exigirlos
// solo generaba falsos negativos (hora==null en fichadas perfectamente
// decodificables).
function decodeHora(buffer) {
  const second = buffer[7];
  const hourByte = buffer[10];
  const minuteByte = buffer[11];

  const looksValid =
    second <= 59 &&
    (hourByte & 0b00011110) === 0b00010 &&
    (minuteByte >> 2) <= 59;

  if (!looksValid) {
    return null;
  }

  const hourMod8 = hourByte >> 5;
  const isAtMostTwelve = (hourByte & 1) === 1;
  const minute = minuteByte >> 2;

  const candidates = [hourMod8, hourMod8 + 8, hourMod8 + 16];
  const matching = candidates.filter((h) => (h <= 12) === isAtMostTwelve);
  // matching.length es siempre 1 o 2; cuando es 2, "hourMod8 + 8" siempre
  // esta entre los 2 (ver research.md §5.12) — se usa directo en vez de
  // volver a filtrar.
  const hour = matching.length === 1 ? matching[0] : hourMod8 + 8;

  return `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

// Parsea un registro de fichada de 20 bytes segun
// research/protocolo_prosoft_rs596.md §5.2/§5.9. Devuelve un FichadaRecord
// (data-model.md §1) con los campos legibles (fecha, hora, legajo, metodo)
// como valores directos: un valor presente significa que hay evidencia
// real detras (research.md §5.6/§5.9/§5.10/§5.11); `null` significa que
// todavia no se pudo resolver, o que se sabe que no es confiable para ese
// caso puntual (spec FR-005/FR-015) — nunca se combina un valor sin
// evidencia con uno confirmado.
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
  const legajo = buffer[0];

  return {
    rawHex: buffer.toString('hex').toUpperCase(),
    recordTypeConstant,
    anomaly: recordTypeConstant !== CONFIRMED_RECORD_TYPE,
    verificationMethodCode,
    metodo,
    // research.md §5.5/§5.7: la fecha (dia/mes/año) nunca se pudo
    // decodificar; siempre null hasta que se resuelva ese campo.
    fecha: null,
    hora: decodeHora(buffer),
    legajo,
    unresolvedFields: {
      legajoRaw: hexField(buffer, 0, 4),
      field0: hexField(buffer, 4, 8),
      field1: hexField(buffer, 8, 12),
    },
  };
}
