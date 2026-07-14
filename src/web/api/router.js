// feature 007 — Router HTTP mínimo sobre node:http (sin framework). Soporta
// rutas con parámetros (`:param`), parseo de body JSON y una forma de error
// uniforme `{ error: { codigo, mensaje } }`. Ver contracts/web-api.md.

export class ApiError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

function compilar(pattern) {
  const segs = pattern.split('/').filter(Boolean);
  return { segs };
}

function match(compiled, pathSegs) {
  if (compiled.segs.length !== pathSegs.length) return null;
  const params = {};
  for (let i = 0; i < compiled.segs.length; i++) {
    const s = compiled.segs[i];
    if (s.startsWith(':')) {
      params[s.slice(1)] = decodeURIComponent(pathSegs[i]);
    } else if (s !== pathSegs[i]) {
      return null;
    }
  }
  return params;
}

function enviarJson(res, status, payload) {
  const cuerpo = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

async function leerBodyJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return null;
  const texto = Buffer.concat(chunks).toString('utf8').trim();
  if (texto === '') return null;
  try {
    return JSON.parse(texto);
  } catch {
    throw new ApiError(400, 'BODY_INVALIDO', 'El cuerpo de la petición no es JSON válido');
  }
}

export function createRouter() {
  const rutas = [];

  function add(method, pattern, handler) {
    rutas.push({ method, compiled: compilar(pattern), handler });
  }

  // Devuelve true si manejó la petición (ruta /api/*), false si no corresponde.
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathSegs = url.pathname.split('/').filter(Boolean);

    let rutaConPath = false;
    for (const ruta of rutas) {
      const params = match(ruta.compiled, pathSegs);
      if (!params) continue;
      rutaConPath = true;
      if (ruta.method !== req.method) continue;
      try {
        const body = req.method === 'POST' || req.method === 'PUT' ? await leerBodyJson(req) : null;
        const query = Object.fromEntries(url.searchParams.entries());
        const resultado = await ruta.handler({ params, query, body, req });
        enviarJson(res, resultado.status ?? 200, resultado.body);
      } catch (err) {
        if (err instanceof ApiError) {
          enviarJson(res, err.status, { error: { codigo: err.codigo, mensaje: err.message } });
        } else {
          enviarJson(res, 500, { error: { codigo: 'ERROR_INTERNO', mensaje: err.message } });
        }
      }
      return true;
    }

    if (rutaConPath) {
      enviarJson(res, 405, { error: { codigo: 'METODO_NO_PERMITIDO', mensaje: `Método ${req.method} no permitido` } });
      return true;
    }
    return false;
  }

  return { add, handle };
}
