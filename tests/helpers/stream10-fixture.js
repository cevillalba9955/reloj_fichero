import { readFileSync } from 'node:fs';

// Carga el fixture de trafico real del software oficial (123 fichadas, 3
// paginas) derivado de research/fichada.pcapng. Ver
// tests/fixtures/fichada-3paginas/README.md.
export function loadStream10() {
  const url = new URL('../fixtures/fichada-3paginas/stream10.json', import.meta.url);
  const doc = JSON.parse(readFileSync(url, 'utf8'));
  const msgs = doc.messages.map((m) => ({ dir: m.dir, buf: Buffer.from(m.hex, 'hex') }));

  const a4Commands = [];
  let b4Ack = null;
  const a4Responses = [];

  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    if (m.dir !== 'client_to_device' || m.buf.length < 4) continue;
    const code = m.buf[3];
    const next = msgs[i + 1];
    if (code === 0xb4 && next && next.dir === 'device_to_client') {
      b4Ack = next.buf;
    } else if (code === 0xa4 && next && next.dir === 'device_to_client') {
      a4Commands.push(m.buf);
      a4Responses.push(next.buf);
    }
  }

  // Campos utiles del comando 0xA4: count (bytes 8-11 LE32) y byteLen (12-13 LE16).
  const a4Fields = a4Commands.map((cmd) => ({
    count: cmd.readUInt32LE(8),
    byteLen: cmd.readUInt16LE(12),
  }));

  return {
    declaredPendingCount: doc.declaredPendingCount,
    b4Ack,
    a4Responses, // [pagina1, pagina2, pagina3] tal cual las envio el equipo
    a4Commands,
    a4Fields, // [{count, byteLen}, ...] del software oficial
  };
}
