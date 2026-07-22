import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { crearEntornoConfiguracion } from '../helpers/configuracion-entorno.js';

// feature 014 — Contrato de /api/configuracion/* (contracts/web-api-configuracion.md).
// US1 (T007): GET/PUT /api/configuracion/reloj (host/port). US1 (proxy): POST
// .../probar-conexion contra un control-API real de prueba.

// --- Reloj y servicio (US1) -------------------------------------------------

test('GET /api/configuracion/reloj → 200 con los valores actuales', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.host, '10.0.0.5');
    assert.equal(body.port, 5005);
    assert.ok('timeoutMs' in body && 'resumenPeriodo' in body);
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/reloj — guardado válido → 200 y persiste en .env', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '10.0.0.9', port: 6000 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.host, '10.0.0.9');
    assert.equal(body.port, 6000);

    const releido = await (await fetch(`${e.base}/api/configuracion/reloj`)).json();
    assert.equal(releido.host, '10.0.0.9');
    assert.equal(releido.port, 6000);

    const contenidoEnv = readFileSync(e.rutaEnv, 'utf8');
    assert.match(contenidoEnv, /FICHADAS_HOST=10\.0\.0\.9/);
    assert.match(contenidoEnv, /# \.env de prueba/, 'preserva comentarios existentes');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/reloj — puerto fuera de rango → 400 y no persiste nada', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '10.0.0.9', port: 70000 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'CONFIGURACION_INVALIDA');

    const releido = await (await fetch(`${e.base}/api/configuracion/reloj`)).json();
    assert.equal(releido.host, '10.0.0.5', 'FICHADAS_HOST tampoco se persistió (rechazo atómico)');
    assert.equal(releido.port, 5005);
  } finally {
    e.close();
  }
});

// --- Categorías, modalidades y esquema semanal (US3) ------------------------

const MODALIDAD_QUINCENAL = {
  tipo: 'Quincenal',
  aperturaOficial: '06:00',
  cierreOficial: '14:00',
  margenAperturaMin: 15,
  margenCierreMin: 15,
  ventanaApertura: ['05:00', '10:00'],
  ventanaCierre: ['10:00', '23:59'],
};

test('GET /api/configuracion/categorias → 200 con modalidades/categorias/esquemaSemanal', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const body = await (await fetch(`${e.base}/api/configuracion/categorias`)).json();
    assert.ok(body.modalidades.mensual);
    assert.equal(body.categorias.ADMIN.modalidad, 'mensual');
    assert.deepEqual(body.esquemaSemanal, ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']);
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/categorias/esquema-semanal — válido → 200; vacío → 400', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const ok = await fetch(`${e.base}/api/configuracion/categorias/esquema-semanal`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dias: ['lunes', 'martes'] }),
    });
    assert.equal(ok.status, 200);

    const invalido = await fetch(`${e.base}/api/configuracion/categorias/esquema-semanal`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dias: [] }),
    });
    assert.equal(invalido.status, 400);
    assert.equal((await invalido.json()).error.codigo, 'CONFIGURACION_INVALIDA');
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/categorias/modalidades — alta → 201, disponible para asignar', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/categorias/modalidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'quincenal_operarios', ...MODALIDAD_QUINCENAL }),
    });
    assert.equal(res.status, 201);

    const categorias = await (await fetch(`${e.base}/api/configuracion/categorias`)).json();
    assert.ok(categorias.modalidades.quincenal_operarios);
  } finally {
    e.close();
  }
});

