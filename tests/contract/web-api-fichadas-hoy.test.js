import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  crearEntornoFichadasHoy,
  fechaDelMes,
  mesActualPeriodo,
} from '../helpers/fichadas-hoy-entorno.js';

// T008 (feature 010, US1) — Contrato de GET /api/fichadas-hoy.
// Ver specs/010-fichadas-hoy/contracts/web-api.md y data-model.md
// (VistaFichadasHoy / FilaFichadaHoy).

const PADRON = [
  { legajo: 1, categoria: 'ADMIN', nombre: 'Ana Pérez' },
  { legajo: 9, categoria: 'CATEGORIA_INEXISTENTE', nombre: 'Zoe Anomalía' },
];

// Día 1: siempre <= hoy, así la fecha es navegable cualquiera sea el día en que
// corra la suite (iteración 2 valida FECHA_FUERA_DE_RANGO sobre fechas futuras).
const FECHA = fechaDelMes(1);

test('GET /api/fichadas-hoy → 200 con la forma de VistaFichadasHoy', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`);
    assert.equal(res.status, 200);
    const v = await res.json();

    assert.equal(v.fecha, FECHA);
    assert.equal(v.periodo, mesActualPeriodo());
    assert.equal(v.diaClasificacion, 'Laborable');
    assert.ok(Array.isArray(v.empleados));
    assert.equal(v.empleados.length, 2);

    // Forma de FilaFichadaHoy (data-model.md).
    for (const fila of v.empleados) {
      for (const campo of [
        'legajo', 'nombre', 'entrada', 'salida', 'horasTrabajadas',
        'situacion', 'correccionVigente', 'pausas', 'anomalias',
      ]) {
        assert.ok(campo in fila, `cada fila debe incluir "${campo}"`);
      }
    }

    const fila1 = v.empleados.find((f) => f.legajo === 1);
    assert.equal(fila1.nombre, 'Ana Pérez');
    assert.equal(fila1.entrada, '07:05', 'horas en HH:MM, nunca minutos crudos');
    assert.equal(fila1.salida, null);
    assert.equal(fila1.situacion, 'PRESENTE');

    // Principio V / FR-015: sin rawHex ni datos biométricos en la respuesta.
    assert.ok(!/rawHex|template|huella/i.test(JSON.stringify(v)));
  } finally {
    e.close();
  }
});

test('GET /api/fichadas-hoy — legajo sin categoría configurada → fila ANOMALIA (FR-014)', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`);
    assert.equal(res.status, 200);
    const v = await res.json();
    const fila9 = v.empleados.find((f) => f.legajo === 9);
    assert.equal(fila9.situacion, 'ANOMALIA');
    assert.ok(fila9.anomalias.length > 0, 'la anomalía se explica en texto');
    assert.equal(fila9.entrada, null);
    assert.equal(fila9.horasTrabajadas, 0);
  } finally {
    e.close();
  }
});

test('GET /api/fichadas-hoy — padrón vacío → 200 con empleados []', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: [],
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.deepEqual(v.empleados, []);
  } finally {
    e.close();
  }
});

test('GET /api/fichadas-hoy — ?fecha mal formada → 400 FECHA_INVALIDA', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=16-07-2026`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'FECHA_INVALIDA');
  } finally {
    e.close();
  }
});

// ---------------------------------------------------------------------------
// T018 (US2) — POST /api/fichadas-hoy/correcciones.
// ---------------------------------------------------------------------------

function postJson(base, path, payload) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('POST correcciones — sin motivo → 400 CORRECCION_INVALIDA y nada se persiste', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '08:15', autor: 'admin', motivo: '   ',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'CORRECCION_INVALIDA');

    const v = await (await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`)).json();
    assert.equal(v.empleados.find((f) => f.legajo === 1).correccionVigente, false);
  } finally {
    e.close();
  }
});

test('POST correcciones — hora con formato inválido → 400 CORRECCION_INVALIDA', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '8h15', autor: 'admin', motivo: 'fichada perdida',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'CORRECCION_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST correcciones — sin entrada, salida ni total → 400 CORRECCION_INVALIDA', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, autor: 'admin', motivo: 'sin cambios',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'CORRECCION_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST correcciones — legajo sin categoría → 409 EMPLEADO_SIN_CATEGORIA', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 9, fecha: FECHA, entrada: '08:15', autor: 'admin', motivo: 'no corresponde',
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.codigo, 'EMPLEADO_SIN_CATEGORIA');
  } finally {
    e.close();
  }
});

