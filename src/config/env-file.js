import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { parseHoraMinuto } from '../presentismo/domain/tiempo.js';

// feature 014 (contracts/env-config.schema.md) — Lectura/escritura de los
// parámetros de `.env` editables desde la página de Configuración. Preserva
// comentarios y cualquier otra clave del archivo (RRHH_ORACLE_*, rutas de
// archivos/directorios — fuera de alcance, FR-014), y solo gestiona las
// claves de `CAMPOS`. Escritura atómica (archivo temporal + rename) para no
// dejar el `.env` a medio escribir ante un fallo de disco (FR-015).

function fail(campo, msg) {
  const err = new Error(`env-file: "${campo}": ${msg}`);
  err.campo = campo;
  throw err;
}

function validarEntero(campo, valor, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n)) fail(campo, `debe ser un entero (recibido "${valor}")`);
  if (n < min || n > max) fail(campo, `debe estar entre ${min} y ${max} (recibido ${n})`);
}

function parseBooleano(valor) {
  return valor === true || valor === 'true' || valor === '1';
}

const RESUMEN_PERIODO_VALORES = new Set(['MENSUAL', 'QUINCENAL']);

// Cada campo: `default` (valor si la clave falta en el archivo), `parsear`
// (string crudo del archivo → valor tipado) y `validar` (valor tipado
// recibido de la UI → lanza si es inválido; nunca se llega a escribir si
// alguna validación falla, FR-004).
const CAMPOS = {
  FICHADAS_HOST: {
    default: '',
    parsear: (raw) => raw ?? '',
    validar: (v) => {
      if (typeof v !== 'string' || v.trim() === '') fail('FICHADAS_HOST', 'no puede estar vacío');
    },
  },
  FICHADAS_PORT: {
    default: 5005,
    parsear: (raw) => (raw !== undefined ? Number(raw) : 5005),
    validar: (v) => validarEntero('FICHADAS_PORT', v, { min: 1, max: 65535 }),
  },
  FICHADAS_TIMEOUT_MS: {
    default: 5000,
    parsear: (raw) => (raw !== undefined ? Number(raw) : 5000),
    validar: (v) => validarEntero('FICHADAS_TIMEOUT_MS', v, { min: 1 }),
  },
  FICHADAS_TICK_INTERVAL_MS: {
    default: 5 * 60 * 1000,
    parsear: (raw) => (raw !== undefined ? Number(raw) : 5 * 60 * 1000),
    validar: (v) => validarEntero('FICHADAS_TICK_INTERVAL_MS', v, { min: 1 }),
  },
  FICHADAS_STATUS_INTERVAL_MS: {
    default: 60 * 1000,
    parsear: (raw) => (raw !== undefined ? Number(raw) : 60 * 1000),
    validar: (v) => validarEntero('FICHADAS_STATUS_INTERVAL_MS', v, { min: 1 }),
  },
  FICHADAS_ENTRADA_HORA: {
    default: '07:00',
    parsear: (raw) => raw ?? '07:00',
    validar: (v) => {
      try {
        parseHoraMinuto(v);
      } catch {
        fail('FICHADAS_ENTRADA_HORA', `formato inválido "${v}" (se espera HH:MM)`);
      }
    },
  },
  FICHADAS_ENTRADA_DURACION: {
    default: 30,
    parsear: (raw) => (raw !== undefined ? Number(raw) : 30),
    validar: (v) => validarEntero('FICHADAS_ENTRADA_DURACION', v, { min: 0 }),
  },
  FICHADAS_FULL_HANDSHAKE: {
    default: false,
    parsear: (raw) => parseBooleano(raw ?? false),
    validar: (v) => {
      if (typeof v !== 'boolean') fail('FICHADAS_FULL_HANDSHAKE', 'debe ser booleano');
    },
  },
  FICHADAS_CONTROL_PORT: {
    default: null,
    parsear: (raw) => (raw !== undefined && raw !== '' ? Number(raw) : null),
    validar: (v) => {
      if (v === null || v === undefined) return;
      validarEntero('FICHADAS_CONTROL_PORT', v, { min: 1, max: 65535 });
    },
  },
  PRESENTISMO_RESUMEN_PERIODO: {
    default: 'MENSUAL',
    parsear: (raw) => (raw ? raw.toUpperCase() : 'MENSUAL'),
    validar: (v) => {
      if (!RESUMEN_PERIODO_VALORES.has(v)) {
        fail('PRESENTISMO_RESUMEN_PERIODO', `debe ser MENSUAL o QUINCENAL (recibido "${v}")`);
      }
    },
  },
};

function formatearValor(campo, valor) {
  if (campo === 'FICHADAS_FULL_HANDSHAKE') return valor ? 'true' : 'false';
  if (campo === 'FICHADAS_CONTROL_PORT' && (valor === null || valor === undefined)) return '';
  return String(valor);
}

// Mapa clave → { indice, valorCrudo } de la última línea activa (no
// comentada) `CLAVE=valor` de cada clave (si el archivo repite una clave,
// Node se queda con la última al cargar `--env-file-if-exists`).
function leerClavesActivas(lineas) {
  const claves = new Map();
  lineas.forEach((linea, indice) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linea);
    if (!m) return;
    claves.set(m[1], { indice, valorCrudo: m[2] });
  });
  return claves;
}

// Lee del `.env` los valores actuales de todas las claves gestionadas, con
// sus defaults si faltan. Archivo inexistente = todos los defaults.
export function leerParametrosEditables(rutaEnv) {
  const contenido = existsSync(rutaEnv) ? readFileSync(rutaEnv, 'utf8') : '';
  const claves = leerClavesActivas(contenido.split(/\r?\n/));
  const resultado = {};
  for (const [campo, def] of Object.entries(CAMPOS)) {
    resultado[campo] = def.parsear(claves.get(campo)?.valorCrudo);
  }
  return resultado;
}

// Valida y escribe `cambios` (subconjunto parcial de las claves gestionadas)
// en el `.env`, preservando el resto del archivo (comentarios, otras
// claves). Si algún campo de `cambios` es inválido, NO escribe nada (rechazo
// atómico) y lanza el error correspondiente (`err.campo` identifica cuál).
export function escribirParametrosEditables(rutaEnv, cambios) {
  for (const [campo, valor] of Object.entries(cambios)) {
    const def = CAMPOS[campo];
    if (!def) fail(campo, 'no es un parámetro editable desde la página de Configuración');
    def.validar(valor);
  }

  const contenido = existsSync(rutaEnv) ? readFileSync(rutaEnv, 'utf8') : '';
  const lineas = contenido === '' ? [] : contenido.split(/\r?\n/);
  const claves = leerClavesActivas(lineas);

  for (const [campo, valor] of Object.entries(cambios)) {
    const linea = `${campo}=${formatearValor(campo, valor)}`;
    const activa = claves.get(campo);
    if (activa) {
      lineas[activa.indice] = linea;
    } else {
      lineas.push(linea);
    }
  }

  const salida = lineas.length > 0 ? `${lineas.join('\n')}\n` : '';
  const rutaTmp = `${rutaEnv}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(rutaTmp, salida, 'utf8');
  renameSync(rutaTmp, rutaEnv);
}