test('DELETE /api/configuracion/categorias/modalidades/:nombre — en uso → 409 con las categorías', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/categorias/modalidades/mensual`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.codigo, 'MODALIDAD_EN_USO');
    assert.match(body.error.mensaje, /ADMIN/);
  } finally {
    e.close();
  }
});

test('DELETE /api/configuracion/categorias/modalidades/:nombre — sin uso → 200', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/categorias/modalidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'quincenal_operarios', ...MODALIDAD_QUINCENAL }),
    });
    const res = await fetch(`${e.base}/api/configuracion/categorias/modalidades/quincenal_operarios`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { eliminada: true });
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/categorias/categorias — código duplicado → 400; modalidad inexistente → 400', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const duplicado = await fetch(`${e.base}/api/configuracion/categorias/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'ADMIN', modalidad: 'mensual' }),
    });
    assert.equal(duplicado.status, 400);
    assert.equal((await duplicado.json()).error.codigo, 'CATEGORIA_DUPLICADA');

    const sinModalidad = await fetch(`${e.base}/api/configuracion/categorias/categorias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: 'PROD', modalidad: 'fantasma' }),
    });
    assert.equal(sinModalidad.status, 400);
    assert.equal((await sinModalidad.json()).error.codigo, 'MODALIDAD_INEXISTENTE');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/categorias/categorias/:codigo — reasigna la modalidad', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/categorias/modalidades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'quincenal_operarios', ...MODALIDAD_QUINCENAL }),
    });
    const res = await fetch(`${e.base}/api/configuracion/categorias/categorias/ADMIN`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modalidad: 'quincenal_operarios' }),
    });
    assert.equal(res.status, 200);
    const categorias = await (await fetch(`${e.base}/api/configuracion/categorias`)).json();
    assert.equal(categorias.categorias.ADMIN.modalidad, 'quincenal_operarios');
  } finally {
    e.close();
  }
});

test('DELETE /api/configuracion/categorias/categorias/:codigo — no se ofrece (FR-012a) → 405', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/categorias/categorias/ADMIN`, { method: 'DELETE' });
    assert.equal(res.status, 405, 'eliminar una categoría no es una operación soportada por esta página');

    const categorias = await (await fetch(`${e.base}/api/configuracion/categorias`)).json();
    assert.ok(categorias.categorias.ADMIN, 'la categoría sigue existiendo, intacta');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/categorias/categorias/:codigo — código inexistente → 404', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/categorias/categorias/NOEXISTE`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modalidad: 'mensual' }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'CATEGORIA_NO_ENCONTRADA');
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/reloj/probar-conexion — proxea al control-API y devuelve { ok }', async () => {
  const control = createHttpServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/probar-conexion') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => control.listen(0, '127.0.0.1', r));
  try {
    const e = await crearEntornoConfiguracion({
      envExtra: { FICHADAS_CONTROL_URL: `http://127.0.0.1:${control.address().port}` },
    });
    try {
      const res = await fetch(`${e.base}/api/configuracion/reloj/probar-conexion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: '10.0.0.5', port: 5005 }),
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    } finally {
      e.close();
    }
  } finally {
    control.close();
  }
});

test('POST /api/configuracion/reloj/probar-conexion — control-API no disponible → 502', async () => {
  const e = await crearEntornoConfiguracion({
    envExtra: { FICHADAS_CONTROL_URL: 'http://127.0.0.1:1' }, // nada escuchando
  });
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj/probar-conexion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '10.0.0.5', port: 5005 }),
    });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.codigo, 'SERVICIO_FICHADAS_NO_DISPONIBLE');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/reloj — guarda el resto de los parámetros operativos (US4)', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeoutMs: 8000,
        tickIntervalMs: 120000,
        statusIntervalMs: 30000,
        entradaHora: '07:30',
        entradaDuracion: 45,
        fullHandshake: true,
        controlPort: 5006,
        resumenPeriodo: 'QUINCENAL',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.timeoutMs, 8000);
    assert.equal(body.tickIntervalMs, 120000);
    assert.equal(body.statusIntervalMs, 30000);
    assert.equal(body.entradaHora, '07:30');
    assert.equal(body.entradaDuracion, 45);
    assert.equal(body.fullHandshake, true);
    assert.equal(body.controlPort, 5006);
    assert.equal(body.resumenPeriodo, 'QUINCENAL');
    // host/port no se tocaron por este guardado
    assert.equal(body.host, '10.0.0.5');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/reloj — un campo inválido no persiste ningún campo del body (US4, FR-004)', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutMs: 9000, entradaHora: '25:99' }),
    });
    assert.equal(res.status, 400);

    const releido = await (await fetch(`${e.base}/api/configuracion/reloj`)).json();
    assert.equal(releido.timeoutMs, 5000, 'timeoutMs tampoco se persistió (rechazo atómico)');
  } finally {
    e.close();
  }
});

// --- Motivos de ausencia (US2) ----------------------------------------------

test('GET /api/configuracion/motivos-ausencia → 200 con el catálogo completo (incluye inactivos)', async () => {
  const e = await crearEntornoConfiguracion({
    motivos: {
      motivos: [
        { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga', activo: true },
        { id: 'viejo', etiqueta: 'Viejo', tipoPago: 'Paga', activo: false },
      ],
    },
  });
  try {
    const body = await (await fetch(`${e.base}/api/configuracion/motivos-ausencia`)).json();
    assert.equal(body.motivos.length, 2);
    assert.ok(body.motivos.some((m) => m.id === 'viejo' && m.activo === false));
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/motivos-ausencia — alta → 201, aparece en el catálogo', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/motivos-ausencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'mudanza', etiqueta: 'Mudanza', tipoPago: 'No paga' }),
    });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).etiqueta, 'Mudanza');

    const catalogo = await (await fetch(`${e.base}/api/configuracion/motivos-ausencia`)).json();
    assert.ok(catalogo.motivos.some((m) => m.id === 'mudanza'));
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/motivos-ausencia — id duplicado → 400 MOTIVO_DUPLICADO', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/motivos-ausencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'sin_aviso', etiqueta: 'Otra', tipoPago: 'Paga' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'MOTIVO_DUPLICADO');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/motivos-ausencia/:id — edita etiqueta/tipoPago sin cambiar el id', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/motivos-ausencia/sin_aviso`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiqueta: 'Sin aviso previo', tipoPago: 'Paga' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, 'sin_aviso');
    assert.equal(body.etiqueta, 'Sin aviso previo');
    assert.equal(body.tipoPago, 'Paga');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/motivos-ausencia/:id — activo:false desactiva (FR-009)', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    await fetch(`${e.base}/api/configuracion/motivos-ausencia/sin_aviso`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    });
    const activos = await (await fetch(`${e.base}/api/motivos-ausencia`)).json();
    assert.ok(!activos.motivos.some((m) => m.id === 'sin_aviso'), 'ya no se ofrece para nuevas justificaciones');

    const completo = await (await fetch(`${e.base}/api/configuracion/motivos-ausencia`)).json();
    assert.ok(completo.motivos.some((m) => m.id === 'sin_aviso'), 'sigue existiendo en el catálogo completo');
  } finally {
    e.close();
  }
});

test('PUT /api/configuracion/motivos-ausencia/:id — id inexistente → 404', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/motivos-ausencia/no_existe`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ etiqueta: 'X' }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.codigo, 'MOTIVO_NO_ENCONTRADO');
  } finally {
    e.close();
  }
});

test('POST /api/configuracion/reloj/probar-conexion — body inválido → 400', async () => {
  const e = await crearEntornoConfiguracion();
  try {
    const res = await fetch(`${e.base}/api/configuracion/reloj/probar-conexion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '10.0.0.5' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.codigo, 'CONFIGURACION_INVALIDA');
  } finally {
    e.close();
  }
});
