import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const VALID_EVENTS = new Set([
  'command_sent',
  'response_received',
  'keepalive_discarded',
  'session_closed',
  'error',
]);

// Constitucion, Principio V: los logs nunca exponen datos biometricos
// crudos ni el rawHex completo de una fichada. Heuristica defensiva: si
// alguien pasa por error una cadena hex larga como "detail", se rechaza en
// vez de escribirla.
const RAW_HEX_PATTERN = /^[0-9A-Fa-f\s]{20,}$/;

function assertNoRawHexLeak(detail) {
  if (typeof detail === 'string' && RAW_HEX_PATTERN.test(detail)) {
    throw new Error(
      'session-logger: "detail" parece contener bytes crudos de protocolo; ' +
      'el log de sesion solo admite metadata de diagnostico (Principio V de la constitucion).'
    );
  }
}

export function createSessionLogger({ sessionId, logDir, now = () => new Date() }) {
  mkdirSync(logDir, { recursive: true });
  const logFilePath = join(logDir, `session-${sessionId}.ndjson`);

  function log(event, { commandCode = null, byteLength = null, detail = null } = {}) {
    if (!VALID_EVENTS.has(event)) {
      throw new Error(`session-logger: evento invalido "${event}"`);
    }
    assertNoRawHexLeak(detail);
    const entry = {
      timestamp: now().toISOString(),
      sessionId,
      event,
      commandCode,
      byteLength,
      detail,
    };
    appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  return { logFilePath, log };
}
