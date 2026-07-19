import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarResumenPeriodo, esLlegadaTarde } from '../../src/presentismo/domain/resumen-periodo.js';

// T001 (feature 011) — Fixtures de calibración de la proyección de acumulados
// del período (data-model.md, research.md §1-§2), derivados de los Acceptance
// Scenarios de US1. Capa crítica (Principio IV): alimenta la revisión previa a
// liquidación.

// Modalidad tipo 'mensual' de config/categorias.json: 07:00–16:00, margen 30.
const PARAMS = {
  aperturaOficial: 420,
  cierreOficial: 960,
  margenApertura: 30,
  margenCierre: 30,
  jornadaEsperada: 540,
  ventanaApertura: [300, 720],
};

// Jornada como la deja calcularEmpleado en resumen.jornadas: { fecha, ...resultado }.
function jornada(fecha, over = {}) {
  return {
    fecha,
    clasificacion: 'Laborable',
    estado: 'Completa',
    entrada: { hora: 425 },
    salida: { hora: 958 },
    entradaEfectiva: 420,
    salidaEfectiva: 960,
    totalDiario: 540,
    correccionVigente: false,
    correccion: null,
    pausas: [],
    ...over,
  };
}

function resumen(jornadas) {
  return { legajo: 1, periodo: '202607', params: PARAMS, jornadas };
}

const HOY = '2026-07-18';

test('cuenta completas, incompletas y suma horas de días vencidos', () => {
  const r = proyectarResumenPeriodo({
    resumen: resumen([
      jornada('2026-07-01'),
      jornada('2026-07-02', { estado: 'Incompleta', salida: null, salidaEfectiva: null, totalDiario: 0 }),
      jornada('2026-07-03'),
    ]),
    hoy: HOY,
  });
  assert.equal(r.completas, 2);
  assert.equal(r.incompletas, 1);
  assert.equal(r.horasTrabajadas, 1080);
});

test('ausencia: día Laborable vencido Sin fichadas; No Laborable y Feriado no cuentan', () => {
  const r = proyectarResumenPeriodo({
    resumen: resumen([
      jornada('2026-07-06', { estado: 'Sin fichadas', entrada: null, salida: null, entradaEfectiva: null, salidaEfectiva: null, totalDiario: 0 }),
      jornada('2026-07-04', { clasificacion: 'No Laborable', estado: 'No aplica', entrada: null, salida: null, totalDiario: 0 }),
      jornada('2026-07-09', { clasificacion: 'Feriado', estado: 'Feriado cumplido', entrada: null, salida: null, totalDiario: 540 }),
    ]),
    hoy: HOY,
  });
  assert.equal(r.ausencias, 1);
  assert.equal(r.horasTrabajadas, 540, 'el feriado acredita jornada (regla de 004)');
});

test('los días futuros del período en curso no cuentan (FR-008)', () => {
  const r = proyectarResumenPeriodo({
    resumen: resumen([
      jornada('2026-07-17'),
      jornada('2026-07-21', { estado: 'Sin fichadas', entrada: null, salida: null, totalDiario: 0 }),
      jornada('2026-07-22', { estado: 'Sin fichadas', entrada: null, salida: null, totalDiario: 0 }),
    ]),
    hoy: HOY,
  });
  assert.equal(r.ausencias, 0, 'un día futuro sin fichadas no es ausencia');
  assert.equal(r.completas, 1);
  assert.equal(r.detalle.length, 1, 'el detalle tampoco incluye días futuros');
});

test('llegada tarde: entrada fuera del margen de apertura', () => {
  const tarde = jornada('2026-07-02', { entrada: { hora: 490 }, entradaEfectiva: 490, estado: 'Completa' });
  const r = proyectarResumenPeriodo({
    resumen: resumen([jornada('2026-07-01'), tarde, jornada('2026-07-03', { entrada: { hora: 470 }, entradaEfectiva: 470 })]),
    hoy: HOY,
  });
  assert.equal(r.llegadasTarde, 2, '490 y 470 superan apertura+margen (450)');
});

