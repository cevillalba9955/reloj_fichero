import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rutaCarpetaPeriodo, ARCHIVO_PADRON } from '../domain/periodo-storage.js';
import { mesActualPeriodo } from '../domain/calendario-mes.js';

// Snapshot local del padrón (legajo + categoría) para operar SIN conexión a
// Oracle (Principio VI: estado operativo en archivo JSON; el padrón es dato de
// RRHH de solo lectura —Principio II— del que acá guardamos una copia por
// conveniencia). Mismo contrato EmployeeCategoryProvider que el adaptador
// Oracle: obtenerCategoria(legajo) + listar(). El snapshot se produce con
// `sincronizar-padron` (único momento que consulta Oracle).
//
// 013-reestructurar-data-periodos (research.md §5, FR-004): el padrón es por
// período (`P<periodo>/padron.json`), pero como este puerto no recibe el
// período que se está calculando, cada llamada resuelve el snapshot del MES EN
// CURSO (`mesActualPeriodo(now())`), evaluado en cada invocación (nunca
// cacheado a nivel de proceso: un backend web es de larga vida y puede seguir
// corriendo cuando el mes cambia).
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

export function createFilePadronCategoryProvider({ repoDir, now = () => new Date() }) {
  const cachePorPeriodo = new Map(); // periodo -> Map<legajo, {codigoCategoria, nombre}>

  function asegurarCache(periodo) {
    if (cachePorPeriodo.has(periodo)) return cachePorPeriodo.get(periodo);
    const filePath = join(rutaCarpetaPeriodo(repoDir, periodo), ARCHIVO_PADRON);
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
    const mapa = construirMapa(datos.empleados);
    cachePorPeriodo.set(periodo, mapa);
    return mapa;
  }

  // Resuelve el mes en curso en CADA llamada (FR-004): nunca cachea el
  // período a nivel de proceso, solo el contenido ya leído de cada período.
  function cacheDelMesActual() {
    return asegurarCache(mesActualPeriodo(now()));
  }

  return {
    async obtenerCategoria(legajo) {
      const mapa = cacheDelMesActual();
      return { legajo, codigoCategoria: mapa.get(Number(legajo))?.codigoCategoria ?? null };
    },
    async listar() {
      const mapa = cacheDelMesActual();
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
