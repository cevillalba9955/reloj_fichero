import { resolverRolActual } from '../acl/autorizacion.js';

// feature 016 — Handlers de la API de Control de Acceso. Expone
// `GET /api/acl/mi-rol` (contracts/web-api-acl.md), el mecanismo por el que
// el frontend descubre el rol resuelto para la request actual. Sin
// `exigirRol`: accesible para cualquier identidad, incluida una sin rol
// resuelto (responde `lector`, FR-004).

export function registrarRutas(router, ctx) {
  router.add('GET', '/api/acl/mi-rol', async ({ req }) => {
    return { status: 200, body: { rol: resolverRolActual(req, ctx) } };
  });
}
