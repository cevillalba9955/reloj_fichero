import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
} from '../helpers/fichadas-hoy-entorno.js';

// T009 (feature 010, US1) — Integración: con fichadas ya cargadas en el archivo
// del período actual, GET /api/fichadas-hoy refleja la situación de cada
// Acceptance Scenario de la Historia 1 del spec. Se extiende por historia
// (US2: correcciones; US3: pausas/retiros; US4: consulta al reloj).

const FECHA = fechaDelMes(10); // reclasificada Laborable
const FERIADO = fechaDelMes(11); // reclasificada Feriado

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Presente' }, // entrada en margen
  { legajo: 2, categoria: 'ADMIN', nombre: 'Bruno Espera' }, // sin fichadas
  { legajo: 3, categoria: 'ADMIN', nombre: 'Carla Tarde' }, // entrada fuera de margen
  { legajo: 4, categoria: 'ADMIN', nombre: 'Dario Completo' }, // entrada + salida
];

// Modalidad 'mensual' (config/categorias.json): 07:00–16:00, margen 30 min,
// ventana de entrada 05:00–12:00.
function entorno(extra = {}) {
  return crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable', [FERIADO]: 'Feriado' },
    fichadas: [
      { legajo: 1, fecha: FECHA, hora: '07:05:00' },
      { legajo: 3, fecha: FECHA, hora: '08:10:00' },
      { legajo: 4, fecha: FECHA, hora: '07:05:00' },
      { legajo: 4, fecha: FECHA, hora: '15:58:00' },
    ],
    ...extra,
  });
}

test('US1: la lista del día refleja la situación de cada empleado esperado', async () => {
  const e = await entorno();
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`);
    assert.equal(res.status, 200);
    const v = await res.json();
    const por = new Map(v.empleados.map((f) => [f.legajo, f]));

    // Escenario 1: entrada dentro de margen, sin salida → PRESENTE.
    assert.equal(por.get(1).situacion, 'PRESENTE');
    assert.equal(por.get(1).entrada, '07:05');
    assert.equal(por.get(1).salida, null);

    // Escenarios 2/4: sin fichadas → ESPERANDO (ventana abierta) o AUSENTE
    // (vencida). El corte exacto por hora está calibrado en los tests unitarios
    // de situacion-dia con `ahora` inyectado; acá depende del reloj real.
    assert.ok(['ESPERANDO', 'AUSENTE'].includes(por.get(2).situacion));
    assert.equal(por.get(2).entrada, null);
    assert.equal(por.get(2).horasTrabajadas, 0);

    // Escenario 3: entrada fuera del margen de tolerancia → TARDE.
    assert.equal(por.get(3).situacion, 'TARDE');
    assert.equal(por.get(3).entrada, '08:10');

    // Escenario 5: entrada y salida dentro de márgenes → jornada completa.
    assert.equal(por.get(4).situacion, 'Completa');
    assert.equal(por.get(4).entrada, '07:05');
    assert.equal(por.get(4).salida, '15:58');
    assert.equal(por.get(4).horasTrabajadas, 540, '9 h en minutos (formato de 004)');
  } finally {
    e.close();
  }
});

test('US1: un Feriado no penaliza — Feriado cumplido, nunca AUSENTE (FR-013)', async () => {
  const e = await entorno();
  try {
    const v = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FERIADO}`)).json();
    assert.equal(v.diaClasificacion, 'Feriado');
    for (const fila of v.empleados) {
      assert.equal(fila.situacion, 'Feriado cumplido', `legajo ${fila.legajo}`);
    }
  } finally {
    e.close();
  }
});

function postJson(base, path, payload) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// T019 (US2) — la corrección persiste auditada y prevalece sobre fichadas
// posteriores del mismo campo (spec, Historia 2 escenario 3 + edge case).
test('US2: la corrección persiste con autor/motivo/valores y prevalece sobre una fichada real posterior', async () => {
  const e = await entorno();
  try {
    // Legajo 3 entró 08:10 (TARDE, auto incompleto → total 0). Se corrige la
    // entrada a 07:05 con motivo.
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 3, fecha: FECHA, entrada: '07:05', autor: 'admin@utn', motivo: 'error del reloj',
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.entrada, '07:05');
    assert.equal(fila.situacion, 'PRESENTE');
    assert.equal(fila.correccionVigente, true);

    // Auditoría (FR-005/SC-003): autor, motivo, fechaHora, valor anterior/nuevo.
    const estado = JSON.parse(readFileSync(join(e.repoDir, `${e.periodo}.json`), 'utf8'));
    const corr = estado.correcciones.find((c) => c.legajo === 3 && c.vigente);
    assert.equal(corr.autor, 'admin@utn');
    assert.equal(corr.motivo, 'error del reloj');
    assert.ok(corr.fechaHora, 'marca de tiempo de la corrección');
    assert.equal(corr.entradaCorregida, 425, 'valor nuevo');
    assert.notEqual(corr.valorCalculado, undefined, 'snapshot del valor anterior');
    assert.deepEqual(corr.camposCorregidos, ['entrada']);

    // Llega una fichada real POSTERIOR del mismo campo (entrada 08:20): la
    // corrección manual no se sobrescribe (FR-009).
    e.agregarFichadas([{ legajo: 3, fecha: FECHA, hora: '08:20:00' }]);
    const v = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    const fila3 = v.empleados.find((f) => f.legajo === 3);
    assert.equal(fila3.entrada, '07:05', 'la corrección sigue prevaleciendo');
    assert.equal(fila3.correccionVigente, true);
  } finally {
    e.close();
  }
});

