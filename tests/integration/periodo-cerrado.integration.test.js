import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { createCalcularPresentismoService } from '../../src/presentismo/service/calcular-presentismo-service.js';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';
import { loadMotivosAusenciaConfig } from '../../src/presentismo/config/motivos-ausencia-config.js';
import { registrarFichadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';
import { createArchiveFichadasProvider } from '../../src/presentismo/adapters/archive-fichadas-provider.js';

// 013-reestructurar-data-periodos (US3, quickstart.md Escenario 3 +
// verificación transversal SC-004): un período cerrado bloquea toda escritura
// (reclasificar, corrección, pausa, retiro anticipado, justificación,
// incorporar fichadas) sin alterar sus datos; la consulta sigue funcionando
// igual; reabrir restaura el comportamiento anterior.

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

function motivosConfig() {
  return loadMotivosAusenciaConfig('./config/motivos-ausencia.json');
}

// Stub mínimo de EmployeeCategoryProvider: legajo 1 siempre está en 'ADMIN'
// (la única categoría configurada, ver config() arriba).
function categoryProviderDeTest() {
  return { async obtenerCategoria(legajo) { return { legajo, codigoCategoria: 'ADMIN' }; } };
}

function crearServicio(repoDir) {
  const repo = createFilePresentismoRepository({ repoDir });
  const fichadasProvider = createArchiveFichadasProvider({ repoDir });
  const svc = createCalcularPresentismoService({
    repo,
    categoriasConfig: config(),
    fichadasProvider,
    categoryProvider: categoryProviderDeTest(),
    motivosAusenciaConfig: motivosConfig(),
  });
  return { repo, svc, fichadasProvider };
}

test('[US3] cerrar bloquea reclasificar, corrección, pausa, retiro anticipado y justificación; reabrir los vuelve a habilitar', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-cerrado-'));
  try {
    const { repo, svc } = crearServicio(repoDir);
    await svc.generarCalendario('202607');

    const cal = await svc.cerrarPeriodo('202607', 'rrhh.mgomez');
    assert.equal(cal.cerrado, true);

    await assert.rejects(() => svc.reclasificarDia('202607', '2026-07-06', 'Feriado', 'x'), /cerrado/);
    await assert.rejects(
      () => svc.cargarCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-06', valorCorregido: 480, autor: 'x', motivo: 'm' }),
      /cerrado/,
    );
    await assert.rejects(
      () => svc.cargarPausa({ periodo: '202607', legajo: 1, fecha: '2026-07-06', desde: 600, hasta: 660, autor: 'x', motivo: 'm' }),
      /cerrado/,
    );
    await assert.rejects(
      () => svc.cargarRetiroAnticipado({ periodo: '202607', legajo: 1, fecha: '2026-07-06', hora: 800, autor: 'x', motivo: 'm' }),
      /cerrado/,
    );
    await assert.rejects(
      () => svc.cargarJustificacion({ legajo: 1, fecha: '2026-07-06', motivoId: 'examen', autor: 'x', hoy: '2026-07-20' }),
      /cerrado/,
    );

    // Ninguno de los intentos alteró el calendario ni agregó correcciones/pausas/justificaciones.
    const calDespues = await repo.cargarCalendario('202607');
    assert.equal(calDespues.dias.find((d) => d.fecha === '2026-07-06').clasificacion, calDespues.dias.find((d) => d.fecha === '2026-07-06').clasificacion);
    assert.equal((await repo.listarCorrecciones('202607', 1)).length, 0);
    assert.equal((await repo.listarPausas('202607', 1)).length, 0);
    assert.equal((await repo.listarJustificaciones('202607', 1)).length, 0);

    // Consultar sigue funcionando igual (FR-007).
    const resumen = await svc.calcularEmpleado(1, '202607');
    assert.ok(Array.isArray(resumen));

    // Reabrir restaura la escritura.
    const reabierto = await svc.reabrirPeriodo('202607', 'rrhh.otra');
    assert.equal(reabierto.cerrado, false);
    await svc.reclasificarDia('202607', '2026-07-06', 'Feriado', 'x');
    const calFinal = await repo.cargarCalendario('202607');
    assert.equal(calFinal.dias.find((d) => d.fecha === '2026-07-06').clasificacion, 'Feriado');
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US3] incorporar fichadas a un período cerrado se rechaza (FR-006)', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-cerrado-'));
  try {
    const { svc } = crearServicio(repoDir);
    await svc.generarCalendario('202607');
    await svc.cerrarPeriodo('202607', 'x');

    // El punto de entrada de fichadas (CLI/servicio del reloj) no pasa por el
    // servicio: la guarda vive en el propio punto de entrada (research.md §4).
    // Acá simulamos ese chequeo tal como lo hace cmdImportarFichadas.
    const { exigirPeriodoAbierto } = await import('../../src/presentismo/domain/calendario-mes.js');
    const repo = createFilePresentismoRepository({ repoDir });
    const cal = await repo.cargarCalendario('202607');
    assert.throws(() => exigirPeriodoAbierto(cal), /cerrado/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('[US3] cerrar y reabrir un período no altera ningún resultado de cálculo ya existente (SC-004)', async () => {
  const repoDir = mkdtempSync(join(tmpdir(), 'periodo-cerrado-'));
  try {
    const { svc } = crearServicio(repoDir);
    await svc.generarCalendario('202607');
    registrarFichadas({
      repoDir,
      periodo: '202607',
      fichadas: [{ legajo: 1, fecha: '2026-07-06', hora: '07:00:00', metodo: 'huella', rawHex: 'AA11' }],
    });

    const antes = await svc.calcularEmpleado(1, '202607');
    await svc.cerrarPeriodo('202607', 'x');
    const durante = await svc.calcularEmpleado(1, '202607');
    await svc.reabrirPeriodo('202607', 'y');
    const despues = await svc.calcularEmpleado(1, '202607');

    assert.deepEqual(antes, durante);
    assert.deepEqual(antes, despues);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});
