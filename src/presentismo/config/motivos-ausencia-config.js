import { readFileSync, writeFileSync, renameSync } from 'node:fs';

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

  // feature 014 (research.md §3): a diferencia de la validación original de
  // spec 012, un catálogo sin ningún motivo activo YA NO es un error de
  // arranque — es una decisión de negocio válida (spec 014, Edge Cases): la
  // página de Configuración permite desactivar el último motivo activo. El
  // selector de Justificación de Ausencias simplemente queda vacío hasta que
  // se reactive o cree uno.

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

// feature 014 (US2, contracts/web-api-configuracion.md) — Serialización y
// edición del catálogo. Las funciones de edición operan sobre una config ya
// parseada y devuelven una NUEVA config, re-validada con
// `parseMotivosAusenciaConfig` (mismo criterio fail-fast que la carga), para
// garantizar que nunca se persiste un catálogo inválido.

export function serializarMotivosAusenciaConfig(config) {
  return { motivos: [...config.motivos.values()] };
}

// Alta de un motivo nuevo (FR-008). Rechaza un `id` ya existente (FR-010).
export function agregarMotivo(config, { id, etiqueta, tipoPago, activo = true }) {
  if (config.motivos.has(id)) fail(`ya existe un motivo con id "${id}"`);
  const raw = serializarMotivosAusenciaConfig(config);
  raw.motivos.push({ id, etiqueta, tipoPago, activo });
  return parseMotivosAusenciaConfig(raw);
}

// Edita etiqueta/tipoPago/activo de un motivo existente (FR-008, FR-009). El
// `id` es inmutable: no forma parte de `cambios` (Clarifications del spec).
export function editarMotivo(config, id, cambios) {
  if (!config.motivos.has(id)) fail(`no existe un motivo con id "${id}"`);
  const raw = serializarMotivosAusenciaConfig(config);
  const idx = raw.motivos.findIndex((m) => m.id === id);
  raw.motivos[idx] = { ...raw.motivos[idx], ...cambios, id };
  return parseMotivosAusenciaConfig(raw);
}

// Escritura atómica (archivo temporal + rename, FR-015): nunca deja el
// archivo a medio escribir ante un fallo de disco.
export function saveMotivosAusenciaConfig(path, config) {
  const contenido = `${JSON.stringify(serializarMotivosAusenciaConfig(config), null, 2)}\n`;
  const rutaTmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(rutaTmp, contenido, 'utf8');
  renameSync(rutaTmp, path);
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
