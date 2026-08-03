// feature 016 — La app está embebida en un iframe dentro de una página de
// APEX (región tipo URL, `inclusion-mode: IFrame`, ver research/p00023.yaml
// y contracts/oracle-roles-view.md): un iframe no puede recibir un header
// HTTP inyectado desde afuera (eso solo lo puede hacer un proxy
// intermedio, que acá no existe), así que APEX pasa el rol directamente en
// el query string de la URL del iframe (`?rol=...`), sustituyendo un ítem
// de la página. Esta app lo lee una sola vez al cargar (no vuelve a
// cambiar sin un reload completo del iframe) y lo reenvía como el mismo
// header que ya esperaba el backend (`X-Apex-Rol`) en cada llamada a
// `/api/*` — el backend no cambia nada de su lógica de autorización
// (`src/web/acl/autorizacion.js`), solo cambia quién le pone el header.
//
// Riesgo aceptado (decisión 2026-07-28, ver
// specs/016-control-acceso-roles/contracts/oracle-roles-view.md): el valor
// viaja visible en la URL y es editable desde las herramientas de
// desarrollador del navegador — se acepta porque la app solo es alcanzable
// en la red interna, mismo criterio que ya rige para Oracle y el reloj
// biométrico (nunca expuestos a internet).

const PARAMETRO_ROL = 'rol';
export const HEADER_ROL = 'X-Apex-Rol';

function leerRolDeUrl() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get(PARAMETRO_ROL);
  } catch {
    return null;
  }
}

const rolCapturado = leerRolDeUrl();

// Mismo perfil que `globalThis.fetch`: agrega el header de rol capturado al
// cargar la página, si hay uno; si no, se comporta exactamente igual que
// `fetch` (por ejemplo, fuera del iframe de APEX, en desarrollo local).
export function fetchConRol(input, init = {}) {
  if (!rolCapturado) return globalThis.fetch(input, init);
  const headers = new Headers(init.headers ?? {});
  headers.set(HEADER_ROL, rolCapturado);
  return globalThis.fetch(input, { ...init, headers });
}
