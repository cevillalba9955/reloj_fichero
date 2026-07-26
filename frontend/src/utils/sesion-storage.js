// Helper compartido para recordar navegación entre pestañas (fecha
// seleccionada en "Fichadas de hoy", período mostrado en "Calendario") vía
// `sessionStorage`: sobrevive a un refresh de la página pero no al cierre de
// la pestaña/navegador, a diferencia de `localStorage`. Envuelto en
// try/catch: en navegación privada algunos navegadores lanzan al acceder a
// `sessionStorage`, y esto es solo una comodidad de UX, no debe romper nada.

export function leerSesion(clave) {
  try {
    return globalThis.sessionStorage?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

export function guardarSesion(clave, valor) {
  try {
    if (valor == null) globalThis.sessionStorage?.removeItem(clave);
    else globalThis.sessionStorage?.setItem(clave, valor);
  } catch {
    // best-effort: sin persistencia de sesión no bloquea la navegación.
  }
}
