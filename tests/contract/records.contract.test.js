import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hexToBuffer } from '../helpers/hex.js';
import { parseFichadaRecord, RECORD_SIZE } from '../../src/protocol/records.js';

function loadFixture(name) {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

// Correccion de encuadre (research.md §5.9, 2026-07-03): los fixtures
// guardan los "registros" tal como salen del payload de 0xA4 en el orden
// viejo (campo0,1,2,3,4). parseFichadaRecord ahora espera el orden real
// (legajo,campo0,1,2,3): [4 bytes de legajo] + [primeros 16 bytes del
// registro viejo, descartando su campo4]. Este helper arma ese buffer,
// igual que src/protocol/client.js con el header/registro anterior real.
function buildTrueRecord(legajoHex, oldRegistroHex) {
  const legajoBuf = hexToBuffer(legajoHex);
  const oldBuf = hexToBuffer(oldRegistroHex);
  assert.equal(legajoBuf.length, 4, 'legajoHex debe ser 4 bytes');
  assert.equal(oldBuf.length, 20, 'oldRegistroHex debe ser 20 bytes (registro viejo completo)');
  return Buffer.concat([legajoBuf, oldBuf.subarray(0, 16)]);
}

test('records: RECORD_SIZE es 20 bytes segun research.md', () => {
  assert.equal(RECORD_SIZE, 20);
});

test('records: parseFichadaRecord decodifica el registro real de "un registro pendiente" (encuadre corregido con el header real)', () => {
  const fixture = loadFixture('un-registro-pendiente.json');
  const raw = buildTrueRecord(fixture.respuestaA4Header, fixture.registros[0]);

  const record = parseFichadaRecord(raw);

  assert.equal(record.rawHex, raw.toString('hex').toUpperCase());
  assert.equal(record.recordTypeConstant, '00000001');
  assert.equal(record.verificationMethodCode, '00000010');
  assert.equal(record.metodo, 'huella');
  // research.md §5.9: header "01 00 00 00" = legajo 1 = Cesar Villalba (confirmado).
  assert.equal(record.legajo, 1);
  // research.md §5.16: fecha ahora se decodifica (dia/mes/año); esta
  // captura es del 2026-07-02 (research.md §6.1), que es justo lo que da.
  assert.equal(record.fecha, '2026-07-02');
});

test('records: parseFichadaRecord decodifica los dos registros reales de "dos registros pendientes" con distinto metodo de verificacion (encuadre corregido)', () => {
  const fixture = loadFixture('dos-registros-pendientes.json');
  const [oldRaw1, oldRaw2] = fixture.registros;

  // research.md §5.9: legajo(registro N) viene del campo4 del registro N-1
  // (o del header para N=1); el campo4 del ultimo registro queda colgando.
  const record1 = parseFichadaRecord(buildTrueRecord(fixture.respuestaA4Header, oldRaw1));
  const record2 = parseFichadaRecord(buildTrueRecord(hexToBuffer(oldRaw1).subarray(16, 20).toString('hex'), oldRaw2));

  assert.equal(record1.recordTypeConstant, '00000001');
  assert.equal(record2.recordTypeConstant, '00000001');
  assert.equal(record1.verificationMethodCode, '00000010');
  assert.equal(record2.verificationMethodCode, '00000040');
  assert.notEqual(record1.verificationMethodCode, record2.verificationMethodCode);
  assert.equal(record1.metodo, 'huella');
  assert.equal(record2.metodo, 'rostro');
  // research.md §5.9: mismo empleado en ambos registros de esta captura (el
  // header y el campo4 del registro 1 son ambos "01 00 00 00" = legajo 1).
  assert.equal(record1.legajo, 1);
  assert.equal(record2.legajo, 1);
});

test('records: parseFichadaRecord decodifica el registro real por tarjeta (verificationMethodCode 0x30, confirmado 2026-07-02) con legajo numerico', () => {
  const fixture = loadFixture('tres-registros-pendientes-tarjeta.json');
  // Encadenamos: el legajo del 3er registro viene del campo4 del 2do
  // (no se capturo el header de esta sesion por separado, research.md §5.9).
  const legajoHex = hexToBuffer(fixture.registros[1]).subarray(16, 20).toString('hex');
  const record = parseFichadaRecord(buildTrueRecord(legajoHex, fixture.registros[2]));

  assert.equal(record.verificationMethodCode, '00000030');
  assert.equal(record.metodo, 'tarjeta');
  // research.md §5.9/§5.11: el legajo se decodifica igual para tarjeta que
  // para huella/rostro (confirmado con las fichadas por tarjeta de
  // control_fichada.csv, ver el test de "legajo encadenado" mas abajo).
  // Esta fixture puntual no tiene legajo real conocido (no se capturo un
  // CSV de control para esa sesion), asi que solo verificamos que decodifica
  // a un numero, no a null.
  assert.equal(typeof record.legajo, 'number');
});

test('records: parseFichadaRecord decodifica hora (segundo/minuto/hora) contra research/control_fichada.csv', () => {
  const fixture = loadFixture('siete-registros-control-fichada.json');
  // El timestamp/metodo/tipo de la fila i viven en el propio registro viejo
  // i (bytes 0-15, ahora en offset 4-19 del buffer re-encuadrado); no
  // dependen del legajo, asi que un legajo de relleno no afecta esta
  // asercion (research.md §5.9). Ver el test de legajo mas abajo para el
  // encadenamiento real fila a fila.
  const RELLENO = '00000000';
  for (const { hex, csv, expectedTimestampHypothesis } of fixture.registros) {
    const record = parseFichadaRecord(buildTrueRecord(RELLENO, hex));
    assert.equal(
      record.hora,
      expectedTimestampHypothesis,
      `hora real ${csv.hora} (${csv.modo}, legajo ${csv.legajo}) deberia decodificar a ${expectedTimestampHypothesis}`
    );
  }
});

test('records: legajo encadenado coincide con los legajos reales de control_fichada.csv (research.md §5.9)', () => {
  const fixture = loadFixture('siete-registros-control-fichada.json');
  const registros = fixture.registros;
  // Fila 1 no se puede verificar sin el header real de esa sesion puntual
  // (no quedo documentado aparte, research.md §5.9) — se arranca desde la
  // fila 2, usando el campo4 de la fila anterior como legajo.
  for (let i = 1; i < registros.length; i += 1) {
    const legajoHex = hexToBuffer(registros[i - 1].hex).subarray(16, 20).toString('hex');
    const record = parseFichadaRecord(buildTrueRecord(legajoHex, registros[i].hex));
    assert.equal(
      record.legajo,
      registros[i].csv.legajo,
      `fila ${i + 1}: legajo real ${registros[i].csv.legajo} (${registros[i].csv.hora})`
    );
  }
});

test('records: parseFichadaRecord decodifica la hora leyendo el bloque real de bits0-1 de minuteByte, sin desempate (research.md §5.16)', () => {
  const fixture = loadFixture('muestras-hora-ampm-2026-07-03.json');
  // Las filas sinteticas de este fixture probaban el viejo "criterio de
  // desempate" (ya retractado, research.md §5.16 lo reemplaza: el bloque de
  // hora se lee directo de minuteByte, no se adivina). Solo las filas
  // reales (esSintetico:false) siguen siendo una asercion valida.
  for (const { hex, legajoReal, horaReal, expectedTimestampHypothesis, esSintetico, nota } of fixture.registros) {
    if (esSintetico) continue;
    const record = parseFichadaRecord(hexToBuffer(hex));
    assert.equal(record.legajo, legajoReal, `legajo real ${legajoReal} (${nota})`);
    assert.equal(
      record.hora,
      expectedTimestampHypothesis,
      `hora real ${horaReal}: ${nota}`
    );
  }
});

test('records: parseFichadaRecord devuelve hora null cuando los bits de flag no calzan con el formato esperado', () => {
  const raw = buildTrueRecord('00000000', '01 00 00 16 F9 71 FF FF 00 00 00 01 00 00 00 10 99 02 00 00');
  const record = parseFichadaRecord(raw);
  assert.equal(record.hora, null);
});

test('records: parseFichadaRecord rechaza un buffer que no mide exactamente 20 bytes (FR-010)', () => {
  assert.throws(() => parseFichadaRecord(hexToBuffer('01 02 03')), /20 bytes/);
});

test('records: parseFichadaRecord marca una anomalia cuando recordTypeConstant no es el valor confirmado', () => {
  const raw = buildTrueRecord('00000000', '01 00 00 16 F9 71 02 05 00 00 00 02 00 00 00 10 99 02 00 00');
  const record = parseFichadaRecord(raw);
  assert.equal(record.recordTypeConstant, '00000002');
  assert.equal(record.anomaly, true);
});

test('records: parseFichadaRecord devuelve metodo null cuando el codigo no se reconoce (fecha/hora se decodifican igual, son independientes de metodo)', () => {
  const raw = buildTrueRecord('00000000', '01 00 00 16 F9 71 02 05 00 00 00 01 00 00 00 99 99 02 00 00');
  const record = parseFichadaRecord(raw);
  assert.equal(record.metodo, null);
  assert.equal(record.fecha, '2026-07-02');
  assert.equal(record.hora, '08:01:22');
});

test('records: parseFichadaRecord decodifica legajo de mas de 1 byte, little-endian (research.md §5.15, legajo de prueba real 9999)', () => {
  const fixture = loadFixture('legajo-multibyte-9999.json');
  for (const { hex, legajoReal, nota } of fixture.registros) {
    const record = parseFichadaRecord(hexToBuffer(hex));
    assert.equal(record.legajo, legajoReal, nota);
  }
});

test('records: parseFichadaRecord reporta legajo null si los bytes 2-3 del campo no son 00 00 (research.md §5.20: solo hay evidencia de 2 bytes de legajo)', () => {
  // Registro sintetico (no capturado): el registro real del fixture de 9999
  // con el byte 2 del campo legajo alterado. En todas las capturas reales
  // esos bytes son siempre "00 00"; si algun dia llegan con otro valor no
  // se puede saber si son parte del numero de legajo u otra informacion
  // (research.md §5.20), asi que el legajo se reporta como no confiable.
  const fixture = loadFixture('legajo-multibyte-9999.json');
  const raw = hexToBuffer(fixture.registros[0].hex);
  raw[2] = 0x01;
  const record = parseFichadaRecord(raw);
  assert.equal(record.legajo, null);
  // El resto del registro sigue decodificando igual (campos independientes).
  assert.equal(record.anomaly, false);
  assert.notEqual(record.fecha, null);
});

test('records: parseFichadaRecord decodifica fecha y hora completas (año/mes/día/hora/minuto/segundo), sin ambigüedad (research.md §5.16)', () => {
  const fixture = loadFixture('fecha-hora-completa-2026-07-06.json');
  for (const { hex, fechaReal, horaReal, nota } of fixture.registros) {
    const record = parseFichadaRecord(hexToBuffer(hex));
    assert.equal(record.fecha, fechaReal, `fecha real ${fechaReal}: ${nota}`);
    assert.equal(record.hora, horaReal, `hora real ${horaReal}: ${nota}`);
  }
});
