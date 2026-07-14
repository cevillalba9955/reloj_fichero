import { createServer } from 'node:net';

// Servidor TCP de loopback que emula al reloj: por cada comando de 16 bytes
// que recibe (todos los comandos del protocolo miden 16 bytes) responde con
// el siguiente buffer del guion y registra el comando recibido, para poder
// afirmar despues sobre los bytes que el driver envio. Reproduce respuestas
// reales capturadas (research/fichada.pcapng) sin depender de la red ni de tshark.
export function startDeviceReplay(responses) {
  const received = [];
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      let buf = Buffer.alloc(0);
      let i = 0;
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 16 && i < responses.length) {
          received.push(Buffer.from(buf.subarray(0, 16)));
          buf = buf.subarray(16);
          socket.write(responses[i]);
          i += 1;
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port }));
  });
}
