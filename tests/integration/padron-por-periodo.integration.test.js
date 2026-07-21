import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { createCalcularPresentismoService } from '../../src/presentismo/service/calcular-presentismo-service.js';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';
import {
  createFilePadronCategoryProvider,
  guardarSnapshotPadron,
} from '../../src/presentismo/adapters/file-padron-category-provider.js';
import { rutaCarpetaPeriodo, ARCHIVO_PADRON } from '../../src/presentismo/domain/periodo-storage.js';
import { mesActualPeriodo } from '../../src/presentismo/domain/calendario-mes.js';

// 013-reestructurar-data-periodos (US2, quickstart.md Escenario 2): cada
// período tiene su propio padrón, creado al generar su calendario; toda
// sincronización posterior escribe siempre sobre el mes en curso (reloj real
// al momento de sincronizar), nunca sobre un período pasado.

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

// Simula el paso de "sincronizar-padron": escribe SIEMPRE sobre
// P<mesActualPeriodo(now())>/padron.json (mismo cálculo que cmdSincronizarPadron
// en src/cli/calcular-presentismo.js), con el reloj inyectado `now`.
function sincronizarPadron({ repoDir, now, empleados }) {
  const periodo = mesActualPeriodo(now());
  const filePath = join(rutaCarpetaPeriodo(repoDir, periodo), ARCHIVO_PADRON);
  guardarSnapshotPadron({ filePath, empleados });
  return periodo;
}

test('[US2] cada período generado tiene su propio padrón', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'padron-periodo-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });

    await svc.generarCalendario('202608'); // mes en curso simulado
    await svc.generarCalendario('202607'); // mes pasado

    // FR-003: se crea (simulando el paso del CLI/handler) el padrón propio de
    // cada período, con la nómina vigente en ese instante.
    guardarSnapshotPadron({
      filePath: join(rutaCarpetaPeriodo(repoDir, '202608'), ARCHIVO_PADRON),
      empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }],
    });
    guardarSnapshotPadron({
      filePath: join(rutaCarpetaPeriodo(repoDir, '202607'), ARCHIVO_PADRON),
      empleados: [{ legajo: 2, codigoCategoria: 'ADMIN' }],
    });

    assert.ok(existsSync(join(repoDir, 'P202608', 'padron.json')));
    assert.ok(existsSync(join(repoDir, 'P202607', 'padron.json')));
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US2] sincronizar el padrón actualiza el mes en curso; un período pasado no cambia (SC-002)', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'padron-periodo-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });
    await svc.generarCalendario('202607');
    await svc.generarCalendario('202608');
    guardarSnapshotPadron({
      filePath: join(rutaCarpetaPeriodo(repoDir, '202607'), ARCHIVO_PADRON),
      empleados: [{ legajo: 2, codigoCategoria: 'ADMIN' }],
    });
    guardarSnapshotPadron({
      filePath: join(rutaCarpetaPeriodo(repoDir, '202608'), ARCHIVO_PADRON),
      empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }],
    });

    const contenido607Antes = readFileSync(join(repoDir, 'P202607', 'padron.json'), 'utf8');

    // "Ahora" es agosto 2026 (202608): sincronizar debe escribir sobre 202608.
    const nowAgosto = () => new Date(2026, 7, 15);
    const periodoSincronizado = sincronizarPadron({
      repoDir,
      now: nowAgosto,
      empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }, { legajo: 9, codigoCategoria: 'ADMIN' }],
    });
    assert.equal(periodoSincronizado, '202608');

    const contenido607Despues = readFileSync(join(repoDir, 'P202607', 'padron.json'), 'utf8');
    assert.equal(contenido607Despues, contenido607Antes, 'el padrón de 202607 no cambió');

    const provider = createFilePadronCategoryProvider({ repoDir, now: nowAgosto });
    assert.deepEqual(await provider.listar(), [
      { legajo: 1, codigoCategoria: 'ADMIN', nombre: null },
      { legajo: 9, codigoCategoria: 'ADMIN', nombre: null },
    ]);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US2] el reloj avanza a un mes nuevo → sincronizar crea/actualiza ESE período sin tocar los anteriores', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'padron-periodo-'));
  try {
    const repo = createFilePresentismoRepository({ repoDir });
    const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });
    await svc.generarCalendario('202607');
    await svc.generarCalendario('202608');
    guardarSnapshotPadron({
      filePath: join(rutaCarpetaPeriodo(repoDir, '202607'), ARCHIVO_PADRON),
      empleados: [{ legajo: 2, codigoCategoria: 'ADMIN' }],
    });
    sincronizarPadron({ repoDir, now: () => new Date(2026, 7, 1), empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }] });

    assert.ok(!existsSync(join(repoDir, 'P202609')), 'todavía no existe septiembre');

    // El reloj real "avanza" a septiembre (202609): sincronizar de nuevo.
    const periodoSincronizado = sincronizarPadron({
      repoDir,
      now: () => new Date(2026, 8, 1),
      empleados: [{ legajo: 1, codigoCategoria: 'ADMIN' }],
    });
    assert.equal(periodoSincronizado, '202609');

    assert.ok(existsSync(join(repoDir, 'P202609', 'padron.json')), 'se creó P202609/padron.json');
    // 202607 y 202608 siguen intactos.
    assert.ok(existsSync(join(repoDir, 'P202607', 'padron.json')));
    assert.ok(existsSync(join(repoDir, 'P202608', 'padron.json')));
    const cal607 = await repo.cargarCalendario('202607');
    assert.ok(cal607, '202607 sigue existiendo, sin alterar');
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