// ---------------------------------------------------------------------------
// T030 (US3) — POST /api/fichadas-hoy/pausas y /retiros-anticipados.
// ---------------------------------------------------------------------------

test('POST pausas — sin motivo → 400 PAUSA_INVALIDA', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/pausas', {
      legajo: 1, fecha: FECHA, desde: '12:00', hasta: '13:00', autor: 'admin',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PAUSA_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST pausas — desde >= hasta → 400 PAUSA_INVALIDA', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/pausas', {
      legajo: 1, fecha: FECHA, desde: '13:00', hasta: '12:00', autor: 'admin', motivo: 'corte',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'PAUSA_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST pausas — éxito → 200 con la fila recalculada y la pausa listada', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [
      { legajo: 1, fecha: FECHA, hora: '07:05:00' },
      { legajo: 1, fecha: FECHA, hora: '15:58:00' },
    ],
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/pausas', {
      legajo: 1, fecha: FECHA, desde: '12:00', hasta: '13:00', autor: 'admin',
      motivo: 'Corte de mediodía no fichado',
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.horasTrabajadas, 480, '9:00 menos 1:00 de pausa');
    assert.deepEqual(fila.pausas, [
      { desde: '12:00', hasta: '13:00', tipo: 'intermedia', motivo: 'Corte de mediodía no fichado' },
    ]);
  } finally {
    e.close();
  }
});

test('POST retiros-anticipados — sin motivo → 400 RETIRO_INVALIDO', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/retiros-anticipados', {
      legajo: 1, fecha: FECHA, hora: '14:30', autor: 'admin', motivo: '',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'RETIRO_INVALIDO');
  } finally {
    e.close();
  }
});

test('POST retiros-anticipados — hora posterior al cierre oficial → 400 RETIRO_INVALIDO', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    // Modalidad 'mensual': cierre 16:00. 17:00 no es un retiro "anticipado".
    const res = await postJson(e.base, '/api/fichadas-hoy/retiros-anticipados', {
      legajo: 1, fecha: FECHA, hora: '17:00', autor: 'admin', motivo: 'se fue después',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'RETIRO_INVALIDO');
  } finally {
    e.close();
  }
});

test('POST retiros-anticipados — éxito → 200 con situacion RETIRO_ANTICIPADO', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '07:05:00' }],
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/retiros-anticipados', {
      legajo: 1, fecha: FECHA, hora: '14:30', autor: 'admin@utn', motivo: 'Turno médico autorizado',
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.situacion, 'RETIRO_ANTICIPADO');
    assert.equal(fila.pausas.length, 1);
    assert.equal(fila.pausas[0].tipo, 'retiro_anticipado');
    assert.equal(fila.pausas[0].desde, '14:30');
    assert.equal(fila.pausas[0].hasta, '16:00', 'hasta = cierre oficial de la modalidad');
  } finally {
    e.close();
  }
});

// ---------------------------------------------------------------------------
// T042 (US4) — POST /api/fichadas-hoy/consultar-reloj.
// ---------------------------------------------------------------------------

// Fake del servidor de control local del servicio de fichadas (POST /tick).
function controlFake(respuesta) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(respuesta));
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }),
    );
  });
}

test('POST consultar-reloj — control local responde ok → 200 con la vista actualizada', async () => {
  const control = await controlFake({ resultado: 'ok', fichadasNuevas: 0, detail: null });
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    envExtra: { FICHADAS_CONTROL_URL: control.url },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.resultado, 'ok');
    assert.equal(body.fichadasNuevas, 0);
    assert.ok(Array.isArray(body.vista?.empleados), 'incluye la VistaFichadasHoy recalculada');
  } finally {
    e.close();
    control.close();
  }
});

test('POST consultar-reloj — control local caído → 502 ERROR_CONSULTANDO_RELOJ', async () => {
  // Puerto sin nada escuchando: se reserva y se cierra antes de usarlo.
  const libre = await controlFake({});
  libre.close();
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    envExtra: { FICHADAS_CONTROL_URL: libre.url },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.codigo, 'ERROR_CONSULTANDO_RELOJ');
  } finally {
    e.close();
  }
});

