import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirInformeCierre, rangoDeTramo } from '../../src/presentismo/domain/informe-cierre.js';

// 018-informe-cierre-periodo (T008) — proyección pura: arma el Informe de
// Resumen + el Informe de Detalle + la lista de pendientes + el sello a partir
// de las filas que devuelve calcularResumenPeriodo. NO recalcula presentismo.

const base = {
  periodoId: '202607',
  periodoMes: '202607',
  tramo: 'Mes',
  emision: 'manual',
  granularidad: 'MENSUAL',
  autor: 'ana',
  emitidoEn: '2026-08-01T09:00:00.000Z',
  rangoFechas: { desde: '2026-07-01', hasta: '2026-07-31' },
};

function dia(over = {}) {
  return {
    fecha: '2026-07-01',
    clasificacion: 'Laborable',
    estado: 'Completa',
    entrada: 480,
    salida: 960,
    horas: 8,
    llegadaTarde: false,
    corregida: false,
    pausas: [],
    justificacion: null,
    requiereJustificacionRevision: false,
    ...over,
  };
}

function filaNormal(over = {}) {
  const detalle = over.detalle ?? [dia()];
  const horas = over.horasTrabajadas ?? detalle.reduce((s, d) => s + d.horas, 0);
  return {
    legajo: 10,
    nombre: 'Ada Lovelace',
    modalidad: 'Mensual',
    horasTrabajadas: horas,
    completas: 1,
    incompletas: 0,
    ausencias: 0,
    llegadasTarde: 0,
    retirosAnticipados: 0,
    correcciones: 0,
    feriado: 0,
    licencia: 0,
    vacaciones: 0,
    anomalia: null,
    ...over,
    detalle,
  };
}

const filaAnomalia = { legajo: 99, nombre: 'Grace Hopper', anomalia: 'empleado sin categoría en el padrón' };

test('rangoDeTramo: Mes / Q1 / Q2 (incluye febrero no bisiesto)', () => {
  assert.deepEqual(rangoDeTramo('202607', 'Mes'), { desde: '2026-07-01', hasta: '2026-07-31' });
  assert.deepEqual(rangoDeTramo('202607', 'Q1'), { desde: '2026-07-01', hasta: '2026-07-15' });
  assert.deepEqual(rangoDeTramo('202607', 'Q2'), { desde: '2026-07-16', hasta: '2026-07-31' });
  assert.deepEqual(rangoDeTramo('202602', 'Q2'), { desde: '2026-02-16', hasta: '2026-02-28' });
});

test('sello: identifica período, tramo, modo de emisión, momento y autor', () => {
  const { sello, resumen } = construirInformeCierre({ ...base, filas: [filaNormal()] });
  assert.deepEqual(sello, {
    periodoId: '202607',
    periodoMes: '202607',
    tramo: 'Mes',
    modo: 'manual',
    emitidoEn: '2026-08-01T09:00:00.000Z',
    autor: 'ana',
  });
  // la granularidad de la instalación va en el encabezado del resumen, no en el sello
  assert.equal(resumen.encabezado.modo, 'MENSUAL');
});

test('resumen.encabezado: totalHoras = Σ filas, empleados = filas.length', () => {
  const filas = [filaNormal({ legajo: 1, horasTrabajadas: 160 }), filaNormal({ legajo: 2, horasTrabajadas: 40 })];
  const { resumen } = construirInformeCierre({ ...base, filas });
  assert.equal(resumen.encabezado.totalHoras, 200);
  assert.equal(resumen.encabezado.empleados, 2);
  assert.equal(resumen.filas.length, 2);
  assert.deepEqual(resumen.encabezado.rangoFechas, base.rangoFechas);
});

test('cuadre resumen ↔ detalle: subtotalHoras de cada sección = horasTrabajadas de su fila (SC-002)', () => {
  const filas = [
    filaNormal({ legajo: 1, detalle: [dia({ fecha: '2026-07-01', horas: 8 }), dia({ fecha: '2026-07-02', horas: 7.5 })] }),
  ];
  const { resumen, detalle } = construirInformeCierre({ ...base, filas });
  assert.equal(detalle.secciones[0].subtotalHoras, 15.5);
  assert.equal(detalle.secciones[0].subtotalHoras, resumen.filas[0].horasTrabajadas);
});

test('fila de anomalía: contadores en 0 en el resumen y sección de detalle sin días', () => {
  const { resumen, detalle } = construirInformeCierre({ ...base, filas: [filaAnomalia] });
  const filaR = resumen.filas[0];
  assert.equal(filaR.anomalia, 'empleado sin categoría en el padrón');
  assert.equal(filaR.horasTrabajadas, 0);
  assert.equal(filaR.ausencias, 0);
  const seccion = detalle.secciones[0];
  assert.deepEqual(seccion.dias, []);
  assert.equal(seccion.anomalia, 'empleado sin categoría en el padrón');
});

test('pendientes: jornadas incompletas listadas con legajo, nombre y fechas', () => {
  const filas = [
    filaNormal({
      legajo: 7,
      nombre: 'Linus',
      incompletas: 1,
      detalle: [dia({ fecha: '2026-07-03', estado: 'Incompleta', salida: null, horas: 0 }), dia({ fecha: '2026-07-04' })],
    }),
  ];
  const { pendientes } = construirInformeCierre({ ...base, filas });
  assert.equal(pendientes.hayPendientes, true);
  assert.deepEqual(pendientes.jornadasIncompletas, [{ legajo: 7, nombre: 'Linus', fechas: ['2026-07-03'] }]);
});

test('pendientes: anomalías y ajustes (corrección o justificación)', () => {
  const filas = [
    filaAnomalia,
    filaNormal({
      legajo: 5,
      nombre: 'Edsger',
      detalle: [
        dia({ fecha: '2026-07-01', corregida: true }),
        dia({ fecha: '2026-07-02', justificacion: { motivoId: 'enf', etiquetaMotivo: 'Enfermedad', tipoPago: 'Paga' } }),
        dia({ fecha: '2026-07-03' }),
      ],
    }),
  ];
  const { pendientes } = construirInformeCierre({ ...base, filas });
  assert.deepEqual(pendientes.anomalias, [{ legajo: 99, nombre: 'Grace Hopper', detalle: 'empleado sin categoría en el padrón' }]);
  assert.deepEqual(pendientes.ajustes, [{ legajo: 5, nombre: 'Edsger', fechas: ['2026-07-01', '2026-07-02'] }]);
  assert.equal(pendientes.hayPendientes, true);
});

test('pendientes: hayPendientes false cuando no hay incompletas, anomalías ni ajustes', () => {
  const { pendientes } = construirInformeCierre({ ...base, filas: [filaNormal()] });
  assert.deepEqual(pendientes, { hayPendientes: false, jornadasIncompletas: [], anomalias: [], ajustes: [] });
});