test('US2: dos correcciones sucesivas conservan el historial completo (edge case)', async () => {
  const e = await entorno();
  try {
    await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '07:10', autor: 'admin', motivo: 'primer ajuste',
    });
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '07:20', autor: 'admin', motivo: 'segundo ajuste',
    });
    assert.equal(res.status, 200);

    const estado = JSON.parse(readFileSync(join(e.repoDir, `${e.periodo}.json`), 'utf8'));
    const deLegajo1 = estado.correcciones.filter((c) => c.legajo === 1 && c.fecha === FECHA);
    assert.equal(deLegajo1.length, 2, 'ambas altas quedan en el historial');
    assert.equal(deLegajo1.filter((c) => c.vigente).length, 1, 'una sola vigente');
    assert.equal(deLegajo1.find((c) => c.vigente).motivo, 'segundo ajuste');
  } finally {
    e.close();
  }
});

// T031 (US3) — pausa descuenta dentro de la jornada efectiva; el retiro
// anticipado marca la situación sin duplicar una salida real ya fichada.
test('US3: la pausa descuenta horas solo dentro de la jornada efectiva', async () => {
  const e = await entorno();
  try {
    // Legajo 4: jornada completa 07:05–15:58 → efectiva 07:00–16:00 = 540 min.
    // Pausa 12:00–13:00 (adentro) → descuenta 60.
    const res = await postJson(e.base, '/api/fichadas-hoy/pausas', {
      legajo: 4, fecha: FECHA, desde: '12:00', hasta: '13:00', autor: 'admin', motivo: 'corte',
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).horasTrabajadas, 480);

    // Pausa 04:00–05:00 (totalmente fuera de la jornada efectiva) → no descuenta.
    const res2 = await postJson(e.base, '/api/fichadas-hoy/pausas', {
      legajo: 4, fecha: FECHA, desde: '04:00', hasta: '05:00', autor: 'admin', motivo: 'error',
    });
    assert.equal(res2.status, 200);
    assert.equal((await res2.json()).horasTrabajadas, 480, 'sin descuento adicional');

    // Auditoría (SC-003): ambas pausas con autor/motivo/fechaHora y tipo.
    const estado = JSON.parse(readFileSync(join(e.repoDir, `${e.periodo}.json`), 'utf8'));
    const deLegajo4 = estado.pausas.filter((p) => p.legajo === 4);
    assert.equal(deLegajo4.length, 2);
    for (const p of deLegajo4) {
      assert.equal(p.autor, 'admin');
      assert.ok(p.motivo.length > 0);
      assert.ok(p.fechaHora);
      assert.equal(p.tipo, 'intermedia');
    }
  } finally {
    e.close();
  }
});

test('US3: el retiro anticipado marca la situación y no duplica la salida real fichada', async () => {
  const e = await entorno();
  try {
    // Legajo 4 ya fichó salida real 15:58. Se registra retiro 14:30 (edge case).
    const res = await postJson(e.base, '/api/fichadas-hoy/retiros-anticipados', {
      legajo: 4, fecha: FECHA, hora: '14:30', autor: 'admin', motivo: 'turno médico',
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.situacion, 'RETIRO_ANTICIPADO');
    assert.equal(fila.salida, '15:58', 'la salida fichada no se duplica ni contradice');
    // Descuento 14:30→16:00 dentro de la efectiva 07:00–16:00 = 90 min.
    assert.equal(fila.horasTrabajadas, 450);

    // El GET siguiente refleja lo mismo (persistido).
    const v = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    assert.equal(v.empleados.find((f) => f.legajo === 4).situacion, 'RETIRO_ANTICIPADO');
  } finally {
    e.close();
  }
});

// T043 (US4) — consulta manual al reloj vía el control local (research.md §4):
// el fake de control emula al proceso de fichadas (persiste ANTES de responder
// el /tick, y aplica el single-flight del scheduler).
function controlConTick(tick) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const body = await tick();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }),
    );
  });
}

