import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryPresentismoRepository } from '../../src/presentismo/adapters/in-memory-presentismo-repository.js';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';
import { createCalcularPresentismoService } from '../../src/presentismo/service/calcular-presentismo-service.js';

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

// Genera ~200 fichadas para un legajo en el mes (varias por día).
function fichadasDeUnMes(legajo) {
  const fichadas = [];
  for (let dd = 1; dd <= 31; dd++) {
    const fecha = `2026-07-${String(dd).padStart(2, '0')}`;
    for (const hora of [425, 660, 958]) {
      fichadas.push({ legajo, fecha, hora, id: `${legajo}-${fecha}-${hora}` });
    }
  }
  return fichadas; // 93 por legajo (suficiente para el objetivo de ≤200/mes)
}

test('SC-003: cálculo de un empleado (mes) en < 2 s', async () => {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({
    repo,
    categoriasConfig: config(),
    categoryProvider: { async obtenerCategoria(l) { return { legajo: l, codigoCategoria: 'ADMIN' }; } },
    fichadasProvider: { async obtenerFichadasDelMes(l) { return fichadasDeUnMes(l); } },
  });
  await svc.generarCalendario('202607');
  const t0 = performance.now();
  await svc.calcularEmpleado(1, '202607');
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `tardó ${ms.toFixed(1)} ms`);
});

test('SC-004: cálculo de plantilla (500 empleados, mes) en < 30 s', async () => {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({
    repo,
    categoriasConfig: config(),
    categoryProvider: { async obtenerCategoria(l) { return { legajo: l, codigoCategoria: 'ADMIN' }; } },
    fichadasProvider: { async obtenerFichadasDelMes(l) { return fichadasDeUnMes(l); } },
  });
  await svc.generarCalendario('202607');
  const legajos = Array.from({ length: 500 }, (_, i) => i + 1);
  const t0 = performance.now();
  const resultados = await svc.calcularPlantilla('202607', legajos);
  const ms = performance.now() - t0;
  assert.equal(resultados.length, 500);
  assert.ok(ms < 30000, `tardó ${ms.toFixed(1)} ms`);
});

test('SC-008/SC-015: invariantes de no negatividad y tope de jornada', async () => {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({
    repo,
    categoriasConfig: config(),
    categoryProvider: { async obtenerCategoria(l) { return { legajo: l, codigoCategoria: 'ADMIN' }; } },
    fichadasProvider: { async obtenerFichadasDelMes(l) { return fichadasDeUnMes(l); } },
  });
  await svc.generarCalendario('202607');
  const [r] = await svc.calcularEmpleado(1, '202607');
  for (const j of r.jornadas) {
    if (j.correccionVigente) continue; // una corrección puede exceder (FR-024)
    assert.ok(j.horasAuto >= 0 && j.horasAuto <= 540, `horasAuto fuera de rango: ${j.horasAuto}`);
    assert.ok(j.totalDiario >= 0, `total negativo: ${j.totalDiario}`);
  }
});
