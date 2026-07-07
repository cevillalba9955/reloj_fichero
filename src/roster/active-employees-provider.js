// contracts/roster-provider-contract.md: interfaz que aisla la fuente de
// "empleados activos" (RRHH/Oracle, todavia sin integrar en este proyecto)
// del resto del servicio, con el mismo espiritu de aislamiento que la
// Constitucion exige para el protocolo RS956 (Principio III) y para Oracle
// (Principio II).
export class RosterNoDisponibleError extends Error {}

// Valida la forma minima que debe cumplir cualquier ActiveEmployeesProvider:
// un objeto con getActiveEmployees() -> Promise<Empleado[]>. No valida el
// contenido de la promesa (eso lo hace cada adapter, ej.
// LocalFileActiveEmployeesProvider).
export function assertActiveEmployeesProvider(provider) {
  if (!provider || typeof provider.getActiveEmployees !== 'function') {
    throw new TypeError(
      'ActiveEmployeesProvider invalido: se espera un objeto con getActiveEmployees() -> Promise<Empleado[]> ' +
      '(ver contracts/roster-provider-contract.md)'
    );
  }
}
