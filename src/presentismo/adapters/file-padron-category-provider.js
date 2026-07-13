import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Snapshot local del padrón (legajo + categoría) para operar SIN conexión a
// Oracle (Principio VI: estado operativo en archivo JSON; el padrón es dato de
// RRHH de solo lectura —Principio II— del que acá guardamos una copia por
// conveniencia). Mismo contrato EmployeeCategoryProvider que el adaptador
// Oracle: obtenerCategoria(legajo) + listar(). El snapshot se produce con
// `sincronizar-padron` (único momento que consulta Oracle).
//
// Formato del archivo:
//   { "generadoEn": "ISO-8601", "vista": "<traza>",
//     "empleados": [ { "legajo": N, "categoria": "PROD", "nombre": "Ada Lovelace" } ] }
// `nombre` es opcional (para la IU); nunca contiene credenciales ni datos
// biométricos (Principio V).

// Normaliza filas crudas a un Map legajo→{categoria, nombre} (dedup, descarte de
// legajos inválidos, vacíos→null): misma disciplina que el provider Oracle.
function construirMapa(empleados) {
  const mapa = new Map();
  for (const { legajo, categoria, nombre } of empleados) {
    const n = Number(legajo);
    if (!Number.isInteger(n)) continue;
    const codigo = categoria == null ? null : String(categoria).trim();
    const nom = nombre == null ? null : String(nombre).trim();
    mapa.set(n, {
      codigoCategoria: codigo && codigo.length > 0 ? codigo : null,
      nombre: nom && nom.length > 0 ? nom : null,
    });
  }
  return mapa;
}

export function createFilePadronCategoryProvider({ filePath }) {
  let cache = null;

  function asegurarCache() {
    if (cache) return cache;
    let contenido;
    try {
      contenido = readFileSync(filePath, 'utf8');
    } catch {
      throw new Error(
        `no se pudo leer el snapshot del padrón "${filePath}"; ` +
          'generalo con `sincronizar-padron` (o usá --padron oracle).'
      );
    }
    let datos;
    try {
      datos = JSON.parse(contenido);
    } catch {
      throw new Error(`el snapshot del padrón "${filePath}" no es JSON válido`);
    }
    if (!Array.isArray(datos?.empleados)) {
      throw new Error(
        `el snapshot del padrón "${filePath}" no tiene el formato esperado ` +
          '({ "empleados": [{ "legajo", "categoria" }] })'
      );
    }
    cache = construirMapa(datos.empleados);
    return cache;
  }

  return {
    async obtenerCategoria(legajo) {
      const mapa = asegurarCache();
      return { legajo, codigoCategoria: mapa.get(Number(legajo))?.codigoCategoria ?? null };
    },
    async listar() {
      const mapa = asegurarCache();
      return [...mapa.entries()]
        .map(([legajo, { codigoCategoria, nombre }]) => ({ legajo, codigoCategoria, nombre }))
        .sort((a, b) => a.legajo - b.legajo);
    },
  };
}

// Escribe un snapshot del padrón a disco (crea el directorio si falta).
// `empleados` es la lista normalizada [{ legajo, codigoCategoria, nombre? }] tal
// cual la devuelve un provider.listar(). `vista` es solo una traza de origen.
export function guardarSnapshotPadron({ filePath, empleados, vista = null }) {
  const datos = {
    generadoEn: new Date().toISOString(),
    vista,
    empleados: empleados.map(({ legajo, codigoCategoria, nombre }) => ({
      legajo,
      categoria: codigoCategoria,
      nombre: nombre ?? null,
    })),
  };
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(datos, null, 2) + '\n', 'utf8');
  return datos;
}
