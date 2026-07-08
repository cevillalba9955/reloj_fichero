import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const VALID_RESULTADOS = new Set(['success', 'error', 'omitido']);

// Constitucion, Principio V: mismo criterio defensivo que session-logger.js
// de 001-consulta-fichadas-rs596 — el log de ciclo nunca expone bytes
// crudos de protocolo ni credenciales, solo metadata de diagnostico.
const RAW_HEX_PATTERN = /^[0-9A-Fa-f\s]{20,}$/;

function assertNoRawHexLeak(detail) {
  if (typeof detail === 'string' && RAW_HEX_PATTERN.test(detail)) {
    throw new Error(
      'service-cycle-logger: "detail" parece contener bytes crudos de protocolo; ' +
      'el log de ciclo solo admite metadata de diagnostico (Principio V de la constitucion).'
    );
  }
}

// FR-015: registro estructurado NDJSON de cada ciclo del scheduler
// (resultado success/error/omitido, cantidad de fichadas nuevas -ya
// deduplicadas-, duracion), separado del log de sesion RS596 por ciclo
// (session-logger.js de feature 001).
export function createServiceCycleLogger({ serviceId, logDir, now = () => new Date() }) {
  mkdirSync(logDir, { recursive: true });
  const logFilePath = join(logDir, `service-${serviceId}.ndjson`);

  function logCiclo({ resultado, fichadasNuevas = 0, duracionMs = 0, detail = null }) {
    if (!VALID_RESULTADOS.has(resultado)) {
      throw new Error(`service-cycle-logger: resultado invalido "${resultado}"`);
    }
    assertNoRawHexLeak(detail);
    const ejecutadoEn = now().toISOString();
    const entry = {
      timestamp: ejecutadoEn,
      serviceId,
      resultado,
      fichadasNuevas,
      duracionMs,
      detail,
    };
    appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
    // Forma normalizada de data-model.md §5 (ultimoCiclo), lista para
    // exponerse tal cual en getState().
    return { ejecutadoEn, resultado, fichadasNuevas, duracionMs };
  }

  return { logFilePath, logCiclo };
}
