import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertCumplePuerto } from '../../src/presentismo/ports/index.js';
import { createInMemoryPresentismoRepository } from '../../src/presentismo/adapters/in-memory-presentismo-repository.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// Fábricas de repositorio a testear con el MISMO set (contrato).
const fabricas = {
  'in-memory': () => ({ repo: createInMemoryPresentismoRepository(), cleanup: () => {} }),
  file: () => {
    const dir = mkdtempSync(join(tmpdir(), 'presentismo-repo-'));
    return {
      repo: createFilePresentismoRepository({ repoDir: dir }),
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  },
};

for (const [nombre, fabrica] of Object.entries(fabricas)) {
  test(`[${nombre}] cumple el puerto PresentismoRepository`, () => {
    const { repo, cleanup } = fabrica();
    try {
      assert.ok(assertCumplePuerto('PresentismoRepository', repo));
    } finally {
      cleanup();
    }
  });

  test(`[${nombre}] guarda y carga calendario`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      assert.equal(await repo.cargarCalendario('202607'), null);
      const cal = { periodo: '202607', dias: [{ fecha: '2026-07-01' }] };
      await repo.guardarCalendario(cal);
      const cargado = await repo.cargarCalendario('202607');
      assert.equal(cargado.periodo, '202607');
      assert.equal(cargado.dias.length, 1);
    } finally {
      cleanup();
    }
  });

  test(`[${nombre}] corrección: alta, supersede previa y reversión`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      await repo.guardarCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', valorCorregido: 540, motivo: 'olvido' });
      await repo.guardarCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', valorCorregido: 480, motivo: 'ajuste' });
      let vigentes = (await repo.listarCorrecciones('202607', 1234)).filter((c) => c.vigente);
      assert.equal(vigentes.length, 1, 'solo una vigente por jornada');
      assert.equal(vigentes[0].valorCorregido, 480);
      await repo.revertirCorreccion('202607', 1234, '2026-07-10');
      vigentes = (await repo.listarCorrecciones('202607', 1234)).filter((c) => c.vigente);
      assert.equal(vigentes.length, 0);
    } finally {
      cleanup();
    }
  });

  test(`[${nombre}] pausa: alta, id y reversión`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      const id = await repo.guardarPausa({ periodo: '202607', legajo: 1234, fecha: '2026-07-13', desde: 720, hasta: 780, motivo: 'corte' });
      assert.ok(id, 'devuelve id');
      let vigentes = (await repo.listarPausas('202607', 1234)).filter((p) => p.vigente);
      assert.equal(vigentes.length, 1);
      await repo.revertirPausa('202607', id);
      vigentes = (await repo.listarPausas('202607', 1234)).filter((p) => p.vigente);
      assert.equal(vigentes.length, 0);
    } finally {
      cleanup();
    }
  });

  test(`[${nombre}] rechaza corrección/pausa sin motivo`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      await assert.rejects(() => repo.guardarCorreccion({ periodo: '202607', legajo: 1, fecha: '2026-07-01', valorCorregido: 1, motivo: '' }));
      await assert.rejects(() => repo.guardarPausa({ periodo: '202607', legajo: 1, fecha: '2026-07-01', desde: 1, hasta: 2, motivo: '  ' }));
    } finally {
      cleanup();
    }
  });

  // feature 012 — Justificación de Ausencias: alta, no duplica vigentes y reversión.
  test(`[${nombre}] justificación: alta, una vigente por legajo/día y reversión`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      assert.deepEqual(await repo.listarJustificaciones('202607', 1234), []);
      await repo.guardarJustificacion({
        periodo: '202607',
        legajo: 1234,
        fecha: '2026-07-10',
        motivoId: 'vacaciones',
        etiquetaMotivo: 'Vacaciones',
        tipoPago: 'Paga',
        autor: 'a',
        fechaHora: '2026-07-01T00:00:00.000Z',
      });
      let vigentes = (await repo.listarJustificaciones('202607', 1234)).filter((j) => j.vigente);
      assert.equal(vigentes.length, 1);
      assert.equal(vigentes[0].motivoId, 'vacaciones');

      const ok = await repo.revertirJustificacion('202607', 1234, '2026-07-10', { autor: 'b' });
      assert.equal(ok, true);
      vigentes = (await repo.listarJustificaciones('202607', 1234)).filter((j) => j.vigente);
      assert.equal(vigentes.length, 0);
      const todas = await repo.listarJustificaciones('202607', 1234);
      assert.equal(todas[0].reversion.autor, 'b');

      const okDeNuevo = await repo.revertirJustificacion('202607', 1234, '2026-07-10', { autor: 'c' });
      assert.equal(okDeNuevo, false, 'no hay nada vigente para revertir dos veces');
    } finally {
      cleanup();
    }
  });

  test(`[${nombre}] rechaza justificación sin motivoId`, async () => {
    const { repo, cleanup } = fabrica();
    try {
      await assert.rejects(() =>
        repo.guardarJustificacion({ periodo: '202607', legajo: 1, fecha: '2026-07-01', motivoId: '' }),
      );
    } finally {
      cleanup();
    }
  });
}
