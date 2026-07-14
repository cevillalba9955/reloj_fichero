# Contrato: `ActiveEmployeesProvider` (padrón de empleados activos)

**Motivo**: FR-005/FR-013 de [spec.md](../spec.md) y research.md §4 — el
padrón de empleados activos surge de una fuente externa (RRHH/Oracle) que
todavía no está integrada en este proyecto. Esta interfaz aísla esa
dependencia para que el resto del servicio no sepa de dónde viene la
lista, siguiendo el mismo principio de aislamiento que la Constitución
exige para el protocolo RS956 (Principio III) y para el acceso a Oracle
(Principio II).

## Interfaz

```text
ActiveEmployeesProvider.getActiveEmployees() -> Promise<Empleado[]>
```

| Campo de cada `Empleado` devuelto | Tipo | Descripción |
|---|---|---|
| `legajo` | integer | Identificador numérico, mismo dominio que el `legajo` decodificado por el cliente RS956 (entero de 4 bytes). |
| `activo` | boolean | Siempre `true` para los elementos devueltos por este método (un provider solo devuelve activos; no hay un campo de "inactivo" que filtrar del lado del servicio). |

**Comportamiento esperado**:
- Debe resolver rápido (se llama en cada tick de 5 minutos mientras el
  checkpoint "entrada" esté abierto); no debe bloquear indefinidamente.
- Ante cualquier error (fuente no disponible, timeout, formato
  inesperado), DEBE rechazar la promesa — nunca devolver una lista vacía
  como sustituto silencioso de un error (FR-013).

## Adapter placeholder de esta feature

Mientras no exista integración real con RRHH/Oracle (research.md §4), se
implementa `LocalFileActiveEmployeesProvider`: lee un archivo de
configuración JSON local (ruta configurable) con la forma:

```json
{ "legajosActivos": [1, 2, 3] }
```

y lo transforma en la lista de `Empleado` que exige esta interfaz. Este
adapter queda explícitamente marcado en su código como temporal — el
reemplazo por un adapter real de Oracle (detrás de la capa de repositorio
que exige el Principio II de la constitución) es trabajo de una feature
futura y no debería requerir cambios fuera de este adapter.

## Fuera de alcance

- Cualquier operación de escritura sobre el padrón (alta/baja de
  empleados activos) — esta interfaz es de solo lectura.
- Cachear o invalidar el padrón entre ciclos — cada tick vuelve a
  consultar `getActiveEmployees()`; si el costo de esto resulta
  significativo contra una fuente real, cachear queda como optimización
  futura, no como requisito de esta feature.
