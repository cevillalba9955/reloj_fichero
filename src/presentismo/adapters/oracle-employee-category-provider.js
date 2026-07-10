// Adaptador EmployeeCategoryProvider sobre el repositorio Oracle de RRHH
// (solo lectura, Principio II). Lee el padrón una sola vez (research §4: una
// obtención por día de servicio) y responde por legajo desde el cache.
export function createOracleEmployeeCategoryProvider({ repository }) {
  let cache = null;

  async function asegurarCache() {
    if (cache) return cache;
    const filas = await repository.fetchLegajosConCategoria();
    cache = new Map();
    for (const { legajo, categoria } of filas) {
      const n = Number(legajo);
      if (!Number.isInteger(n)) continue; // legajo inválido: se descarta
      const codigo = categoria == null ? null : String(categoria).trim();
      cache.set(n, codigo && codigo.length > 0 ? codigo : null);
    }
    return cache;
  }

  return {
    async obtenerCategoria(legajo) {
      const mapa = await asegurarCache();
      return { legajo, codigoCategoria: mapa.get(Number(legajo)) ?? null };
    },
  };
}
