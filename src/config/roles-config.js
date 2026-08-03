import { readFileSync } from 'node:fs';

// feature 016 (contracts/web-api-acl.md, data-model.md) — Mapeo fijo
// rol-de-origen → rol interno (Lector/Editor/Configurador). A diferencia de
// categorias-config.js/motivos-ausencia-config.js, esta config NO es
// fail-fast: un config/roles.json ausente, mal formado, o con una entrada de
// "mapeo" inválida NUNCA debe impedir que el servidor arranque ni dejar sin
// acceso a nadie (Edge Case del spec) — degrada a `rolPorDefecto` (lector)
// para lo que no se pueda interpretar, y deja constancia en el log
// (Principio V). El costo de una entrada mal escrita es, como mucho, que esa
// identidad quede en modo lectura hasta corregirla.

const ROLES_VALIDOS = ['lector', 'editor', 'configurador'];
const ROL_POR_DEFECTO_INTERNO = 'lector';

function advertir(msg) {
  console.error(`roles-config: ${msg}`);
}

// Parsea y valida un objeto de configuración ya deserializado. Nunca lanza:
// cualquier parte inválida se ignora (con una advertencia) y cae al default.
export function parseRolesConfig(raw) {
  const objeto = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  let rolPorDefecto = ROL_POR_DEFECTO_INTERNO;
  if (objeto.rolPorDefecto !== undefined) {
    if (ROLES_VALIDOS.includes(objeto.rolPorDefecto)) {
      rolPorDefecto = objeto.rolPorDefecto;
    } else {
      advertir(`"rolPorDefecto" inválido ("${objeto.rolPorDefecto}"); se usa "${ROL_POR_DEFECTO_INTERNO}"`);
    }
  }

  const mapeoRaw =
    objeto.mapeo && typeof objeto.mapeo === 'object' && !Array.isArray(objeto.mapeo) ? objeto.mapeo : {};
  const mapeo = new Map();
  for (const [rolOrigen, rolInterno] of Object.entries(mapeoRaw)) {
    if (ROLES_VALIDOS.includes(rolInterno)) {
      mapeo.set(rolOrigen, rolInterno);
    } else {
      advertir(`entrada de "mapeo" ignorada: "${rolOrigen}" → "${rolInterno}" no es un rol válido`);
    }
  }

  return {
    rolPorDefecto,
    // Traduce un rol de origen (por ejemplo, el valor crudo de un header) al
    // rol interno correspondiente. `rolOrigen` ausente/vacío/no mapeado cae a
    // `rolPorDefecto` (FR-004).
    mapear(rolOrigen) {
      if (rolOrigen == null || rolOrigen === '') return rolPorDefecto;
      return mapeo.get(rolOrigen) ?? rolPorDefecto;
    },
  };
}

// Carga desde archivo JSON. Un archivo ausente o no parseable no es un error
// de arranque (a diferencia del resto de config/*.json): se trata como
// configuración vacía (todo resuelve a `rolPorDefecto`).
export function loadRolesConfig(path) {
  let contenido;
  try {
    contenido = readFileSync(path, 'utf8');
  } catch {
    return parseRolesConfig({});
  }
  try {
    return parseRolesConfig(JSON.parse(contenido));
  } catch {
    advertir(`"${path}" no es JSON válido; se usa la configuración por defecto`);
    return parseRolesConfig({});
  }
}
