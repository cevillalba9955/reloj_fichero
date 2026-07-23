import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from './api/router.js';
import { registrarRutas } from './api/calendario-handlers.js';
import { registrarRutas as registrarRutasFichadasHoy } from './api/fichadas-hoy-handlers.js';
import { registrarRutas as registrarRutasResumenPeriodo } from './api/resumen-periodo-handlers.js';
import { registrarRutas as registrarRutasJustificaciones } from './api/justificaciones-handlers.js';
import { registrarRutas as registrarRutasConfiguracion } from './api/configuracion-handlers.js';
import { registrarRutas as registrarRutasVacaciones } from './api/vacaciones-handlers.js';
import { crearContextoWeb } from './wiring.js';

// feature 007 — Servidor web local (node:http, sin framework). Sirve la API en
// /api (envuelve el servicio de presentismo, Principio I) y los estáticos del
// build del frontend React. Operación local; no toca Oracle ni el reloj.

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Carpeta con el build de producción del frontend (`vite build` → frontend/dist).
const FRONTEND_DIST = join(__dirname, '..', '..', 'frontend', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

async function servirEstatico(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Evita traversal fuera de FRONTEND_DIST.
  const destino = normalize(join(FRONTEND_DIST, rel));
  if (!destino.startsWith(FRONTEND_DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  const objetivo = existsSync(destino) && extname(destino) ? destino : join(FRONTEND_DIST, 'index.html');
  try {
    const contenido = await readFile(objetivo);
    res.writeHead(200, { 'Content-Type': MIME[extname(objetivo)] ?? 'application/octet-stream' });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('El frontend no está compilado. Ejecutá `cd frontend && npm run build`.');
  }
}

// Crea la app (router + estáticos) sin escuchar todavía: útil para tests.
export function crearApp({ env = process.env } = {}) {
  const ctx = crearContextoWeb(env);
  const router = createRouter();
  registrarRutas(router, ctx);
  registrarRutasFichadasHoy(router, ctx);
  registrarRutasResumenPeriodo(router, ctx);
  registrarRutasJustificaciones(router, ctx);
  registrarRutasConfiguracion(router, ctx);
  registrarRutasVacaciones(router, ctx);

  return async function handler(req, res) {
    const manejadaPorApi = await router.handle(req, res);
    if (!manejadaPorApi) await servirEstatico(req, res);
  };
}

export function iniciarServidor({ env = process.env, port = Number(env.PRESENTISMO_WEB_PORT ?? 4173) } = {}) {
  const app = crearApp({ env });
  const server = createServer((req, res) => {
    app(req, res).catch((err) => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { codigo: 'ERROR_INTERNO', mensaje: err.message } }));
    });
  });
  server.listen(port, () => {
    console.log(`Presentismo Web escuchando en http://localhost:${port} (API en /api)`);
  });
  return server;
}

// Arranque directo (`node src/web/server.js` / `npm run web`).
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  iniciarServidor();
}
