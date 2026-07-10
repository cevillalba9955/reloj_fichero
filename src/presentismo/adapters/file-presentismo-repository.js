import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as ops from './presentismo-repo-ops.js';

// Adaptador de PresentismoRepository sobre archivos JSON (research §3).
// Un archivo por período: `${repoDir}/${periodo}.json` con
// { calendario, correcciones, pausas }. Escritura atómica (temp + rename)
// para no corromper el estado ante un corte. NO usa Oracle (Principio II).
export function createFilePresentismoRepository({ repoDir }) {
  mkdirSync(repoDir, { recursive: true });

  function rutaDe(periodo) {
    return join(repoDir, `${periodo}.json`);
  }

  function leer(periodo) {
    const ruta = rutaDe(periodo);
    if (!existsSync(ruta)) return ops.estadoVacio();
    try {
      const parsed = JSON.parse(readFileSync(ruta, 'utf8'));
      return {
        calendario: parsed.calendario ?? null,
        correcciones: parsed.correcciones ?? [],
        pausas: parsed.pausas ?? [],
      };
    } catch {
      throw new Error(`file-presentismo-repository: estado corrupto en "${ruta}"`);
    }
  }

  function escribir(periodo, state) {
    const ruta = rutaDe(periodo);
    const tmp = `${ruta}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tmp, ruta);
  }

  return {
    async cargarCalendario(periodo) {
      return leer(periodo).calendario;
    },
    async guardarCalendario(cal) {
      const state = leer(cal.periodo);
      ops.setCalendario(state, cal);
      escribir(cal.periodo, state);
    },
    async listarCorrecciones(periodo, legajo) {
      return ops.listCorrecciones(leer(periodo), legajo);
    },
    async guardarCorreccion(c) {
      const state = leer(c.periodo);
      ops.addCorreccion(state, c);
      escribir(c.periodo, state);
    },
    async revertirCorreccion(periodo, legajo, fecha) {
      const state = leer(periodo);
      ops.revertCorreccion(state, legajo, fecha);
      escribir(periodo, state);
    },
    async listarPausas(periodo, legajo) {
      return ops.listPausas(leer(periodo), legajo);
    },
    async guardarPausa(p) {
      const state = leer(p.periodo);
      const id = ops.addPausa(state, p);
      escribir(p.periodo, state);
      return id;
    },
    async revertirPausa(periodo, id) {
      const state = leer(periodo);
      ops.revertPausa(state, id);
      escribir(periodo, state);
    },
  };
}
