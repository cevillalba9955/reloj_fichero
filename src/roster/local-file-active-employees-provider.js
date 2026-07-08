import { readFileSync } from 'node:fs';
import { RosterNoDisponibleError } from './active-employees-provider.js';

// ADAPTER PLACEHOLDER (research.md §4, contracts/roster-provider-contract.md):
// implementacion temporal que lee un archivo JSON local con la forma
// `{ "legajosActivos": [1, 2, 3] }`. Debe reemplazarse por una integracion
// real de Oracle/RRHH (detras de la capa de repositorio que exige el
// Principio II de la constitucion) sin tocar el resto del servicio: ambos
// implementan la misma interfaz `ActiveEmployeesProvider`
// (active-employees-provider.js), asi que el reemplazo es un cambio
// localizado a este archivo.
export function createLocalFileActiveEmployeesProvider({ filePath }) {
  async function getActiveEmployees() {
    let contenido;
    try {
      contenido = readFileSync(filePath, 'utf8');
    } catch (err) {
      throw new RosterNoDisponibleError(
        `No se pudo leer el padron de empleados activos desde "${filePath}": ${err.message}`
      );
    }

    let datos;
    try {
      datos = JSON.parse(contenido);
    } catch (err) {
      throw new RosterNoDisponibleError(
        `El archivo de padron "${filePath}" no tiene JSON valido: ${err.message}`
      );
    }

    if (!Array.isArray(datos?.legajosActivos)) {
      throw new RosterNoDisponibleError(
        `El archivo de padron "${filePath}" no tiene el formato esperado ({ "legajosActivos": [...] })`
      );
    }

    return datos.legajosActivos.map((legajo) => ({ legajo, activo: true }));
  }

  return { getActiveEmployees };
}