test('US4: control caído → 502 y la vista existente no se corrompe', async () => {
  const cerrado = await controlConTick(async () => ({}));
  cerrado.close();
  const e = await entorno({ envExtra: { FICHADAS_CONTROL_URL: cerrado.url } });
  try {
    const antes = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();

    const res = await fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.codigo, 'ERROR_CONSULTANDO_RELOJ');

    const despues = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    assert.deepEqual(despues, antes, 'los datos previos siguen intactos (FR-010)');
  } finally {
    e.close();
  }
});

test('US4: el control trae 2 fichadas nuevas → la vista devuelta ya las refleja', async () => {
  let entregar = null; // se fija tras crear el entorno
  const control = await controlConTick(async () => {
    // Emula el sink del scheduler: persiste en el archivo del período ANTES de
    // responder (research.md §4: al responder el /tick, el archivo ya está).
    entregar?.();
    return { resultado: 'ok', fichadasNuevas: 2, detail: null };
  });
  const e = await entorno({ envExtra: { FICHADAS_CONTROL_URL: control.url } });
  const HOY = fechaDelMes(new Date().getDate());
  entregar = () =>
    e.agregarFichadas([
      { legajo: 1, fecha: HOY, hora: '07:03:00' },
      { legajo: 3, fecha: HOY, hora: '07:06:00' },
    ]);
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resultado, 'ok');
    assert.equal(body.fichadasNuevas, 2);
    // La vista devuelta es la de HOY (la consulta opera sobre el día en curso)
    // y ya incluye las fichadas recién persistidas.
    assert.equal(body.vista.fecha, HOY);
    const fila1 = body.vista.empleados.find((f) => f.legajo === 1);
    assert.equal(fila1.entrada, '07:03');
  } finally {
    e.close();
    control.close();
  }
});

test('US4: dos consultas en paralelo → single-flight (una ok, la otra omitida)', async () => {
  // Emula el single-flight del scheduler (consultaEnCurso de 002): el lock
  // vive en el proceso de fichadas, no en el web.
  let enCurso = false;
  const control = await controlConTick(async () => {
    if (enCurso) return { resultado: 'omitido', fichadasNuevas: 0, detail: 'consulta ya en curso' };
    enCurso = true;
    await new Promise((r) => setTimeout(r, 150));
    enCurso = false;
    return { resultado: 'ok', fichadasNuevas: 0, detail: null };
  });
  const e = await entorno({ envExtra: { FICHADAS_CONTROL_URL: control.url } });
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' }),
      fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' }),
    ]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    const resultados = [(await r1.json()).resultado, (await r2.json()).resultado].sort();
    assert.deepEqual(resultados, ['ok', 'omitido'], 'nunca dos sesiones concurrentes contra el reloj');
  } finally {
    e.close();
    control.close();
  }
});

// T054 (Principio V) — los eventos NDJSON de alta cubren los campos nuevos
// (campos corregidos, tipo de pausa) sin datos biométricos ni rawHex.
test('auditoría NDJSON: correccion_alta y pausa_alta registran los campos nuevos sin datos sensibles', async () => {
  const e = await entorno();
  try {
    await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '07:10', autor: 'admin', motivo: 'ajuste',
    });
    await postJson(e.base, '/api/fichadas-hoy/retiros-anticipados', {
      legajo: 4, fecha: FECHA, hora: '14:30', autor: 'admin', motivo: 'turno médico',
    });

    const lineas = readFileSync(join(e.logDir, 'presentismo.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    const alta = lineas.find((l) => l.tipo === 'correccion_alta');
    assert.ok(alta, 'se registró correccion_alta');
    assert.deepEqual(alta.campos, ['entrada'], 'incluye qué campos se corrigieron');

    const pausa = lineas.find((l) => l.tipo === 'pausa_alta');
    assert.ok(pausa, 'se registró pausa_alta');
    assert.equal(pausa.tipoPausa, 'retiro_anticipado', 'incluye el tipo de pausa');

    // Principio V: nada de rawHex/biométricos ni motivos con datos personales
    // de fichadas crudas en el log.
    const serial = JSON.stringify(lineas);
    assert.ok(!/rawHex|template|huella/i.test(serial));
  } finally {
    e.close();
  }
});

test('US1: la vista es de solo lectura — el GET no altera el estado persistido', async () => {
  const e = await entorno();
  try {
    const antes = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    const despues = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    assert.deepEqual(despues, antes, 'dos GET consecutivos devuelven lo mismo');
  } finally {
    e.close();
  }
});
