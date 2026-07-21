import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registrarFichadas,
  cargarFichadasArchivadas,
  leerExportsDeSesion,
} from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'fichadas-'));
}

const F = (rawHex, extra = {}) => ({ legajo: 9, fecha: '2026-07-01', hora: '07:05:30', metodo: 'rostro', rawHex, ...extra });

test('registrarFichadas deduplica por rawHex y acumula entre corridas', () => {
  const repoDir = tmpDir();
  const r1 = registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11'), F('BB22')] });
  assert.deepEqual([r1.agregadas, r1.duplicadas, r1.total], [2, 0, 2]);

  // Segunda corrida: una repetida (AA11) y una nueva (CC33).
  const r2 = registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11'), F('CC33')] });
  assert.deepEqual([r2.agregadas, r2.duplicadas, r2.total], [1, 1, 3]);

  const guardadas = cargarFichadasArchivadas({ repoDir, periodo: '202607' });
  assert.equal(guardadas.length, 3);
  // El rawHex SÍ se persiste (trazabilidad técnica).
  assert.ok(guardadas.every((f) => typeof f.rawHex === 'string'));
});

test('el provider por archivo NO expone rawHex al dominio (Principio V)', async () => {
  const repoDir = tmpDir();
  registrarFichadas({
    repoDir,
    periodo: '202607',
    fichadas: [F('AA11'), F('BB22', { legajo: 10 }), F('CC33', { fecha: null, hora: null })],
  });
  const provider = createArchiveFichadasProvider({ repoDir });
  const fichadas = await provider.obtenerFichadasDelMes(9, '202607');

  // legajo 9: la fichada con fecha + la sin fecha (no imputable), no la del legajo 10.
  assert.equal(fichadas.length, 2);
  assert.ok(!JSON.stringify(fichadas).includes('AA11'), 'ningún rawHex hacia el dominio');
  assert.ok(fichadas.every((f) => f.rawHex === undefined));
  const conFecha = fichadas.find((f) => f.fecha != null);
  assert.equal(conFecha.hora, 425, '07:05 → 425 minutos');
  assert.ok(fichadas.some((f) => f.fecha === null), 'la sin fecha se conserva como no imputable');
});

test('provider sin archivo del período → lista vacía (calcular procede sin fichadas)', async () => {
  const provider = createArchiveFichadasProvider({ repoDir: tmpDir() });
  assert.deepEqual(await provider.obtenerFichadasDelMes(1, '209901'), []);
});

test('leerExportsDeSesion aplana records de fichadas-*.json e ignora otros', () => {
  const inputDir = tmpDir();
  writeFileSync(join(inputDir, 'fichadas-h1-t1.json'), JSON.stringify({ records: [F('AA11'), F('BB22')] }), 'utf8');
  writeFileSync(join(inputDir, 'fichadas-h1-t2.json'), JSON.stringify({ records: [F('CC33')] }), 'utf8');
  writeFileSync(join(inputDir, 'otro.json'), JSON.stringify({ records: [F('ZZ99')] }), 'utf8'); // no matchea patrón
  writeFileSync(join(inputDir, 'fichadas-roto.json'), 'no-json', 'utf8');

  const { registros, archivos, errores } = leerExportsDeSesion({ inputDir });
  assert.equal(archivos, 3, 'tres fichadas-*.json (incluye el roto), no el otro.json');
  assert.equal(registros.length, 3, 'AA11+BB22+CC33; el roto se saltea');
  assert.deepEqual(errores, ['fichadas-roto.json']);
});

test('el archivo acumulativo persiste rawHex pero el presentismo.ndjson nunca (Principio V)', () => {
  const repoDir = tmpDir();
  registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11')] });
  const raw = readFileSync(join(repoDir, 'P202607', 'fichadas.json'), 'utf8');
  assert.match(raw, /AA11/, 'el archivo de trazabilidad SÍ guarda rawHex');
});

test('registrarFichadas no reescribe el archivo cuando el ciclo no aporta altas (spec 005)', () => {
  const repoDir = tmpDir();
  registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11')], now: () => new Date('2026-07-01T00:00:00Z') });
  const antes = readFileSync(join(repoDir, 'P202607', 'fichadas.json'), 'utf8');
  // Segunda corrida, todas duplicadas, con un `now` distinto: debe saltar la escritura.
  const r = registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11')], now: () => new Date('2026-07-02T00:00:00Z') });
  const despues = readFileSync(join(repoDir, 'P202607', 'fichadas.json'), 'utf8');
  assert.equal(r.agregadas, 0);
  assert.equal(despues, antes, 'sin altas → archivo intacto (mismo actualizadoEn, no se reescribe)');
});

test('registrarFichadas escribe de forma atómica: no deja archivos temporales (spec 005)', () => {
  const repoDir = tmpDir();
  registrarFichadas({ repoDir, periodo: '202607', fichadas: [F('AA11'), F('BB22')] });
  const carpeta = join(repoDir, 'P202607');
  assert.deepEqual(readdirSync(carpeta).filter((n) => n.endsWith('.tmp')), [], 'no quedan .tmp tras el rename');
  const datos = JSON.parse(readFileSync(join(carpeta, 'fichadas.json'), 'utf8'));
  assert.equal(datos.fichadas.length, 2, 'el archivo final es JSON válido y completo');
});
