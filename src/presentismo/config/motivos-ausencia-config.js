import { readFileSync } from 'node:fs';

// Configuración del catálogo de motivos de Justificación de Ausencias
// (contracts/motivos-ausencia-config.schema.md, spec 012 FR-004..FR-006).
// Validación fail-fast: un catálogo a medio definir NUNCA debe habilitar
// registrar Justificaciones (mismo criterio que categorias-config.js).

export const TipoPago = Object.freeze({ PAGA: 'Paga', NO_PAGA: 'No paga' });
const TIPOS_PAGO = new Set(Object.values(TipoPago));

function fail(msg) {
  throw new Error(`motivos-ausencia-config: ${msg}`);
}

// Parsea y valida un objeto de configuración ya deserializado.
export function parseMotivosAusenciaConfig(raw) {
  if (!raw || typeof raw !== 'object') fail('la configuración raíz debe ser un objeto');
  if (!Array.isArray(raw.motivos) || raw.motivos.length === 0) {
    fail('"motivos" debe ser un array no vacío');
  }

  const motivos = new Map();
  for (const m of raw.motivos) {
    if (!m || typeof m !== 'object') fail('cada motivo debe ser un objeto');
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (id === '') fail('cada motivo requiere un "id" no vacío');
    if (motivos.has(id)) fail(`id de motivo duplicado "${id}"`);
    const etiqueta = typeof m.etiqueta === 'string' ? m.etiqueta.trim() : '';
    if (etiqueta === '') fail(`motivo "${id}": "etiqueta" no puede estar vacía`);
    if (!TIPOS_PAGO.has(m.tipoPago)) {
      fail(`motivo "${id}": tipoPago debe ser "Paga" o "No paga"`);
    }
    const activo = m.activo ?? true;
    if (typeof activo !== 'boolean') fail(`motivo "${id}": "activo" debe ser boolean`);
    motivos.set(id, { id, etiqueta, tipoPago: m.tipoPago, activo });
  }

  const activos = [...motivos.values()].filter((m) => m.activo);
  if (activos.length === 0) fail('el catálogo debe tener al menos un motivo activo');

  return {
    motivos,
    // Lista de motivos activos en el orden del archivo (para la UI).
    listarActivos() {
      return [...motivos.values()].filter((m) => m.activo);
    },
    // Devuelve el motivo si existe Y está activo; null si no (motivo
    // desconocido o desactivado, ver edge case "motivo eliminado/desactivado").
    resolverMotivoActivo(id) {
      const m = motivos.get(id);
      return m?.activo ? m : null;
    },
  };
}

// Carga desde archivo JSON (fail-fast ante ausencia / JSON inválido).
export function loadMotivosAusenciaConfig(path) {
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
  return parseMotivosAusenciaConfig(raw);
}