test('POST consultar-reloj — el ciclo del reloj falló (resultado "error") → 502', async () => {
  const control = await controlFake({ resultado: 'error', fichadasNuevas: 0, detail: 'timeout' });
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    envExtra: { FICHADAS_CONTROL_URL: control.url },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy/consultar-reloj`, { method: 'POST' });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.codigo, 'ERROR_CONSULTANDO_RELOJ');
  } finally {
    e.close();
    control.close();
  }
});

// ---------------------------------------------------------------------------
// T058/T059 (US5, iteración 2) — Navegación de días previos: el GET con ?fecha=
// es contrato oficial; fechas futuras o de períodos sin calendario ("período de
// liquidación abierto", research.md §6) → 400 FECHA_FUERA_DE_RANGO, también en
// los POST de edición.
// ---------------------------------------------------------------------------

// 'YYYY-MM-DD' a `delta` días de hoy (reloj real del sistema, UTC-safe).
function fechaRelativa(delta) {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + delta))
    .toISOString()
    .slice(0, 10);
}

// Día 15 del mes ANTERIOR: el entorno solo genera calendario del mes actual,
// así que este período no está "abierto".
function fechaMesSinCalendario() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth() - 1, 15)).toISOString().slice(0, 10);
}

test('GET sin ?fecha → 200 con navegacion { esHoy: true, siguiente: null }', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.ok(v.navegacion, 'la vista incluye el bloque navegacion');
    assert.equal(v.navegacion.esHoy, true);
    assert.equal(v.navegacion.siguiente, null, 'nunca se ofrece un día futuro');
  } finally {
    e.close();
  }
});

test('GET ?fecha= de un día previo navegable → 200 con navegacion coherente', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${FECHA}`);
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.fecha, FECHA);
    // esHoy solo si la suite corre justo el día 1 del mes.
    assert.equal(v.navegacion.esHoy, FECHA === fechaRelativa(0));
    assert.equal(v.navegacion.anterior, null, 'el día 1 del único período con calendario no ofrece anterior');
  } finally {
    e.close();
  }
});

test('GET ?fecha= futura → 400 FECHA_FUERA_DE_RANGO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${fechaRelativa(1)}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'FECHA_FUERA_DE_RANGO');
  } finally {
    e.close();
  }
});

test('GET ?fecha= de un período sin calendario → 400 FECHA_FUERA_DE_RANGO', async () => {
  const e = await crearEntornoFichadasHoy({ padron: PADRON });
  try {
    const res = await fetch(`${e.base}/api/fichadas-hoy?fecha=${fechaMesSinCalendario()}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'FECHA_FUERA_DE_RANGO');
  } finally {
    e.close();
  }
});

test('POST correcciones/pausas/retiros — fecha futura o de período sin calendario → 400 FECHA_FUERA_DE_RANGO', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
  });
  try {
    const casos = [
      ['/api/fichadas-hoy/correcciones', { entrada: '08:15' }],
      ['/api/fichadas-hoy/pausas', { desde: '12:00', hasta: '13:00' }],
      ['/api/fichadas-hoy/retiros-anticipados', { hora: '14:30' }],
    ];
    for (const [path, extra] of casos) {
      for (const fecha of [fechaRelativa(1), fechaMesSinCalendario()]) {
        const res = await postJson(e.base, path, {
          legajo: 1, fecha, autor: 'admin', motivo: 'motivo válido', ...extra,
        });
        assert.equal(res.status, 400, `${path} con fecha ${fecha}`);
        assert.equal((await res.json()).error.codigo, 'FECHA_FUERA_DE_RANGO', `${path} con fecha ${fecha}`);
      }
    }
  } finally {
    e.close();
  }
});

test('POST correcciones — éxito → 200 con la FilaFichadaHoy recalculada', async () => {
  const e = await crearEntornoFichadasHoy({
    padron: PADRON,
    clasificaciones: { [FECHA]: 'Laborable' },
    fichadas: [{ legajo: 1, fecha: FECHA, hora: '08:10:00' }], // TARDE
  });
  try {
    const res = await postJson(e.base, '/api/fichadas-hoy/correcciones', {
      legajo: 1, fecha: FECHA, entrada: '07:05', autor: 'admin@utn',
      motivo: 'fichada de entrada perdida por corte de red del reloj',
    });
    assert.equal(res.status, 200);
    const fila = await res.json();
    assert.equal(fila.legajo, 1);
    assert.equal(fila.entrada, '07:05', 'muestra la hora corregida, no la fichada');
    assert.equal(fila.correccionVigente, true);
    assert.equal(fila.situacion, 'PRESENTE', 'la situación se recalcula');
  } finally {
    e.close();
  }
});
