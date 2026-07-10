import { readFileSync } from 'node:fs';
import { parseHoraMinuto } from '../domain/tiempo.js';

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
