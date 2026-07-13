import { assertActiveEmployeesProvider } from './active-employees-provider.js';
import { interpretarLegajo } from './legajo.js';

// contracts/oracle-roster-repository-contract.md + data-model.md §2 (FR-012):
// adapter que transforma las filas crudas del repositorio Oracle en la forma
// exacta del contrato `ActiveEmployeesProvider` (`{ legajo, activo: true }[]`),
// normalizando: deduplica legajos repetidos y descarta valores no
// interpretables como legajo (entero ≥ 1, mismo dominio que el legajo RS956),
// dejando constancia de cada descarte en el log sin incluir el valor crudo.
//
// NO captura los errores del repositorio (RosterNoDisponibleError): los deja
// propagar para que el decorator diario aplique la política de respaldo/error.

export function createOracleActiveEmployeesProvider({ repository, logger = null }) {
  async function getActiveEmployees() {
    const filas = await repository.fetchLegajosActivos();

    const vistos = new Set();
    const empleados = [];
    for (const raw of filas) {
      const legajo = interpretarLegajo(raw);
      if (legajo === null) {
        logger?.logEvento({ evento: 'legajo_descartado', detail: 'invalido' });
        continue;
      }
      if (vistos.has(legajo)) {
        logger?.logEvento({ evento: 'legajo_descartado', detail: 'duplicado' });
        continue;
      }
      vistos.add(legajo);
      empleados.push({ legajo, activo: true });
    }
    return empleados;
  }

  const provider = { getActiveEmployees };
  assertActiveEmployeesProvider(provider);
  return provider;
}
