import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { parseHoraMinuto, formatHoraMinuto } from '../domain/tiempo.js';

// Configuración de categorías/modalidades de este sistema
// (contracts/categorias-config.schema.md, research §5). Validación fail-fast:
// una config a medio definir NUNCA debe habilitar cálculos (mismo criterio que
// oracle-roster-config de la feature 003).

// domingo=0 .. sabado=6 (índice de Date.getUTCDay), para casar con calendario-mes.
const DIAS_SEMANA = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

// feature 014 — forma canónica (sin tilde) para serializar de vuelta a JSON
// el Set de números 0..6 que produce parseEsquemaSemanal.
const NUMERO_A_DIA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const ESQUEMA_DEFAULT = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
const TIPOS_MODALIDAD = new Set(['Mensual', 'Quincenal']);

function fail(msg) {
  throw new Error(`categorias-config: ${msg}`);
}

function parseVentana(valor, nombre) {
  if (!Array.isArray(valor) || valor.length !== 2) {
    fail(`${nombre} debe ser un par ["HH:MM","HH:MM"]`);
  }
  const ini = parseHoraMinuto(valor[0]);
  const fin = parseHoraMinuto(valor[1]);
  if (ini > fin) fail(`${nombre} tiene inicio posterior al fin`);
  return [ini, fin];
}

function parseEsquemaSemanal(esquema) {
  const lista = esquema ?? ESQUEMA_DEFAULT;
  if (!Array.isArray(lista) || lista.length === 0) {
    fail('esquemaSemanal debe ser una lista no vacía de días');
  }
  const dias = new Set();
  for (const nombre of lista) {
    const key = String(nombre).trim().toLowerCase();
    if (!(key in DIAS_SEMANA)) fail(`día de semana desconocido "${nombre}"`);
    dias.add(DIAS_SEMANA[key]);
  }
  return dias;
}

function parseModalidad(nombre, m) {
  if (!m || typeof m !== 'object') fail(`modalidad "${nombre}" inválida`);
  if (!TIPOS_MODALIDAD.has(m.tipo)) {
    fail(`modalidad "${nombre}": tipo debe ser Mensual o Quincenal`);
  }
  const aperturaOficial = parseHoraMinuto(m.aperturaOficial);
  const cierreOficial = parseHoraMinuto(m.cierreOficial);
  if (aperturaOficial >= cierreOficial) {
    fail(`modalidad "${nombre}": aperturaOficial debe ser anterior a cierreOficial`);
  }
  const margenApertura = Number(m.margenAperturaMin);
  const margenCierre = Number(m.margenCierreMin);
  if (!Number.isInteger(margenApertura) || margenApertura < 0) {
    fail(`modalidad "${nombre}": margenAperturaMin debe ser entero ≥ 0`);
  }
  if (!Number.isInteger(margenCierre) || margenCierre < 0) {
    fail(`modalidad "${nombre}": margenCierreMin debe ser entero ≥ 0`);
  }
  return {
    tipo: m.tipo,
    aperturaOficial,
    cierreOficial,
    margenApertura,
    margenCierre,
    ventanaApertura: parseVentana(m.ventanaApertura, `modalidad "${nombre}".ventanaApertura`),
    ventanaCierre: parseVentana(m.ventanaCierre, `modalidad "${nombre}".ventanaCierre`),
    // Derivado (FR-011): la jornada esperada NO se configura por separado.
    jornadaEsperada: cierreOficial - aperturaOficial,
  };
}

// Parsea y valida un objeto de configuración ya deserializado.
export function parseCategoriasConfig(raw) {
  if (!raw || typeof raw !== 'object') fail('la configuración raíz debe ser un objeto');

  const esquemaSemanal = parseEsquemaSemanal(raw.esquemaSemanal);

  if (!raw.modalidades || typeof raw.modalidades !== 'object') {
    fail('falta el objeto "modalidades"');
  }
  const modalidades = new Map();
  for (const [nombre, m] of Object.entries(raw.modalidades)) {
    modalidades.set(nombre, parseModalidad(nombre, m));
  }
  if (modalidades.size === 0) fail('debe haber al menos una modalidad');

  if (!raw.categorias || typeof raw.categorias !== 'object') {
    fail('falta el objeto "categorias"');
  }
  const categorias = new Map();
  for (const [codigo, c] of Object.entries(raw.categorias)) {
    const modalidadRef = c?.modalidad;
    if (!modalidades.has(modalidadRef)) {
      fail(`categoría "${codigo}" referencia una modalidad inexistente "${modalidadRef}"`);
    }
    categorias.set(codigo, { codigo, modalidad: modalidadRef });
  }
  if (categorias.size === 0) fail('debe haber al menos una categoría');

  // Resuelve la modalidad (con sus params) de un código de categoría del padrón.
  // Devuelve null si la categoría no está configurada (anomalía por empleado,
  // FR-035), sin lanzar.
  function resolverModalidadPorCategoria(codigoCategoria) {
    const cat = categorias.get(codigoCategoria);
    if (!cat) return null;
    return modalidades.get(cat.modalidad);
  }

  return {
    esquemaSemanal,
    modalidades,
    categorias,
    resolverModalidadPorCategoria,
  };
}

// feature 014 (US3, contracts/web-api-configuracion.md) — Serialización y
// edición. Las funciones de edición operan sobre una config ya parseada y
// devuelven una NUEVA config, re-validada con `parseCategoriasConfig` (mismo
// criterio fail-fast que la carga), para garantizar que nunca se persiste un
// estado inválido.

