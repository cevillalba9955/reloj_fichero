import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
} from '../helpers/fichadas-hoy-entorno.js';

// T006 (feature 011, US1) — Integración: escenarios 1.2-1.5 del spec (ausencia
// por día laborable sin fichadas, 2 llegadas tarde, corrección prevalece en
// horas y anula la tarde, día futuro no cuenta) + verificación transversal de
// solo lectura (SC-005).

// Días 1, 2, 3: siempre <= hoy, vencidos cualquiera sea el día en que corra la
// suite. Día "mañana" simula el edge case de período en curso.
const FECHA_TARDE_1 = fechaDelMes(1);
const FECHA_TARDE_2 = fechaDelMes(2);
const FECHA_AUSENCIA = fechaDelMes(3);

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Carla Tarde' }, // 2 entradas fuera de margen
  { legajo: 2, categoria: 'ADMIN', nombre: 'Bruno Ausente' }, // día laborable sin fichadas
];

function entorno(extra = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: {
      [FECHA_TARDE_1]: 'Laborable',
      [FECHA_TARDE_2]: 'Laborable',
      [FECHA_AUSENCIA]: 'Laborable',
    },
    fichadas: [
      { legajo: 1, fecha: FECHA_TARDE_1, hora: '08:10:00' },
      { legajo: 1, fecha: FECHA_TARDE_2, hora: '08:15:00' },
    ],
    ...extra,
  });
}

function postJson(base, path, payload) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('US1: ausencia por día laborable sin fichadas y 2 llegadas tarde', async () => {
  const e = await entorno();
  try {
    const v = await (await fetch(`${e.base}/api/resumen-periodo`)).json();
    const carla = v.filas.find((f) => f.legajo === 1);
    const bruno = v.filas.find((f) => f.legajo === 2);

    assert.equal(carla.llegadasTarde, 2, 'ambas entradas (08:10 y 08:15) exceden el margen 07:00+30min');
    // Bruno no fichó nada: TODOS los días laborables vencidos del período son
    // ausencia (no solo FECHA_AUSENCIA), por eso se verifica >= 1 en vez de un
    // total exacto (el total depende de en qué día del mes corre la suite).
    assert.ok(bruno.ausencias >= 1, 'al menos un día laborable sin fichadas cuenta como ausencia');

    const detalleBruno = await (await fetch(`${e.base}/api/resumen-periodo/2`)).json();
    const diaAusencia = detalleBruno.dias.find((d) => d.fecha === FECHA_AUSENCIA);
    assert.equal(diaAusencia.estado, 'Sin fichadas');
  } finally {
    e.close();
  }
});

test('US1: la corrección de entrada prevalece — anula la llegada tarde y suma a correcciones', async () => {
  const e = await entorno();
  try {
    await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA_TARDE_1, entrada: '07:05', autor: 'admin', motivo: 'corrección retroactiva',
    });
    const v = await (await fetch(`${e.base}/api/resumen-periodo`)).json();
    const carla = v.filas.find((f) => f.legajo === 1);

    assert.equal(carla.llegadasTarde, 1, 'una de las dos tardes quedó corregida a horario válido');
    assert.equal(carla.correcciones, 1);
  } finally {
    e.close();
  }
});

test('US1: coherencia fila↔detalle (SC-002) — la suma del detalle coincide con la fila', async () => {
  const e = await entorno();
  try {
    const resumen = await (await fetch(`${e.base}/api/resumen-periodo`)).json();
    const fila = resumen.filas.find((f) => f.legajo === 1);
    const detalle = await (await fetch(`${e.base}/api/resumen-periodo/1`)).json();

    const sumaHoras = detalle.dias.reduce((s, d) => s + (d.horas ?? 0), 0);
    assert.equal(sumaHoras, fila.horasTrabajadas);
    assert.equal(detalle.dias.filter((d) => d.llegadaTarde).length, fila.llegadasTarde);
    assert.equal(detalle.dias.filter((d) => d.corregida).length, fila.correcciones);
  } finally {
    e.close();
  }
});

test('US1: solo lectura — los GET no alteran el archivo del período (SC-005)', async () => {
  const e = await entorno();
  try {
    const archivo = join(e.repoDir, `${e.periodo}.json`);
    const antes = readFileSync(archivo, 'utf8');

    await fetch(`${e.base}/api/resumen-periodo`);
    await fetch(`${e.base}/api/resumen-periodo/1`);

    const despues = readFileSync(archivo, 'utf8');
    assert.equal(despues, antes, 'ningún GET de esta pantalla escribe en el archivo del período');
  } finally {
    e.close();
  }
});

// T025 (Polish, SC-004) — 500 legajos → GET /api/resumen-periodo responde en
// <10s. Padrón sintético; sin fichadas cargadas (peor caso razonable: cada
// legajo recalcula su período completo desde cero).
test('rendimiento: 500 legajos responden en menos de 10s (SC-004)', async () => {
  const padronGrande = Array.from({ length: 500 }, (_, i) => ({
    legajo: 1000 + i,
    categoria: 'ADMIN',
    nombre: `Empleado ${i}`,
  }));
  const e = await crearEntornoFichadasHoy({ padron: padronGrande });
  try {
    const inicio = Date.now();
    const res = await fetch(`${e.base}/api/resumen-periodo`);
    const transcurrido = Date.now() - inicio;
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.filas.length, 500);
    assert.ok(transcurrido < 10_000, `tardó ${transcurrido}ms, se esperaba <10000ms (SC-004)`);
  } finally {
    e.close();
  }
});
