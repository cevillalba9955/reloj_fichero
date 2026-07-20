import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ops from './presentismo-repo-ops.js';

// Adaptador de PresentismoRepository sobre archivos JSON (research §3).
// Un archivo por período: `${repoDir}/${periodo}.json` con
// { calendario, correcciones, pausas, justificaciones }. Escritura atómica
// (temp + rename) para no corromper el estado ante un corte. NO usa Oracle
// (Principio II).
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
        justificaciones: parsed.justificaciones ?? [],
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
    // feature 007: enumera los períodos con calendario persistido (YYYYMM),
    // ordenados ascendentemente. Escanea el directorio del repo; toma solo
    // archivos `NNNNNN.json` cuyo estado tenga un `calendario` no nulo. Sin
    // Oracle (Principios II/VI): es la base de "el último mes generado".
    async listarPeriodos() {
      let entradas;
      try {
        entradas = readdirSync(repoDir, { withFileTypes: true });
      } catch {
        return [];
      }
      const periodos = [];
      for (const ent of entradas) {
        if (!ent.isFile()) continue;
        const m = /^(\d{6})\.json$/.exec(ent.name);
        if (!m) continue;
        const periodo = m[1];
        if (leer(periodo).calendario != null) periodos.push(periodo);
      }
      return periodos.sort();
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
    async listarJustificaciones(periodo, legajo) {
      return ops.listJustificaciones(leer(periodo), legajo);
    },
    async guardarJustificacion(j) {
      const state = leer(j.periodo);
      ops.addJustificacion(state, j);
      escribir(j.periodo, state);
    },
    async revertirJustificacion(periodo, legajo, fecha, opciones) {
      const state = leer(periodo);
      const encontrada = ops.revertJustificacion(state, legajo, fecha, opciones);
      escribir(periodo, state);
      return encontrada;
    },
  };
}
