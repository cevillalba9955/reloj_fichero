import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// Logger NDJSON estructurado del dominio de presentismo (FR-025, Principio V).
// Reutiliza el patrón de src/logging/service-cycle-logger.js. NUNCA serializa
// datos biométricos ni credenciales: solo metadata correlacionable por
// periodo/legajo/día.

const TIPOS = new Set([
  'calendario_generado',
  'dia_reclasificado',
  'jornada_calculada',
  'periodo_calculado',
  'fichadas_importadas',
  'correccion_alta',
  'correccion_reversion',
  'pausa_alta',
  'pausa_reversion',
  'anomalia',
  'justificacion_alta',
  'justificacion_reversion',
]);

// Campos que jamás deben aparecer en un evento (defensa en profundidad).
const CAMPOS_PROHIBIDOS = new Set([
  'password',
  'connectString',
  'rawHex',
  'template',
  'huella',
]);

function assertSinDatosSensibles(datos) {
  for (const clave of Object.keys(datos ?? {})) {
    if (CAMPOS_PROHIBIDOS.has(clave)) {
      throw new Error(
        `presentismo-logger: el evento incluye el campo prohibido "${clave}" ` +
          '(Principio V: no se loguean datos biométricos ni credenciales).'
      );
    }
  }
}

export function createPresentismoLogger({ logDir, now = () => new Date() }) {
  mkdirSync(logDir, { recursive: true });
  const logFilePath = join(logDir, 'presentismo.ndjson');

  function evento(tipo, datos = {}) {
    if (!TIPOS.has(tipo)) {
      throw new Error(`presentismo-logger: tipo de evento inválido "${tipo}"`);
    }
    assertSinDatosSensibles(datos);
    const entry = { timestamp: now().toISOString(), tipo, ...datos };
    appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  return { logFilePath, evento };
}

// Logger nulo para tests/uso sin efectos de E/S.
export function createNullLogger() {
  return { logFilePath: null, evento: () => null };
}

export { TIPOS };
