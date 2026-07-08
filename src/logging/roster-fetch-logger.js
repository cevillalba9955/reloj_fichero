import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// data-model.md §4 (RosterFetchEvent) + FR-010: un registro NDJSON por
// intento de obtención o descarte del padrón. Mismo patrón defensivo que
// service-cycle-logger.js/session-logger.js (Constitución, Principio V): el
// log jamás expone credenciales ni el connect string completo, solo metadata
// de diagnóstico.
const VALID_EVENTOS = new Set([
  'padron_fresco',
  'padron_respaldo',
  'padron_vacio',
  'padron_error',
  'legajo_descartado',
]);

// Un connect string tiene la forma host:puerto/servicio. Si un `detail`
// parece contenerlo, es un bug de la capa que llama: se aborta antes de
// escribirlo (defensa en profundidad, SC-002).
const CONNECT_STRING_PATTERN = /[\w.-]+:\d+\/[\w.$#]+/;

function assertNoSecretLeak(detail) {
  if (typeof detail === 'string' && CONNECT_STRING_PATTERN.test(detail)) {
    throw new Error(
      'roster-fetch-logger: "detail" parece contener un connect string; ' +
      'el log del padrón solo admite metadata de diagnóstico sin credenciales ' +
      '(Principio V de la constitución).'
    );
  }
}

export function createRosterFetchLogger({ serviceId, logDir, now = () => new Date() }) {
  mkdirSync(logDir, { recursive: true });
  const logFilePath = join(logDir, `roster-${serviceId}.ndjson`);

  function logEvento({ evento, cantidadLegajos = null, duracionMs = null, obtenidoEn = null, detail = null }) {
    if (!VALID_EVENTOS.has(evento)) {
      throw new Error(`roster-fetch-logger: evento inválido "${evento}"`);
    }
    assertNoSecretLeak(detail);
    const entry = {
      ts: now().toISOString(),
      serviceId,
      evento,
      cantidadLegajos,
      duracionMs,
      obtenidoEn,
      detail,
    };
    appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  return { logFilePath, logEvento };
}
