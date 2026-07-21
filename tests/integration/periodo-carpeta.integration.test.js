import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';
import { registrarFichadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createCalcularPresentismoService } from '../../src/presentismo/service/calcular-presentismo-service.js';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';

// 013-reestructurar-data-periodos (US1, quickstart.md Escenario 1): un período
// mensual vive en su propia carpeta `P<periodo>` autocontenida, sin mezclarse
// con la de otro período, y el layout anterior (`<repoDir>/<periodo>.json`,
// `<repoDir>/fichadas/`) deja de existir.

function config() {
  return parseCategoriasConfig({
    esquemaSemanal: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    modalidades: {
      mensual: {
        tipo: 'Mensual',
        aperturaOficial: '07:00',
        cierreOficial: '16:00',
        margenAperturaMin: 30,
        margenCierreMin: 30,
        ventanaApertura: ['05:00', '12:00'],
        ventanaCierre: ['12:00', '23:59'],
      },
    },
    categorias: { ADMIN: { modalidad: 'mensual' } },
  });
}

function fichadaCruda(rawHex, { fecha = '2026-07-01', ...extra } = {}) {
  return { legajo: 1, fecha, hora: '07:05:30', metodo: 'huella', rawHex, ...extra };
}

test('[US1] generar el calendario de un período crea P<periodo>/calendario.json (no el layout anterior)', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-carpeta-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });

    await svc.generarCalendario('202608');

    assert.ok(existsSync(join(repoDir, 'P202608', 'calendario.json')), 'existe P202608/calendario.json');
    assert.ok(!existsSync(join(repoDir, '202608.json')), 'NO existe el archivo plano del layout anterior');
    assert.ok(!existsSync(join(repoDir, 'fichadas')), 'NO existe la subcarpeta fichadas/ del layout anterior');
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US1] importar fichadas de un período las deja en P<periodo>/fichadas.json', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-carpeta-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });
    await svc.generarCalendario('202608');

    registrarFichadas({ repoDir, periodo: '202608', fichadas: [fichadaCruda('AA11', { fecha: '2026-08-01' })] });

    assert.ok(existsSync(join(repoDir, 'P202608', 'fichadas.json')), 'existe P202608/fichadas.json');
    const provider = createArchiveFichadasProvider({ repoDir });
    const fichadas = await provider.obtenerFichadasDelMes(1, '202608');
    assert.equal(fichadas.length, 1);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US1] dos períodos coexisten en paralelo sin que uno toque los archivos del otro', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-carpeta-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });

    await svc.generarCalendario('202608');
    registrarFichadas({ repoDir, periodo: '202608', fichadas: [fichadaCruda('AA11', { fecha: '2026-08-01' })] });

    await svc.generarCalendario('202607');
    registrarFichadas({ repoDir, periodo: '202607', fichadas: [fichadaCruda('BB22', { fecha: '2026-07-01' })] });

    assert.ok(existsSync(join(repoDir, 'P202607', 'calendario.json')));
    assert.ok(existsSync(join(repoDir, 'P202607', 'fichadas.json')));
    assert.ok(existsSync(join(repoDir, 'P202608', 'calendario.json')));
    assert.ok(existsSync(join(repoDir, 'P202608', 'fichadas.json')));

    // Operar sobre 202608 (reclasificar) no toca 202607.
    const antesDe607 = (await repo.cargarCalendario('202607')).dias;
    await svc.reclasificarDia('202608', '2026-08-03', 'Feriado', 'test');
    const despuesDe607 = (await repo.cargarCalendario('202607')).dias;
    assert.deepEqual(antesDe607, despuesDe607, '202607 no cambió al reclasificar un día de 202608');

    const provider607 = createArchiveFichadasProvider({ repoDir });
    const f607 = await provider607.obtenerFichadasDelMes(1, '202607');
    assert.equal(f607.length, 1, 'las fichadas de 202607 siguen siendo solo la propia (BB22), no se mezcló con 202608');

    assert.deepEqual((await repo.listarPeriodos()).sort(), ['202607', '202608']);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
