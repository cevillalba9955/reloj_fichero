import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Adaptador de VacacionesRepository sobre un ÚNICO archivo JSON
// (research.md §3): `${repoDir}/vacaciones.json`, FUERA de la carpeta por
// período (`P<periodo>/`) porque el saldo y las asignaciones son datos de
// LEGAJO, no de período — una asignación puede cruzar varios períodos
// (spec 015 FR-005). Misma disciplina de escritura atómica (temp + rename)
// que file-presentismo-repository.js.
//
// Forma en disco: { legajos: { "<legajo>": { saldo, ultimoIncrementoAplicado,
// movimientos } }, asignaciones: [ ... ] } (data-model.md §4/§5).

const ARCHIVO_VACACIONES = 'vacaciones.json';

function estadoVacio() {
  return { legajos: {}, asignaciones: [] };
}

export function createFileVacacionesRepository({ repoDir }) {
  const rutaArchivo = join(repoDir, ARCHIVO_VACACIONES);

  function leer() {
    if (!existsSync(rutaArchivo)) return estadoVacio();
    try {
      const parsed = JSON.parse(readFileSync(rutaArchivo, 'utf8'));
      return {
        legajos: parsed.legajos ?? {},
        asignaciones: parsed.asignaciones ?? [],
      };
    } catch {
      throw new Error(`file-vacaciones-repository: estado corrupto en "${rutaArchivo}"`);
    }
  }

  function escribir(state) {
    mkdirSync(repoDir, { recursive: true });
    const tmp = `${rutaArchivo}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tmp, rutaArchivo);
  }

  return {
    async cargarLegajo(legajo) {
      const state = leer();
      return state.legajos[String(legajo)] ?? { saldo: 0, ultimoIncrementoAplicado: null, movimientos: [] };
    },

    async guardarLegajo(legajo, datosLegajo) {
      const state = leer();
      state.legajos[String(legajo)] = datosLegajo;
      escribir(state);
    },

    async guardarAsignacion(asignacion) {
      const state = leer();
      const idx = state.asignaciones.findIndex((a) => a.id === asignacion.id);
      if (idx >= 0) {
        state.asignaciones[idx] = asignacion;
      } else {
        state.asignaciones.push(asignacion);
      }
      escribir(state);
    },

    async cargarAsignacion(id) {
      const state = leer();
      return state.asignaciones.find((a) => a.id === id) ?? null;
    },

    async listarAsignaciones(legajo) {
      const state = leer();
      if (legajo == null) return state.asignaciones;
      return state.asignaciones.filter((a) => a.legajo === legajo);
    },

    async revertirAsignacion(id, { autor, fechaHora }) {
      const state = leer();
      const asignacion = state.asignaciones.find((a) => a.id === id);
      if (!asignacion || !asignacion.vigente) return null;
      asignacion.vigente = false;
      asignacion.reversion = { autor: autor ?? null, fechaHora };
      escribir(state);
      return asignacion;
    },
  };
}
