// Contratos de puertos del dominio de presentismo (contracts/ports.md).
// JavaScript no tiene interfaces; documentamos la forma esperada en JSDoc y
// proveemos un validador de forma para los tests de contrato.

/**
 * @typedef {Object} FichadaDominio
 * @property {number} legajo
 * @property {string|null} fecha  'YYYY-MM-DD' o null si no imputable
 * @property {number|null} hora   minutos-del-día o null
 * @property {string} id          identidad estable para deduplicar
 */

/**
 * FichadasProvider: provee fichadas ya decodificadas y deduplicadas (feat. 001/002).
 * @typedef {Object} FichadasProvider
 * @property {(legajo:number, periodo:string) => Promise<FichadaDominio[]>} obtenerFichadasDelMes
 */

/**
 * EmployeeCategoryProvider: categoría del empleado desde el padrón (solo lectura).
 * @typedef {Object} EmployeeCategoryProvider
 * @property {(legajo:number) => Promise<{legajo:number, codigoCategoria:string|null}>} obtenerCategoria
 */

/**
 * PresentismoRepository: persiste el estado propio del sistema.
 * @typedef {Object} PresentismoRepository
 * @property {(periodo:string) => Promise<object|null>} cargarCalendario
 * @property {(cal:object) => Promise<void>} guardarCalendario
 * @property {() => Promise<string[]>} listarPeriodos  YYYYMM con calendario, ordenados asc
 * @property {(periodo:string, legajo?:number) => Promise<object[]>} listarCorrecciones
 * @property {(c:object) => Promise<void>} guardarCorreccion
 * @property {(periodo:string, legajo:number, fecha:string) => Promise<void>} revertirCorreccion
 * @property {(periodo:string, legajo?:number) => Promise<object[]>} listarPausas
 * @property {(p:object) => Promise<string>} guardarPausa
 * @property {(periodo:string, id:string) => Promise<void>} revertirPausa
 */

const METODOS = {
  FichadasProvider: ['obtenerFichadasDelMes'],
  EmployeeCategoryProvider: ['obtenerCategoria'],
  PresentismoRepository: [
    'cargarCalendario',
    'guardarCalendario',
    'listarPeriodos',
    'listarCorrecciones',
    'guardarCorreccion',
    'revertirCorreccion',
    'listarPausas',
    'guardarPausa',
    'revertirPausa',
  ],
  PresentismoLogger: ['evento'],
};

// Valida que un objeto cumpla la forma de un puerto (usado por los tests de
// contrato y como defensa en el cableado del servicio).
export function assertCumplePuerto(nombrePuerto, obj) {
  const requeridos = METODOS[nombrePuerto];
  if (!requeridos) throw new Error(`ports: puerto desconocido "${nombrePuerto}"`);
  for (const m of requeridos) {
    if (typeof obj?.[m] !== 'function') {
      throw new Error(`ports: el objeto no cumple ${nombrePuerto}: falta método "${m}"`);
    }
  }
  return true;
}

export { METODOS };
