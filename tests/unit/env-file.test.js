import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerParametrosEditables, escribirParametrosEditables } from '../../src/config/env-file.js';

// feature 014 (Foundational T005/T006, US1 T009, US4 T031) — env-file.js:
// lectura con defaults, preservación de comentarios/claves ajenas, rechazo
// atómico ante un campo inválido, y escritura atómica.

function envTmp(contenido = '') {
  const raiz = mkdtempSync(join(tmpdir(), 'env-file-'));
  const ruta = join(raiz, '.env');
  if (contenido) writeFileSync(ruta, contenido, 'utf8');
  return { raiz, ruta };
}

test('archivo inexistente: leerParametrosEditables devuelve todos los defaults', () => {
  const { raiz, ruta } = envTmp();
  try {
    const p = leerParametrosEditables(ruta);
    assert.equal(p.FICHADAS_HOST, '');
    assert.equal(p.FICHADAS_PORT, 5005);
    assert.equal(p.FICHADAS_TIMEOUT_MS, 5000);
    assert.equal(p.FICHADAS_TICK_INTERVAL_MS, 300000);
    assert.equal(p.FICHADAS_STATUS_INTERVAL_MS, 60000);
    assert.equal(p.FICHADAS_ENTRADA_HORA, '07:00');
    assert.equal(p.FICHADAS_ENTRADA_DURACION, 30);
    assert.equal(p.FICHADAS_FULL_HANDSHAKE, false);
    assert.equal(p.FICHADAS_CONTROL_PORT, null);
    assert.equal(p.PRESENTISMO_RESUMEN_PERIODO, 'MENSUAL');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('lee valores presentes y preserva comentarios/claves ajenas al escribir', () => {
  const { raiz, ruta } = envTmp(
    [
      '# comentario explicativo',
      'RRHH_ORACLE_USER=alguien',
      'FICHADAS_HOST=10.0.0.5',
      'FICHADAS_PORT=5005',
      '',
    ].join('\n'),
  );
  try {
    const p = leerParametrosEditables(ruta);
    assert.equal(p.FICHADAS_HOST, '10.0.0.5');
    assert.equal(p.FICHADAS_PORT, 5005);

    escribirParametrosEditables(ruta, { FICHADAS_HOST: '10.0.0.9', FICHADAS_PORT: 6000 });

    const salida = readFileSync(ruta, 'utf8');
    assert.match(salida, /# comentario explicativo/);
    assert.match(salida, /RRHH_ORACLE_USER=alguien/);
    assert.match(salida, /FICHADAS_HOST=10\.0\.0\.9/);
    assert.match(salida, /FICHADAS_PORT=6000/);
    assert.doesNotMatch(salida, /FICHADAS_HOST=10\.0\.0\.5/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('agrega una clave ausente al final del archivo', () => {
  const { raiz, ruta } = envTmp('FICHADAS_HOST=10.0.0.5\n');
  try {
    escribirParametrosEditables(ruta, { FICHADAS_PORT: 5006 });
    const p = leerParametrosEditables(ruta);
    assert.equal(p.FICHADAS_PORT, 5006);
    assert.equal(p.FICHADAS_HOST, '10.0.0.5');
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_HOST vacío se rechaza y no persiste ningún campo del cambio', () => {
  const { raiz, ruta } = envTmp('FICHADAS_HOST=10.0.0.5\nFICHADAS_PORT=5005\n');
  try {
    assert.throws(
      () => escribirParametrosEditables(ruta, { FICHADAS_HOST: '  ', FICHADAS_PORT: 6000 }),
      /FICHADAS_HOST/,
    );
    const p = leerParametrosEditables(ruta);
    assert.equal(p.FICHADAS_HOST, '10.0.0.5', 'rechazo atómico: FICHADAS_PORT tampoco se persistió');
    assert.equal(p.FICHADAS_PORT, 5005);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_PORT fuera de rango (1-65535) se rechaza', () => {
  const { raiz, ruta } = envTmp();
  try {
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_PORT: 0 }), /FICHADAS_PORT/);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_PORT: 70000 }), /FICHADAS_PORT/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_CONTROL_PORT es opcional: null lo deja deshabilitado', () => {
  const { raiz, ruta } = envTmp();
  try {
    escribirParametrosEditables(ruta, { FICHADAS_CONTROL_PORT: 5006 });
    assert.equal(leerParametrosEditables(ruta).FICHADAS_CONTROL_PORT, 5006);

    escribirParametrosEditables(ruta, { FICHADAS_CONTROL_PORT: null });
    assert.equal(leerParametrosEditables(ruta).FICHADAS_CONTROL_PORT, null);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('timeouts e intervalos deben ser enteros positivos', () => {
  const { raiz, ruta } = envTmp();
  try {
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_TIMEOUT_MS: 0 }), /FICHADAS_TIMEOUT_MS/);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_TICK_INTERVAL_MS: -1 }), /FICHADAS_TICK_INTERVAL_MS/);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_STATUS_INTERVAL_MS: 1.5 }), /FICHADAS_STATUS_INTERVAL_MS/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_ENTRADA_DURACION acepta 0 pero no negativos', () => {
  const { raiz, ruta } = envTmp();
  try {
    escribirParametrosEditables(ruta, { FICHADAS_ENTRADA_DURACION: 0 });
    assert.equal(leerParametrosEditables(ruta).FICHADAS_ENTRADA_DURACION, 0);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_ENTRADA_DURACION: -1 }), /FICHADAS_ENTRADA_DURACION/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_ENTRADA_HORA debe tener formato HH:MM válido', () => {
  const { raiz, ruta } = envTmp();
  try {
    escribirParametrosEditables(ruta, { FICHADAS_ENTRADA_HORA: '07:30' });
    assert.equal(leerParametrosEditables(ruta).FICHADAS_ENTRADA_HORA, '07:30');
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_ENTRADA_HORA: '25:00' }), /FICHADAS_ENTRADA_HORA/);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_ENTRADA_HORA: 'mediodia' }), /FICHADAS_ENTRADA_HORA/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('FICHADAS_FULL_HANDSHAKE debe ser booleano', () => {
  const { raiz, ruta } = envTmp();
  try {
    escribirParametrosEditables(ruta, { FICHADAS_FULL_HANDSHAKE: true });
    assert.equal(leerParametrosEditables(ruta).FICHADAS_FULL_HANDSHAKE, true);
    assert.throws(() => escribirParametrosEditables(ruta, { FICHADAS_FULL_HANDSHAKE: 'true' }), /FICHADAS_FULL_HANDSHAKE/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('PRESENTISMO_RESUMEN_PERIODO limitado a MENSUAL|QUINCENAL', () => {
  const { raiz, ruta } = envTmp();
  try {
    escribirParametrosEditables(ruta, { PRESENTISMO_RESUMEN_PERIODO: 'QUINCENAL' });
    assert.equal(leerParametrosEditables(ruta).PRESENTISMO_RESUMEN_PERIODO, 'QUINCENAL');
    assert.throws(
      () => escribirParametrosEditables(ruta, { PRESENTISMO_RESUMEN_PERIODO: 'SEMANAL' }),
      /PRESENTISMO_RESUMEN_PERIODO/,
    );
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('un fallo de acceso a disco (ruta inválida) propaga el error sin corromper nada', () => {
  // Simulación portable (sin depender de permisos, poco fiables en Windows):
  // la "ruta" del .env es en realidad un directorio, no un archivo — un modo
  // real de fallo de disco (config apuntando a una ubicación equivocada).
  const raiz = mkdtempSync(join(tmpdir(), 'env-file-'));
  const rutaDirectorio = join(raiz, '.env');
  mkdirSync(rutaDirectorio);
  try {
    assert.throws(() => escribirParametrosEditables(rutaDirectorio, { FICHADAS_PORT: 6000 }));
    // el "archivo" (en realidad el directorio) sigue intacto, sin restos de
    // escritura parcial (ni siquiera un .tmp-* huérfano).
    assert.equal(readdirSync(rutaDirectorio).length, 0);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('clave no gestionada se rechaza (no se puede editar RRHH_ORACLE_* desde acá)', () => {
  const { raiz, ruta } = envTmp();
  try {
    assert.throws(() => escribirParametrosEditables(ruta, { RRHH_ORACLE_PASSWORD: 'x' }), /no es un parámetro editable/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