test('la corrección de entrada prevalece: tarde corregida no cuenta (Clarifications)', () => {
  const corregida = jornada('2026-07-02', {
    entrada: { hora: 490 },
    entradaEfectiva: 420,
    correccionVigente: true,
    correccion: { entradaCorregida: 425, salidaCorregida: null },
  });
  const r = proyectarResumenPeriodo({ resumen: resumen([corregida]), hoy: HOY });
  assert.equal(r.llegadasTarde, 0);
  assert.equal(r.correcciones, 1);
});

test('retiros anticipados: días con pausa vigente tipo retiro_anticipado', () => {
  const conRetiro = jornada('2026-07-02', {
    pausas: [{ desde: 870, hasta: 960, tipo: 'retiro_anticipado', vigente: true }],
  });
  const conPausa = jornada('2026-07-03', {
    pausas: [{ desde: 720, hasta: 780, tipo: 'intermedia', vigente: true }],
  });
  const conRetiroRevertido = jornada('2026-07-06', {
    pausas: [{ desde: 870, hasta: 960, tipo: 'retiro_anticipado', vigente: false }],
  });
  const r = proyectarResumenPeriodo({
    resumen: resumen([conRetiro, conPausa, conRetiroRevertido]),
    hoy: HOY,
  });
  assert.equal(r.retirosAnticipados, 1);
});

test('coherencia fila↔detalle (SC-002): la fila es derivable del detalle', () => {
  const r = proyectarResumenPeriodo({
    resumen: resumen([
      jornada('2026-07-01'),
      jornada('2026-07-02', { entrada: { hora: 490 }, entradaEfectiva: 490 }),
      jornada('2026-07-03', { estado: 'Sin fichadas', entrada: null, salida: null, totalDiario: 0 }),
      jornada('2026-07-06', {
        correccionVigente: true,
        correccion: { entradaCorregida: 425, salidaCorregida: null },
        pausas: [{ desde: 870, hasta: 960, tipo: 'retiro_anticipado', vigente: true }],
      }),
    ]),
    hoy: HOY,
  });
  assert.equal(r.horasTrabajadas, r.detalle.reduce((s, d) => s + d.horas, 0));
  assert.equal(r.completas, r.detalle.filter((d) => d.estado === 'Completa').length);
  assert.equal(r.ausencias, r.detalle.filter((d) => d.estado === 'Sin fichadas').length);
  assert.equal(r.llegadasTarde, r.detalle.filter((d) => d.llegadaTarde).length);
  assert.equal(r.correcciones, r.detalle.filter((d) => d.corregida).length);
  assert.equal(
    r.retirosAnticipados,
    r.detalle.filter((d) => d.pausas.some((p) => p.tipo === 'retiro_anticipado')).length,
  );
});

test('el detalle expone fecha, clasificación, estado, efectivas, horas y pausas vigentes', () => {
  const r = proyectarResumenPeriodo({
    resumen: resumen([
      jornada('2026-07-02', {
        pausas: [
          { desde: 720, hasta: 780, tipo: 'intermedia', vigente: true },
          { desde: 800, hasta: 820, tipo: 'intermedia', vigente: false },
        ],
      }),
    ]),
    hoy: HOY,
  });
  const [d] = r.detalle;
  assert.equal(d.fecha, '2026-07-02');
  assert.equal(d.clasificacion, 'Laborable');
  assert.equal(d.estado, 'Completa');
  assert.equal(d.entrada, 420);
  assert.equal(d.salida, 960);
  assert.equal(d.horas, 540);
  assert.equal(d.pausas.length, 1, 'solo pausas vigentes');
});

test('esLlegadaTarde: sin entrada no hay tarde; solo aplica a Laborable', () => {
  assert.equal(esLlegadaTarde(jornada('2026-07-01', { entrada: null }), PARAMS), false);
  assert.equal(
    esLlegadaTarde(jornada('2026-07-09', { clasificacion: 'Feriado', entrada: { hora: 500 } }), PARAMS),
    false,
  );
  assert.equal(esLlegadaTarde(jornada('2026-07-01', { entrada: { hora: 490 } }), PARAMS), true);
  assert.equal(esLlegadaTarde(jornada('2026-07-01', { entrada: { hora: 445 } }), PARAMS), false);
});
