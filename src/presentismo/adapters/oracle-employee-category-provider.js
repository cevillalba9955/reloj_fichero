// Adaptador EmployeeCategoryProvider sobre el repositorio Oracle de RRHH
// (solo lectura, Principio II). Lee el padrón una sola vez (research §4: una
// obtención por día de servicio) y responde por legajo desde el cache.
export function createOracleEmployeeCategoryProvider({ repository }) {
  let cache = null;

  async function asegurarCache() {
    if (cache) return cache;
    const filas = await repository.fetchLegajosConCategoria();
    cache = new Map();
    for (const { legajo, categoria, nombre } of filas) {
      const n = Number(legajo);
      if (!Number.isInteger(n)) continue; // legajo inválido: se descarta
      const codigo = categoria == null ? null : String(categoria).trim();
      const nom = nombre == null ? null : String(nombre).trim();
      cache.set(n, {
        codigoCategoria: codigo && codigo.length > 0 ? codigo : null,
        nombre: nom && nom.length > 0 ? nom : null,
      });
    }
    return cache;
  }

  return {
    async obtenerCategoria(legajo) {
      const mapa = await asegurarCache();
      return { legajo, codigoCategoria: mapa.get(Number(legajo))?.codigoCategoria ?? null };
    },

    // Lista el padrón activo normalizado (mismo dedup/descarte que el cache),
    // ordenado por legajo. Incluye el nombre para la IU (null si no se
    // configuró la columna). Reusa la única obtención diaria (research §4).
    async listar() {
      const mapa = await asegurarCache();
      return [...mapa.entries()]
        .map(([legajo, { codigoCategoria, nombre }]) => ({ legajo, codigoCategoria, nombre }))
        .sort((a, b) => a.legajo - b.legajo);
    },
  };
}
