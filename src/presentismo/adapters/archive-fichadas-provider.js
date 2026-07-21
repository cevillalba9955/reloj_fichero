import { parseHoraMinuto } from '../domain/tiempo.js';
import { cargarFichadasArchivadas } from './file-fichadas-archive.js';

// FichadasProvider que lee el archivo acumulativo por período (la única fuente
// de fichadas para el cálculo, poblada por `importar-fichadas`). Convierte la
// fichada cruda ({legajo, fecha:'YYYY-MM-DD', hora:'HH:MM:SS', rawHex}) a la
// forma del dominio ({legajo, fecha, hora:minutos, id}), deduplica por rawHex y
// NUNCA expone el rawHex hacia el dominio ni los reportes (Principio V).
export function createArchiveFichadasProvider({ repoDir }) {
  return {
    async obtenerFichadasDelMes(legajo, periodo) {
      const todas = cargarFichadasArchivadas({ repoDir, periodo });
      const prefijoFecha = `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}`;
      const rawVistos = new Set();
      const salida = [];
      let idx = 0;
      for (const f of todas) {
        if (Number(f.legajo) !== Number(legajo)) continue;
        if (f.rawHex != null) {
          if (rawVistos.has(f.rawHex)) continue;
          rawVistos.add(f.rawHex);
        }
        const id = `${f.legajo}-${f.fecha ?? 'sf'}-${f.hora ?? 'sh'}-${idx++}`;

        // Fichada sin fecha → no imputable (FR-008): se incluye con fecha null.
        if (f.fecha == null) {
          salida.push({ legajo: Number(f.legajo), fecha: null, hora: null, id });
          continue;
        }
        if (!f.fecha.startsWith(prefijoFecha)) continue; // otro mes (defensa)

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
        salida.push({ legajo: Number(f.legajo), fecha: f.fecha, hora, id });
      }
      return salida;
    },
  };
}
