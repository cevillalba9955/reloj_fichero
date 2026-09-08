import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearEntornoFichadasHoy, fechaDelMes, mesActualPeriodo } from '../helpers/fichadas-hoy-entorno.js';

// 018-informe-cierre-periodo (T013 / T037) — flujo end-to-end sobre el
// servidor web real: cerrar emite y guarda la copia; se puede re-emitir a
// demanda; reabrir la marca obsoleta; volver a cerrar la regenera; las cifras
// coinciden con /api/resumen-periodo (SC-008).

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' },
  { legajo: 2, categoria: 'ADMIN', nombre: 'Beto Díaz' },
];
const FECHA = fechaDelMes(1);
const P = mesActualPeriodo();

function entorno(opts = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [
      { legajo: 1, fecha: FECHA, hora: '07:00:00' },
      { legajo: 1, fecha: FECHA, hora: '16:05:00' },
    ],
    ...opts,
  });
}

const post = (e, path, body) =>
  fetch(`${e.base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
const getJson = async (e, path) => {
  const res = await fetch(`${e.base}${path}`);
  return { status: res.status, body: await res.json() };
};

function informeGuardado(e) {
  const ruta = join(e.repoDir, `P${P}`, 'informe-cierre.json');
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
}

test('cerrar el período emite y guarda el informe (modo automático); reabrir lo marca obsoleto; re-cerrar lo regenera', async () => {
  const e = await entorno();
  try {
    // 1. cerrar → auto-emisión
    assert.equal((await post(e, `/api/calendarios/${P}/cerrar`, { autor: 'ana' })).status, 200);
    const guardado = informeGuardado(e);
    assert.ok(guardado, 'informe-cierre.json creado en la carpeta del período');
    assert.ok(guardado.Mes, 'entrada del tramo Mes');
    assert.equal(guardado.Mes.sello.modo, 'automatico');
    assert.equal(guardado.Mes.obsoleto, false);

    // 2. GET devuelve la copia
    const g1 = await getJson(e, `/api/calendarios/${P}/informe-cierre`);
    assert.equal(g1.status, 200);
    assert.equal(g1.body.periodoId, P);
    assert.equal(g1.body.obsoleto, false);
    const emitidoAutomatico = g1.body.sello.emitidoEn;

    // 3. re-emisión manual reemplaza la copia
    await new Promise((r) => setTimeout(r, 5));
    const rem = await post(e, `/api/calendarios/${P}/informe-cierre`, { autor: 'beto' });
    assert.equal(rem.status, 200);
    const g2 = await getJson(e, `/api/calendarios/${P}/informe-cierre`);
    assert.equal(g2.body.sello.modo, 'manual');
    assert.equal(g2.body.sello.autor, 'beto');
    assert.notEqual(g2.body.sello.emitidoEn, emitidoAutomatico);

    // 4. reabrir → copia obsoleta
    assert.equal((await post(e, `/api/calendarios/${P}/reabrir`, { autor: 'ana' })).status, 200);
    const g3 = await getJson(e, `/api/calendarios/${P}/informe-cierre`);
    assert.equal(g3.status, 200);
    assert.equal(g3.body.obsoleto, true);

    // 5. volver a cerrar → copia vigente otra vez
    assert.equal((await post(e, `/api/calendarios/${P}/cerrar`, { autor: 'ana' })).status, 200);
    const g4 = await getJson(e, `/api/calendarios/${P}/informe-cierre`);
    assert.equal(g4.body.obsoleto, false);
    assert.equal(g4.body.sello.modo, 'automatico');

    // el detalle omite los días No Laborables (sábados/domingos)
    for (const seccion of g4.body.detalle.secciones) {
      assert.ok(
        seccion.dias.every((d) => d.clasificacion !== 'No Laborable'),
        'ningún renglón del detalle debe ser un día No Laborable',
      );
    }
  } finally {
    e.close();
  }
});

test('las cifras del informe son coherentes con /api/resumen-periodo (SC-008)', async () => {
  // El período de prueba es el mes EN CURSO: el informe cubre todo el tramo
  // (corte = fin de mes, research.md §2) mientras que /api/resumen-periodo se
  // corta en `hoy`. Por eso el informe puede contar MÁS ausencias, pero las
  // horas trabajadas y jornadas completas de la actividad ya vencida (legajo 1
  // fichó el día 1) deben coincidir exactamente, y el informe nunca reporta
  // menos ausencias que la pantalla.
  const e = await entorno();
  try {
    await post(e, `/api/calendarios/${P}/cerrar`, { autor: 'ana' });
    const informe = (await getJson(e, `/api/calendarios/${P}/informe-cierre`)).body;
    const resumen = (await getJson(e, `/api/resumen-periodo?periodo=${P}`)).body;

    for (const filaR of resumen.filas) {
      const filaI = informe.resumen.filas.find((f) => f.legajo === filaR.legajo);
      assert.ok(filaI, `informe incluye legajo ${filaR.legajo}`);
      assert.ok(filaI.ausencias >= filaR.ausencias, 'el informe cubre todo el tramo');
      assert.equal(filaI.llegadasTarde, filaR.llegadasTarde);
    }
    const i1 = informe.resumen.filas.find((f) => f.legajo === 1);
    const r1 = resumen.filas.find((f) => f.legajo === 1);
    assert.equal(i1.horasTrabajadas, r1.horasTrabajadas);
    assert.equal(i1.completas, r1.completas);

    // cuadre interno del informe (SC-002): siempre exacto
    for (const s of informe.detalle.secciones) {
      const f = informe.resumen.filas.find((x) => x.legajo === s.legajo);
      assert.equal(s.subtotalHoras, f.horasTrabajadas);
    }
  } finally {
    e.close();
  }
});

test('modo QUINCENAL: cerrar crea las entradas Q1 y Q2; GET ?tramo=Q1 abarca sólo la primera quincena', async () => {
  const e = await entorno({ envExtra: { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' } });
  try {
    await post(e, `/api/calendarios/${P}/cerrar`, { autor: 'ana' });
    const guardado = informeGuardado(e);
    assert.deepEqual(Object.keys(guardado).sort(), ['Q1', 'Q2']);

    const q1 = (await getJson(e, `/api/calendarios/${P}/informe-cierre?tramo=Q1`)).body;
    assert.equal(q1.periodoId, `${P}-Q1`);
    for (const seccion of q1.detalle.secciones) {
      for (const dia of seccion.dias) {
        assert.ok(Number(dia.fecha.slice(8, 10)) <= 15, `día ${dia.fecha} dentro de Q1`);
      }
    }
  } finally {
    e.close();
  }
});
