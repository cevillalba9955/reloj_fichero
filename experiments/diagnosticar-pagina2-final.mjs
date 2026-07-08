import { parseArgs } from 'node:util';
import {
  buildHandshakeCommand,
  buildPendingCountCommand,
  buildPendingDetailCommand,
  buildPendingDetailContinuationCommand,
} from '../src/protocol/commands.js';
import { connectSocket, closeSession } from '../src/protocol/client.js';
import { parseAckHeader } from '../src/protocol/framing.js';

const { values } = parseArgs({ options: { host: { type: 'string' }, port: { type: 'string', default: '5005' } } });
const host = values.host, port = Number(values.port);

function hex(b) { return b.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim(); }

async function main() {
  const socket = await connectSocket(host, port, 5000);
  const chunks = [];
  socket.on('data', (c) => chunks.push(c));

  socket.write(buildHandshakeCommand(1));
  await new Promise((r) => setTimeout(r, 300));
  chunks.length = 0;

  socket.write(buildPendingCountCommand(2));
  await new Promise((r) => setTimeout(r, 300));
  const ackCountBuf = Buffer.concat(chunks.splice(0, chunks.length));
  const declaredPendingCount = parseAckHeader(ackCountBuf).flagBytes.readUInt32LE(0);
  console.log('declaredPendingCount', declaredPendingCount);

  socket.write(buildPendingDetailCommand(3, declaredPendingCount, 51 * 20));
  await new Promise((r) => setTimeout(r, 1500));
  chunks.length = 0; // descartamos pagina 1, solo nos interesa pagina 2

  const remaining = declaredPendingCount - 51;
  const byteLenRequested = remaining * 20; // formato ACTUAL de produccion para la ultima pagina (sin +4)
  console.log(`pidiendo pagina2 byteLen=${byteLenRequested} (SIN +4)`);
  socket.write(buildPendingDetailContinuationCommand(4, 1, byteLenRequested));
  await new Promise((r) => setTimeout(r, 2000));
  const full = Buffer.concat(chunks.splice(0, chunks.length));
  console.log(`total recibido: ${full.length} bytes (ACK10+marker2+payload=${full.length - 12})`);
  console.log(hex(full));

  closeSession(socket, { log: () => {} });
}
main().catch((e) => { console.error(e.message); process.exit(1); });
