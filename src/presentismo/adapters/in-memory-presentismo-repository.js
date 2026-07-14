import * as ops from './presentismo-repo-ops.js';

// Adaptador en memoria de PresentismoRepository (tests y uso efímero).
// Cumple contracts/ports.md.
export function createInMemoryPresentismoRepository() {
  const porPeriodo = new Map(); // periodo -> estado

  function estadoDe(periodo) {
    if (!porPeriodo.has(periodo)) porPeriodo.set(periodo, ops.estadoVacio());
    return porPeriodo.get(periodo);
  }

  return {
    async cargarCalendario(periodo) {
      return porPeriodo.get(periodo)?.calendario ?? null;
    },
    async guardarCalendario(cal) {
      ops.setCalendario(estadoDe(cal.periodo), cal);
    },
    async listarPeriodos() {
      return [...porPeriodo.entries()]
        .filter(([, estado]) => estado.calendario != null)
        .map(([periodo]) => periodo)
        .sort();
    },
    async listarCorrecciones(periodo, legajo) {
      return ops.listCorrecciones(estadoDe(periodo), legajo);
    },
    async guardarCorreccion(c) {
      ops.addCorreccion(estadoDe(c.periodo), c);
    },
    async revertirCorreccion(periodo, legajo, fecha) {
      ops.revertCorreccion(estadoDe(periodo), legajo, fecha);
    },
    async listarPausas(periodo, legajo) {
      return ops.listPausas(estadoDe(periodo), legajo);
    },
    async guardarPausa(p) {
      return ops.addPausa(estadoDe(p.periodo), p);
    },
    async revertirPausa(periodo, id) {
      ops.revertPausa(estadoDe(periodo), id);
    },
  };
}
