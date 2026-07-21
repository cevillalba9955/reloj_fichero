import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryPresentismoRepository } from '../../src/presentismo/adapters/in-memory-presentismo-repository.js';
import { parseCategoriasConfig } from '../../src/presentismo/config/categorias-config.js';
import { createCalcularPresentismoService } from '../../src/presentismo/service/calcular-presentismo-service.js';
import { Clasificacion, diaDe } from '../../src/presentismo/domain/calendario-mes.js';

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

// ============================ Bloque US1 ============================

test('[US1] generar → reclasificar → regenerar preserva la edición', async () => {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });

  const cal = await svc.generarCalendario('202607');
  assert.equal(cal.dias.length, 31);
  assert.equal(diaDe(cal, '2026-07-04').clasificacion, Clasificacion.NO_LABORABLE, 'sábado');

  await svc.reclasificarDia('202607', '2026-07-09', Clasificacion.FERIADO, 'validador');
  const regenerado = await svc.generarCalendario('202607');
  assert.equal(diaDe(regenerado, '2026-07-09').clasificacion, Clasificacion.FERIADO);
  assert.equal(regenerado.dias.length, 31);

  // Persistido en el repo.
  const cargado = await repo.cargarCalendario('202607');
  assert.equal(diaDe(cargado, '2026-07-09').clasificacion, Clasificacion.FERIADO);
});

test('[US1] reclasificar sin calendario previo falla claro', async () => {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({ repo, categoriasConfig: config() });
  await assert.rejects(
    () => svc.reclasificarDia('202608', '2026-08-03', Clasificacion.FERIADO, 'x'),
    /no existe calendario/
  );
});

// ============================ Bloque US2 ============================

function configConQuincenal() {
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
      quincenal_op: {
        tipo: 'Quincenal',
        aperturaOficial: '06:00',
        cierreOficial: '14:00',
        margenAperturaMin: 15,
        margenCierreMin: 15,
        ventanaApertura: ['04:00', '11:00'],
        ventanaCierre: ['11:00', '22:00'],
      },
    },
    categorias: { ADMIN: { modalidad: 'mensual' }, PROD: { modalidad: 'quincenal_op' } },
  });
}

// Provider de fichadas fake: mapa legajo -> [{fecha,hora:minutos}]. Ids
// deterministas (estables entre llamadas) para no introducir ruido en la
// verificación de determinismo.
function fakeFichadas(porLegajo) {
  return {
    async obtenerFichadasDelMes(legajo) {
      return (porLegajo[legajo] ?? []).map((f, i) => ({
        legajo,
        fecha: f.fecha,
        hora: f.hora, // minutos-del-día
        id: `${legajo}-${f.fecha}-${f.hora}-${i}`,
      }));
    },
  };
}

function fakeCategoria(porLegajo) {
  return {
    async obtenerCategoria(legajo) {
      return { legajo, codigoCategoria: porLegajo[legajo] ?? null };
    },
  };
}

async function armar({ categorias, fichadas }) {
  const repo = createInMemoryPresentismoRepository();
  const svc = createCalcularPresentismoService({
    repo,
    categoriasConfig: configConQuincenal(),
    fichadasProvider: fakeFichadas(fichadas ?? {}),
    categoryProvider: fakeCategoria(categorias ?? {}),
  });
  await svc.generarCalendario('202607');
  return { repo, svc };
}

test('[US2] mensual: resumen con horas trabajadas y esperadas', async () => {
  const { svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    // 2026-07-01 (miércoles, Laborable): 07:05 y 15:58 → 9:00.
    fichadas: { 1234: [{ fecha: '2026-07-01', hora: 425 }, { fecha: '2026-07-01', hora: 958 }] },
  });
  const [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.modalidad, 'Mensual');
  assert.equal(r.tramo, 'Mes');
  // 23 días laborables * 540 = 12420 esperadas.
  assert.equal(r.horasEsperadas, 23 * 540);
  assert.equal(r.horasTrabajadas, 540, 'solo trabajó un día');
});

