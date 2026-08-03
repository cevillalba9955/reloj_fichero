import { ApiError } from '../api/router.js';

// feature 016 (research.md §1/§2, data-model.md) — Resolución del rol actual
// y envoltorio de autorización para handlers del router. El rol se resuelve
// leyendo un header HTTP (placeholder reemplazable: el mecanismo real de
// APEX todavía no está definido, ver Assumptions del spec) y traduciéndolo
// con el mapeo fijo de `ctx.rolesConfig` (src/config/roles-config.js).

export const ROLES = Object.freeze(['lector', 'editor', 'configurador']);
const RANGO = Object.freeze({ lector: 0, editor: 1, configurador: 2 });

// `req` es el `http.IncomingMessage` crudo que el router ya le pasa a cada
// handler (`{ params, query, body, req }`); `req.headers` ya viene con las
// claves normalizadas a minúsculas por node:http.
export function resolverRolActual(req, ctx) {
  const valorHeader = req?.headers?.[ctx.aclHeaderRol];
  const rolOrigen = Array.isArray(valorHeader) ? valorHeader[0] : (valorHeader ?? null);
  return ctx.rolesConfig.mapear(rolOrigen);
}

// Envuelve un handler del router para que solo se ejecute si el rol actual
// tiene rango suficiente; si no, rechaza en el servidor (FR-009) con un
// código distinguible de un error de validación (FR-010). `ctx` se pasa
// explícito porque `resolverRolActual` lo necesita y el router no se lo
// inyecta al handler (solo `{ params, query, body, req }`).
export function exigirRol(ctx, rolMinimo, handler) {
  return async (args) => {
    const rolActual = resolverRolActual(args.req, ctx);
    if (RANGO[rolActual] < RANGO[rolMinimo]) {
      throw new ApiError(
        403,
        'ACCESO_DENEGADO',
        `Tu rol actual (${rolActual}) no tiene permiso para esta operación (requiere ${rolMinimo} o superior)`,
      );
    }
    return handler(args);
  };
}
