# Contract: Puertos del Dominio de Presentismo

**Feature**: 004-dominio-presentismo | **Date**: 2026-07-10

Puertos (interfaces) que el dominio consume. Se describen como contratos JSDoc/estructura
(JavaScript ESM, sin tipos de terceros). Cada adaptador DEBE cumplir el contrato; un test
de contrato (`tests/contract/presentismo-ports.contract.test.js`) ejercita cada
implementación con el mismo set. Tiempos en minutos-del-día; fechas `YYYY-MM-DD`.

## FichadasProvider
Provee las fichadas ya decodificadas y deduplicadas (features 001/002). El dominio no lee
el reloj.

```
FichadasProvider {
  // Devuelve las fichadas de un legajo en un mes (YYYYMM), deduplicadas por id.
  // Cada fichada: { legajo:int, fecha:'YYYY-MM-DD'|null, hora:int|null, id:string }
  async obtenerFichadasDelMes(legajo:int, periodo:'YYYYMM'): Fichada[]
}
```
**Reglas de contrato**:
- No devuelve duplicados por `id` (FR-009).
- Fichadas con `fecha=null` se incluyen marcadas como no imputables (FR-008); el dominio
  las deriva a `anomalias`, no a jornadas.
- Orden no garantizado; el dominio ordena por `hora`.

**Adaptador inicial**: `memory-store-fichadas-provider.js` (puente al store en memoria de
la feature 002).

## EmployeeCategoryProvider
Provee la categoría del empleado desde el padrón RRHH (solo lectura, Principio II).

```
EmployeeCategoryProvider {
  // Devuelve el código de categoría del legajo, o null si el padrón no lo trae.
  async obtenerCategoria(legajo:int): { legajo:int, codigoCategoria:string|null }
}
```
**Reglas de contrato**:
- Solo lectura; jamás escribe en Oracle.
- `codigoCategoria` sin normalizar contra la config: la validación (existe / no existe)
  la hace el servicio contra `categorias.json` (FR-035).
- Errores de conexión se propagan como error del proveedor (no se inventan categorías).

**Adaptador inicial**: `oracle-employee-category-provider.js` (usa `src/db/`, columna de
categoría configurable — research §4).

## PresentismoRepository
Persiste el estado propio del sistema (research §3). NO usa Oracle RRHH.

```
PresentismoRepository {
  async cargarCalendario(periodo:'YYYYMM'): CalendarioMes | null
  async guardarCalendario(cal: CalendarioMes): void        // escritura atómica

  async listarCorrecciones(periodo:'YYYYMM', legajo?:int): CorreccionManual[]
  async guardarCorreccion(c: CorreccionManual): void
  async revertirCorreccion(id): void

  async listarPausas(periodo:'YYYYMM', legajo?:int): PausaIntermedia[]
  async guardarPausa(p: PausaIntermedia): void
  async revertirPausa(id): void
}
```
**Reglas de contrato**:
- `guardarCalendario` es idempotente respecto de regenerar (no duplica días, preserva
  `reclasificadoManual` — FR-006).
- Toda corrección/pausa guardada tiene `motivo` no vacío; el repositorio rechaza las que
  no (defensa en profundidad de FR-027/040).
- Escritura atómica (temp + rename) para no corromper estado.

**Adaptadores**: `file-presentismo-repository.js` (JSON en disco) y
`in-memory-presentismo-repository.js` (tests).

## Logger (observabilidad)
```
PresentismoLogger {
  evento(tipo:string, datos:object): void   // NDJSON estructurado
}
```
**Reglas de contrato**: nunca serializa datos biométricos ni credenciales (Principio V);
todo evento correlacionable por `periodo`/`legajo`/`dia` cuando aplica (FR-025).

## Servicio orquestador (no es puerto, usa puertos)
```
CalcularPresentismoService(fichadasProvider, categoryProvider, repo, categoriasConfig,
                           esquemaSemanal, logger) {
  async generarCalendario(periodo): CalendarioMes
  async reclasificarDia(periodo, fecha, clasificacion, autor): CalendarioMes
  async calcularEmpleado(legajo, periodo): ResumenPresentismo[]  // 1 (mensual) o 2 (quincenal)
  async calcularPlantilla(periodo, legajos[]): ResumenPresentismo[]
  async cargarCorreccion(...), revertirCorreccion(...)
  async cargarPausa(...), revertirPausa(...)
}
```
**Reglas de contrato**:
- `calcularEmpleado` resuelve la categoría (provider) → modalidad/params (config); si la
  categoría no existe en la config o el padrón no la trae, devuelve un resumen con
  `anomalias` y sin cálculo automático (FR-035), sin parámetros inventados.
- Cálculo automático determinista (FR-023); correcciones/pausas vigentes se aplican
  encima de forma explícita.