test('[US2] quincenal: emite dos resúmenes Q1 y Q2 (US2-10)', async () => {
  const { svc } = await armar({ categorias: { 5678: 'PROD' } });
  const rs = await svc.calcularEmpleado(5678, '202607');
  assert.equal(rs.length, 2);
  assert.deepEqual(rs.map((r) => r.tramo).sort(), ['Q1', 'Q2']);
  // Q1 (1–15) tiene 11 laborables; Q2 (16–31) tiene 12 laborables. Jornada 8 h = 480.
  const q1 = rs.find((r) => r.tramo === 'Q1');
  const q2 = rs.find((r) => r.tramo === 'Q2');
  assert.equal(q1.horasEsperadas + q2.horasEsperadas, 23 * 480, 'Q1+Q2 = mes (SC-012)');
});

test('[US2] modalidades distintas → parámetros propios (US2-11)', async () => {
  // Mismo día y fichadas, distinta modalidad.
  const fichadas = {
    1: [{ fecha: '2026-07-01', hora: 6 * 60 + 5 }, { fecha: '2026-07-01', hora: 13 * 60 + 58 }],
    2: [{ fecha: '2026-07-01', hora: 6 * 60 + 5 }, { fecha: '2026-07-01', hora: 13 * 60 + 58 }],
  };
  const { svc } = await armar({ categorias: { 1: 'ADMIN', 2: 'PROD' }, fichadas });
  const [admin] = await svc.calcularEmpleado(1, '202607');
  const prod = (await svc.calcularEmpleado(2, '202607')).find((r) => r.tramo === 'Q1');
  // ADMIN (07-16): entrada 06:05→07:00, salida 13:58→13:58 => 6:58 = 418.
  const jAdmin = admin.jornadas.find((j) => j.fecha === '2026-07-01');
  assert.equal(jAdmin.totalDiario, 418);
  // PROD (06-14, margen 15): entrada 06:05→06:00, salida 13:58→14:00 => 8:00 = 480.
  const jProd = prod.jornadas.find((j) => j.fecha === '2026-07-01');
  assert.equal(jProd.totalDiario, 480);
});

test('[US2] categoría no configurada → anomalía sin cálculo (US2-12, FR-035)', async () => {
  const { svc } = await armar({ categorias: { 9: 'FANTASMA' } });
  const [r] = await svc.calcularEmpleado(9, '202607');
  assert.equal(r.sinCalculo, true);
  assert.equal(r.anomalias.length, 1);
  assert.match(r.anomalias[0], /no configurada/);
});

test('[US2] feriado acredita jornada; No Laborable reporta aparte (US2-7/8)', async () => {
  const { svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    // Fichada un sábado No Laborable (2026-07-04).
    fichadas: { 1234: [{ fecha: '2026-07-04', hora: 540 }, { fecha: '2026-07-04', hora: 780 }] },
  });
  await svc.reclasificarDia('202607', '2026-07-09', Clasificacion.FERIADO, 'v');
  const [r] = await svc.calcularEmpleado(1234, '202607');
  // Feriado acreditado: horas trabajadas incluye 540 del feriado.
  assert.equal(r.horasTrabajadas, 540);
  // Fichadas del sábado no suman y se reportan aparte.
  assert.equal(r.fichadasFueraDeCalendario.length, 1);
  assert.equal(r.fichadasFueraDeCalendario[0].fecha, '2026-07-04');
});

test('[US2] determinismo: dos cálculos idénticos (SC-005)', async () => {
  const { svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    fichadas: { 1234: [{ fecha: '2026-07-01', hora: 425 }, { fecha: '2026-07-01', hora: 958 }] },
  });
  const a = await svc.calcularEmpleado(1234, '202607');
  const b = await svc.calcularEmpleado(1234, '202607');
  assert.deepEqual(a, b);
});

// ============================ Bloque US3 ============================

test('[US3] corrección con motivo incorpora horas y es reversible (US3-2/5)', async () => {
  const { svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    // Solo entrada 07:02 → incompleta, auto 0.
    fichadas: { 1234: [{ fecha: '2026-07-10', hora: 422 }] },
  });
  let [r] = await svc.calcularEmpleado(1234, '202607');
  const j = r.jornadas.find((x) => x.fecha === '2026-07-10');
  assert.equal(j.estado, 'Incompleta');
  assert.equal(j.sugerencia, 540, 'sugerencia no aplicada = 9:00 (US3-1)');
  assert.equal(r.horasTrabajadas, 0);

  await svc.cargarCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', valorCorregido: 540, autor: 'ana', motivo: 'olvido de salida' });
  [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.horasTrabajadas, 540, 'la corrección se incorpora');
  assert.equal(r.horasCorregidas, 540);

  await svc.revertirCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', autor: 'ana' });
  [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.horasTrabajadas, 0, 'vuelve al valor calculado');
});

