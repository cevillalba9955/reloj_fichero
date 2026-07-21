import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { rutaCarpetaPeriodo, ARCHIVO_FICHADAS } from '../domain/periodo-storage.js';

// Archivo acumulativo de fichadas por período (trazabilidad, FR — registro de
// fichadas obtenidas). A DIFERENCIA del presentismo.ndjson (que nunca lleva
// datos crudos, Principio V), este archivo es el registro técnico y SÍ guarda
// el rawHex de cada fichada —el frame de 20 bytes del protocolo (legajo, fecha,
// hora, método), no un template biométrico ni una imagen— igual que ya hace el
// exportador de sesiones de la feature 001/002. Deduplica por rawHex (identidad
// cruda, FR-017 de la feature 002).
//
// 013-reestructurar-data-periodos: una carpeta por período bajo `repoDir`
// (contracts/storage-layout.md): <repoDir>/P<periodo>/fichadas.json
//   { "periodo": "YYYYMM", "actualizadoEn": "ISO",
//     "fichadas": [ { "legajo", "fecha", "hora", "metodo", "rawHex" } ] }

function rutaPeriodo(repoDir, periodo) {
  return join(rutaCarpetaPeriodo(repoDir, periodo), ARCHIVO_FICHADAS);
}

// Campos que se conservan de cada fichada cruda (los del export de sesión).
function normalizarFichadaCruda(f) {
  return {
    legajo: f.legajo ?? null,
    fecha: f.fecha ?? null,
    hora: f.hora ?? null,
    metodo: f.metodo ?? null,
    rawHex: f.rawHex ?? null,
  };
}

// Lee el archivo acumulativo del período. Si no existe, devuelve [].
export function cargarFichadasArchivadas({ repoDir, periodo }) {
  let contenido;
  try {
    contenido = readFileSync(rutaPeriodo(repoDir, periodo), 'utf8');
  } catch {
    return [];
  }
  let datos;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new Error(`archivo de fichadas "${rutaPeriodo(repoDir, periodo)}" no es JSON válido`);
  }
  return Array.isArray(datos?.fichadas) ? datos.fichadas : [];
}

// Registra (upsert) las fichadas obtenidas en el archivo del período,
// deduplicando por rawHex contra lo ya guardado. Devuelve el conteo.
export function registrarFichadas({ repoDir, periodo, fichadas, now = () => new Date() }) {
  const existentes = cargarFichadasArchivadas({ repoDir, periodo });
  const vistos = new Set();
  const acumulado = [];
  for (const f of existentes) {
    const raw = f.rawHex ?? null;
    if (raw != null) {
      if (vistos.has(raw)) continue;
      vistos.add(raw);
    }
    acumulado.push(f);
  }

  let agregadas = 0;
  let duplicadas = 0;
  for (const cruda of fichadas) {
    const f = normalizarFichadaCruda(cruda);
    if (f.rawHex != null) {
      if (vistos.has(f.rawHex)) {
        duplicadas += 1;
        continue;
      }
      vistos.add(f.rawHex);
    }
    acumulado.push(f);
    agregadas += 1;
  }

  // Sin altas: el contenido no cambia. No se reescribe (evita churn en los ciclos
  // del servicio que solo ven fichadas ya vistas — el reloj re-reporta pendientes).
  if (agregadas === 0) {
    return { agregadas: 0, duplicadas, total: acumulado.length };
  }

  // Orden estable por fecha/hora/legajo para diffs legibles.
  acumulado.sort((a, b) => {
    const ka = `${a.fecha ?? ''} ${a.hora ?? ''} ${a.legajo ?? ''}`;
    const kb = `${b.fecha ?? ''} ${b.hora ?? ''} ${b.legajo ?? ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  const datos = { periodo, actualizadoEn: now().toISOString(), fichadas: acumulado };
  mkdirSync(rutaCarpetaPeriodo(repoDir, periodo), { recursive: true });
  // Escritura atómica (temp + rename): un lector concurrente (`calcular`) nunca ve
  // un archivo truncado ni a medio escribir. El rename es atómico en el mismo FS.
  const final = rutaPeriodo(repoDir, periodo);
  const tmp = `${final}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(datos, null, 2) + '\n', 'utf8');
  renameSync(tmp, final);
  return { agregadas, duplicadas, total: acumulado.length };
}

// Lee todos los exports de sesión `fichadas-*.json` de un directorio (feature
// 001/002) y devuelve sus registros crudos aplanados. Ignora archivos ilegibles
// dejando constancia en `errores` (no aborta: importar es best-effort).
export function leerExportsDeSesion({ inputDir }) {
  let nombres;
  try {
    nombres = readdirSync(inputDir).filter((n) => /^fichadas-.*\.json$/.test(n));
  } catch {
    throw new Error(`no se pudo leer el directorio de fichadas "${inputDir}"`);
  }
  const registros = [];
  const errores = [];
  for (const nombre of nombres) {
    try {
      const doc = JSON.parse(readFileSync(join(inputDir, nombre), 'utf8'));
      if (Array.isArray(doc?.records)) registros.push(...doc.records);
    } catch {
      errores.push(nombre);
    }
  }
  return { registros, archivos: nombres.length, errores };
}
