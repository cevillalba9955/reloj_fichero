import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RosterNoDisponibleError } from './active-employees-provider.js';
import { interpretarLegajo } from './legajo.js';
import { rutaCarpetaPeriodo, ARCHIVO_PADRON } from '../presentismo/domain/periodo-storage.js';
import { mesActualPeriodo } from '../presentismo/domain/calendario-mes.js';

// Adapter que lee un archivo JSON local con el padrón de empleados activos.
// Acepta DOS esquemas de entrada (research §4, spec 005):
//   - legacy (feature 002):   { "legajosActivos": [1, 2, 3] }
//   - snapshot (feature 004): { "empleados": [{ "legajo": N, "categoria", "nombre" }] }
// Normaliza con la regla única `interpretarLegajo` (entero ≥ 1), deduplica y
// descarta inválidos, exponiendo la forma del contrato `ActiveEmployeesProvider`
// (`{ legajo, activo: true }[]`). Así el mismo servicio puede alimentarse del
// snapshot local del padrón sin depender de Oracle en runtime.
//
// 013-reestructurar-data-periodos (FR-004, research.md §5): DOS modos
// mutuamente excluyentes.
//   - `{ filePath }` (sin cambios): un archivo FIJO, ajeno al ciclo de
//     períodos — usado por `consulta-programada.js` (`--roster-config`/
//     `FICHADAS_ROSTER_CONFIG`), que no tiene nada que ver con el padrón por
//     período de presentismo.
//   - `{ repoDir, now }` (nuevo): resuelve `P<mesActualPeriodo(now())>/padron.json`
//     en CADA llamada a `getActiveEmployees` — usado por el backend web
//     (`activeEmployeesProvider` en `wiring.js`), que es de larga vida y debe
//     ver el padrón del mes en curso apenas cambia el mes, sin reiniciarse.
export function createLocalFileActiveEmployeesProvider({ filePath, repoDir, now = () => new Date() }) {
  if ((filePath == null) === (repoDir == null)) {
    throw new Error(
      'createLocalFileActiveEmployeesProvider: pasá exactamente uno de "filePath" o "repoDir"',
    );
  }

  function rutaActual() {
    return filePath ?? join(rutaCarpetaPeriodo(repoDir, mesActualPeriodo(now())), ARCHIVO_PADRON);
  }

  async function getActiveEmployees() {
    const ruta = rutaActual();
    let contenido;
    try {
      contenido = readFileSync(ruta, 'utf8');
    } catch (err) {
      throw new RosterNoDisponibleError(
        `No se pudo leer el padron de empleados activos desde "${ruta}": ${err.message}`
      );
    }

    let datos;
    try {
      datos = JSON.parse(contenido);
    } catch (err) {
      throw new RosterNoDisponibleError(
        `El archivo de padron "${ruta}" no tiene JSON valido: ${err.message}`
      );
    }

    // Detección por forma: legacy tiene prioridad; si no, el snapshot 004.
    let crudos;
    if (Array.isArray(datos?.legajosActivos)) {
      crudos = datos.legajosActivos;
    } else if (Array.isArray(datos?.empleados)) {
      crudos = datos.empleados.map((e) => e?.legajo);
    } else {
      throw new RosterNoDisponibleError(
        `El archivo de padron "${ruta}" no tiene el formato esperado ` +
        '({ "legajosActivos": [...] } o { "empleados": [{ "legajo" }] })'
      );
    }

    const vistos = new Set();
    const empleados = [];
    for (const raw of crudos) {
      const legajo = interpretarLegajo(raw);
      if (legajo === null || vistos.has(legajo)) continue; // inválido o duplicado
      vistos.add(legajo);
      empleados.push({ legajo, activo: true });
    }

    if (empleados.length === 0) {
      throw new RosterNoDisponibleError(
        `El archivo de padron "${ruta}" no contiene ningun legajo activo valido`
      );
    }

    return empleados;
  }

  return { getActiveEmployees };
}