test('[US3] corrección sin motivo es rechazada (US3-3)', async () => {
  const { svc } = await armar({ categorias: { 1234: 'ADMIN' } });
  await assert.rejects(
    () => svc.cargarCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', valorCorregido: 540, autor: 'ana', motivo: '' }),
    /motivo/
  );
});

test('[US3] pausa descuenta del total y es reversible (US3-6/7)', async () => {
  const { svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    fichadas: { 1234: [{ fecha: '2026-07-13', hora: 425 }, { fecha: '2026-07-13', hora: 958 }] }, // 9:00
  });
  let [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.horasTrabajadas, 540);

  const id = await svc.cargarPausa({ periodo: '202607', legajo: 1234, fecha: '2026-07-13', desde: 720, hasta: 780, autor: 'ana', motivo: 'corte de planta' });
  [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.horasTrabajadas, 480, 'descuenta 1 h');
  assert.equal(r.descuentoPausas, 60);

  await svc.revertirPausa({ periodo: '202607', id, autor: 'ana' });
  [r] = await svc.calcularEmpleado(1234, '202607');
  assert.equal(r.horasTrabajadas, 540, 'sin descuento tras revertir');
});

test('[US3] recálculo con corrección vigente la marca para revisión (US3-4/FR-029)', async () => {
  const { repo, svc } = await armar({
    categorias: { 1234: 'ADMIN' },
    fichadas: { 1234: [{ fecha: '2026-07-10', hora: 422 }] }, // incompleta, auto 0
  });
  // Corrección tomada cuando el auto valía 0.
  await svc.cargarCorreccion({ periodo: '202607', legajo: 1234, fecha: '2026-07-10', valorCorregido: 540, autor: 'ana', motivo: 'olvido' });

  // Llega una salida nueva: ahora el auto sería 9:00 → la corrección debe marcarse.
  const svc2 = createCalcularPresentismoService({
    repo,
    categoriasConfig: configConQuincenal(),
    fichadasProvider: fakeFichadas({ 1234: [{ fecha: '2026-07-10', hora: 422 }, { fecha: '2026-07-10', hora: 958 }] }),
    categoryProvider: fakeCategoria({ 1234: 'ADMIN' }),
  });
  const [r] = await svc2.calcularEmpleado(1234, '202607');
  const j = r.jornadas.find((x) => x.fecha === '2026-07-10');
  assert.equal(j.requiereRevision, true);
  assert.equal(j.totalDiario, 540, 'la corrección sigue prevaleciendo');
});

// Regresión (feature 010, "Fichadas de hoy") — un día YA PASADO sin fichadas
// debe ser AUSENTE, nunca ESPERANDO, sin importar qué hora del día sea
// "ahora": la ventana de entrada de un día que ya terminó está siempre
// vencida. Antes de este fix, calcularHoy usaba `ahora` (hora del reloj)
// contra la ventana del día SIN considerar si `fecha` ya había pasado.
test('[US1] calcularHoy: un día laborable ya pasado sin fichadas es AUSENTE, no ESPERANDO', async () => {
  const { svc } = await armar({ categorias: { 1234: 'ADMIN' }, fichadas: {} });
  // 2026-07-06 es lunes (Laborable); "hoy" es dos semanas después, y "ahora"
  // (400 min = 06:40) sigue dentro de la ventana de apertura de ADMIN/mensual
  // (05:00–12:00) si se la evaluara como si fuese el día de hoy.
  const resultado = await svc.calcularHoy('202607', '2026-07-06', [1234], {
    ahora: 400,
    hoy: '2026-07-20',
  });
  assert.equal(resultado.filas[0].situacion, 'AUSENTE');
});

test('[US1] calcularHoy: el día de HOY sigue en ESPERANDO mientras la ventana de entrada no venció', async () => {
  const { svc } = await armar({ categorias: { 1234: 'ADMIN' }, fichadas: {} });
  const resultado = await svc.calcularHoy('202607', '2026-07-06', [1234], {
    ahora: 400,
    hoy: '2026-07-06',
  });
  assert.equal(resultado.filas[0].situacion, 'ESPERANDO');
});