export function serializarCategoriasConfig(config) {
  const modalidades = {};
  for (const [nombre, m] of config.modalidades) {
    modalidades[nombre] = {
      tipo: m.tipo,
      aperturaOficial: formatHoraMinuto(m.aperturaOficial),
      cierreOficial: formatHoraMinuto(m.cierreOficial),
      margenAperturaMin: m.margenApertura,
      margenCierreMin: m.margenCierre,
      ventanaApertura: [formatHoraMinuto(m.ventanaApertura[0]), formatHoraMinuto(m.ventanaApertura[1])],
      ventanaCierre: [formatHoraMinuto(m.ventanaCierre[0]), formatHoraMinuto(m.ventanaCierre[1])],
    };
  }
  const categorias = {};
  for (const [codigo, c] of config.categorias) {
    categorias[codigo] = { modalidad: c.modalidad };
  }
  return {
    esquemaSemanal: [...config.esquemaSemanal].sort((a, b) => a - b).map((n) => NUMERO_A_DIA[n]),
    modalidades,
    categorias,
  };
}

// Alta de una modalidad horaria nueva. Rechaza un `nombre` ya existente.
export function agregarModalidad(config, nombre, datos) {
  if (config.modalidades.has(nombre)) fail(`ya existe una modalidad "${nombre}"`);
  const raw = serializarCategoriasConfig(config);
  raw.modalidades[nombre] = datos;
  return parseCategoriasConfig(raw);
}

// Edita los horarios de una modalidad existente (mismo `nombre`).
export function editarModalidad(config, nombre, datos) {
  if (!config.modalidades.has(nombre)) fail(`no existe una modalidad "${nombre}"`);
  const raw = serializarCategoriasConfig(config);
  raw.modalidades[nombre] = datos;
  return parseCategoriasConfig(raw);
}

// Elimina una modalidad SOLO si ninguna categoría la referencia (FR-012). Si
// está en uso, lanza con `err.categoriasEnUso` (códigos que la usan).
export function eliminarModalidad(config, nombre) {
  if (!config.modalidades.has(nombre)) fail(`no existe una modalidad "${nombre}"`);
  const enUso = [...config.categorias.values()].filter((c) => c.modalidad === nombre).map((c) => c.codigo);
  if (enUso.length > 0) {
    const err = new Error(`categorias-config: la modalidad "${nombre}" está en uso por: ${enUso.join(', ')}`);
    err.categoriasEnUso = enUso;
    throw err;
  }
  const raw = serializarCategoriasConfig(config);
  delete raw.modalidades[nombre];
  return parseCategoriasConfig(raw);
}

// Alta de una categoría nueva (código fijo, FR-012b). Rechaza un `codigo` ya
// existente o una `modalidad` inexistente.
export function agregarCategoria(config, codigo, modalidad) {
  if (config.categorias.has(codigo)) fail(`ya existe una categoría "${codigo}"`);
  if (!config.modalidades.has(modalidad)) fail(`la modalidad "${modalidad}" no existe`);
  const raw = serializarCategoriasConfig(config);
  raw.categorias[codigo] = { modalidad };
  return parseCategoriasConfig(raw);
}

// Edita SOLO la modalidad asignada de una categoría existente (el código de
// la URL es fijo, FR-012b; no hay eliminación de categorías, FR-012a).
export function editarCategoriaModalidad(config, codigo, modalidad) {
  if (!config.categorias.has(codigo)) fail(`no existe una categoría "${codigo}"`);
  if (!config.modalidades.has(modalidad)) fail(`la modalidad "${modalidad}" no existe`);
  const raw = serializarCategoriasConfig(config);
  raw.categorias[codigo] = { modalidad };
  return parseCategoriasConfig(raw);
}

// Edita el esquema semanal compartido (FR-013a): no vacío, sin días
// repetidos (parseEsquemaSemanal los colapsaría en silencio vía Set, así que
// el duplicado se detecta acá antes de re-parsear).
export function editarEsquemaSemanal(config, dias) {
  if (!Array.isArray(dias) || dias.length === 0) fail('esquemaSemanal no puede quedar vacío');
  const normalizados = dias.map((d) => String(d).trim().toLowerCase());
  if (new Set(normalizados).size !== normalizados.length) {
    fail('esquemaSemanal no puede tener días repetidos');
  }
  const raw = serializarCategoriasConfig(config);
  raw.esquemaSemanal = dias;
  return parseCategoriasConfig(raw);
}

// Escritura atómica (archivo temporal + rename, FR-015).
export function saveCategoriasConfig(path, config) {
  const contenido = `${JSON.stringify(serializarCategoriasConfig(config), null, 2)}\n`;
  const rutaTmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(rutaTmp, contenido, 'utf8');
  renameSync(rutaTmp, path);
}

// Carga desde archivo JSON (fail-fast ante ausencia / JSON inválido).
export function loadCategoriasConfig(path) {
  let contenido;
  try {
    contenido = readFileSync(path, 'utf8');
  } catch {
    fail(`no se pudo leer el archivo de configuración "${path}"`);
  }
  let raw;
  try {
    raw = JSON.parse(contenido);
  } catch {
    fail(`el archivo "${path}" no es JSON válido`);
  }
  return parseCategoriasConfig(raw);
}
