// contracts/env-config-contract.md + data-model.md §1 (FR-004/FR-005):
// lectura y validación fail-fast de la configuración del padrón Oracle desde
// variables de entorno. Constitución, Principio II: credenciales solo por
// entorno, nunca hardcodeadas ni por argv. El error enumera TODAS las
// variables faltantes/inválidas por nombre, sin exponer NUNCA ningún valor.

export class ConfiguracionPadronInvalidaError extends Error {}

// Identificador SQL estricto (research.md §2). La vista admite un punto
// (esquema.vista); la columna no.
const SQL_IDENT_VISTA = /^[A-Za-z][A-Za-z0-9_$#]*(\.[A-Za-z][A-Za-z0-9_$#]*)?$/;
const SQL_IDENT_COLUMNA = /^[A-Za-z][A-Za-z0-9_$#]*$/;

const DEFAULT_COLUMNA_LEGAJO = 'LEGAJO';
const DEFAULT_TIMEOUT_MS = 10000;

function requeridaNoVacia(env, nombre, problemas) {
  const valor = env[nombre];
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push(`${nombre} (faltante o vacía)`);
    return null;
  }
  return valor;
}

export function readOracleRosterConfig(env = process.env) {
  const problemas = [];

  const user = requeridaNoVacia(env, 'RRHH_ORACLE_USER', problemas);
  const password = requeridaNoVacia(env, 'RRHH_ORACLE_PASSWORD', problemas);
  const connectString = requeridaNoVacia(env, 'RRHH_ORACLE_CONNECT_STRING', problemas);
  const vistaPadron = requeridaNoVacia(env, 'RRHH_ORACLE_VISTA_PADRON', problemas);

  if (vistaPadron !== null && !SQL_IDENT_VISTA.test(vistaPadron)) {
    problemas.push('RRHH_ORACLE_VISTA_PADRON (no es un identificador SQL válido)');
  }

  // Opcional con default; si se provee, debe ser un identificador válido sin punto.
  const columnaRaw = env.RRHH_ORACLE_COLUMNA_LEGAJO;
  let columnaLegajo = DEFAULT_COLUMNA_LEGAJO;
  if (typeof columnaRaw === 'string' && columnaRaw.trim() !== '') {
    columnaLegajo = columnaRaw.trim();
    if (!SQL_IDENT_COLUMNA.test(columnaLegajo)) {
      problemas.push('RRHH_ORACLE_COLUMNA_LEGAJO (no es un identificador SQL válido)');
    }
  }

  // Opcional (feature 004): columna de categoría del empleado. Sin default —
  // si no se provee, la lectura de categoría queda deshabilitada (null). Si se
  // provee, debe ser un identificador SQL válido sin punto.
  const columnaCategoriaRaw = env.RRHH_ORACLE_COLUMNA_CATEGORIA;
  let columnaCategoria = null;
  if (typeof columnaCategoriaRaw === 'string' && columnaCategoriaRaw.trim() !== '') {
    columnaCategoria = columnaCategoriaRaw.trim();
    if (!SQL_IDENT_COLUMNA.test(columnaCategoria)) {
      problemas.push('RRHH_ORACLE_COLUMNA_CATEGORIA (no es un identificador SQL válido)');
    }
  }

  // Opcional (feature 004, IU): columna del nombre del empleado. Sin default —
  // si no se provee, el nombre queda deshabilitado (null). Si se provee, debe
  // ser un identificador SQL válido sin punto. Es dato personal (Principio V):
  // se usa solo para la IU, nunca en logs.
  const columnaNombreRaw = env.RRHH_ORACLE_COLUMNA_NOMBRE;
  let columnaNombre = null;
  if (typeof columnaNombreRaw === 'string' && columnaNombreRaw.trim() !== '') {
    columnaNombre = columnaNombreRaw.trim();
    if (!SQL_IDENT_COLUMNA.test(columnaNombre)) {
      problemas.push('RRHH_ORACLE_COLUMNA_NOMBRE (no es un identificador SQL válido)');
    }
  }

  // Opcional (spec 015, FR-001): columna de fecha de ingreso del empleado,
  // fuente de la antigüedad para vacaciones. Sin default — si no se provee,
  // la lectura de fecha de ingreso queda deshabilitada (null, mismo criterio
  // que columnaCategoria/columnaNombre). Si se provee, debe ser un
  // identificador SQL válido sin punto.
  const columnaFechaIngresoRaw = env.RRHH_ORACLE_COLUMNA_FECHA_INGRESO;
  let columnaFechaIngreso = null;
  if (typeof columnaFechaIngresoRaw === 'string' && columnaFechaIngresoRaw.trim() !== '') {
    columnaFechaIngreso = columnaFechaIngresoRaw.trim();
    if (!SQL_IDENT_COLUMNA.test(columnaFechaIngreso)) {
      problemas.push('RRHH_ORACLE_COLUMNA_FECHA_INGRESO (no es un identificador SQL válido)');
    }
  }

  // Opcional con default; si se provee, debe ser un entero > 0.
  const timeoutRaw = env.RRHH_ORACLE_TIMEOUT_MS;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (typeof timeoutRaw === 'string' && timeoutRaw.trim() !== '') {
    const n = Number(timeoutRaw);
    if (!Number.isInteger(n) || n <= 0) {
      problemas.push('RRHH_ORACLE_TIMEOUT_MS (debe ser un entero > 0)');
    } else {
      timeoutMs = n;
    }
  }

  if (problemas.length > 0) {
    throw new ConfiguracionPadronInvalidaError(
      'Configuración del padrón Oracle inválida. Revisá estas variables de entorno: ' +
      problemas.join('; ') + '.'
    );
  }

  return {
    user,
    password,
    connectString,
    vistaPadron,
    columnaLegajo,
    columnaCategoria,
    columnaNombre,
    columnaFechaIngreso,
    timeoutMs,
  };
}
