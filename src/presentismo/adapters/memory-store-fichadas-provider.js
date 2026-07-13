import { parseHoraMinuto } from '../domain/tiempo.js';

// Adaptador FichadasProvider sobre el store en memoria de la feature 002
// (createFichadasMemoryStore). Convierte la fichada del store
// ({legajo, fecha:'YYYY-MM-DD', hora:'HH:MM:SS', rawHex, ...}) a la forma del
// dominio ({legajo, fecha, hora:minutos, id}). Deduplica por rawHex (id).
// research §7 (FR-009): el store ya deduplica; acá reforzamos por id.
export function createMemoryStoreFichadasProvider({ store }) {
  return {
    async obtenerFichadasDelMes(legajo, periodo) {
      // periodo YYYYMM → prefijo de fecha 'YYYY-MM'.
      const prefijoFecha = `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}`;
      const todas = store.getFichadasPorLegajo(legajo);
      // Dedup por rawHex (identidad cruda, FR-009), pero NUNCA se expone el
      // rawHex hacia el dominio ni los reportes (Principio V): el id visible es
      // no sensible.
      const rawVistos = new Set();
      const salida = [];
      let idx = 0;
      for (const f of todas) {
        if (f.rawHex != null) {
          if (rawVistos.has(f.rawHex)) continue;
          rawVistos.add(f.rawHex);
        }
        const id = `${f.legajo}-${f.fecha ?? 'sf'}-${f.hora ?? 'sh'}-${idx++}`;

        // Fichada sin fecha → no imputable (FR-008): se incluye con fecha null.
        if (f.fecha == null) {
          salida.push({ legajo: f.legajo, fecha: null, hora: null, id });
          continue;
        }
        if (!f.fecha.startsWith(prefijoFecha)) continue; // otro mes

        let hora = null;
        if (typeof f.hora === 'string') {
          try {
            hora = parseHoraMinuto(f.hora);
          } catch {
            hora = null;
          }
        } else if (Number.isInteger(f.hora)) {
          hora = f.hora;
        }
        salida.push({ legajo: f.legajo, fecha: f.fecha, hora, id });
      }
      return salida;
    },
  };
}
