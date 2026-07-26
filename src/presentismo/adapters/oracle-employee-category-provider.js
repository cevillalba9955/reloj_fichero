// Adaptador EmployeeCategoryProvider sobre el repositorio Oracle de RRHH
// (solo lectura, Principio II). Lee el padrón una sola vez (research §4: una
// obtención por día de servicio) y responde por legajo desde el cache.
export function createOracleEmployeeCategoryProvider({ repository }) {
  let cache = null;

  async function asegurarCache() {
    if (cache) return cache;
    const filas = await repository.fetchLegajosConCategoria();
    cache = new Map();
    for (const { legajo, categoria, nombre, fechaIngreso } of filas) {
      const n = Number(legajo);
      if (!Number.isInteger(n)) continue; // legajo inválido: se descarta
      const codigo = categoria == null ? null : String(categoria).trim();
      const nom = nombre == null ? null : String(nombre).trim();
      // spec 015 (FR-001): fecha de ingreso nula/vacía/no parseable → null,
      // SIN descartar el legajo (contracts/oracle-roster-fecha-ingreso.md).
      const fechaIngresoValida =
        typeof fechaIngreso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaIngreso.trim())
          ? fechaIngreso.trim()
          : null;
      cache.set(n, {
        codigoCategoria: codigo && codigo.length > 0 ? codigo : null,
        nombre: nom && nom.length > 0 ? nom : null,
        fechaIngreso: fechaIngresoValida,
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
    // ordenado por legajo. Incluye nombre (IU) y fechaIngreso (spec 015,
    // antigüedad para vacaciones); ambos null si no se configuró la columna
    // o el dato no está cargado. Reusa la única obtención diaria (research §4).
    async listar() {
      const mapa = await asegurarCache();
      return [...mapa.entries()]
        .map(([legajo, { codigoCategoria, nombre, fechaIngreso }]) => ({ legajo, codigoCategoria, nombre, fechaIngreso }))
        .sort((a, b) => a.legajo - b.legajo);
    },
  };
}
