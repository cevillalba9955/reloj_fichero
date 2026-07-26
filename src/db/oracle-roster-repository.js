import { RosterNoDisponibleError } from '../roster/active-employees-provider.js';

// Constitución, Principio II: ESTE es el único archivo del repositorio
// completo donde puede existir SQL. Capa de repositorio Oracle dedicada
// (contracts/oracle-roster-repository-contract.md, FR-002/FR-003). Solo
// lectura, una única sentencia, conexión efímera cerrada siempre.

// Identificador SQL estricto (research.md §2). `vistaPadron` admite un punto
// (esquema.vista); `columnaLegajo` no.
const SQL_IDENT_VISTA = /^[A-Za-z][A-Za-z0-9_$#]*(\.[A-Za-z][A-Za-z0-9_$#]*)?$/;
const SQL_IDENT_COLUMNA = /^[A-Za-z][A-Za-z0-9_$#]*$/;

class TimeoutSentinel extends Error {}

// Nunca embebemos el mensaje original del driver (podría incluir usuario,
// connect string o password): solo la categoría de diagnóstico (FR-010).
function rosterError(categoria) {
  const err = new RosterNoDisponibleError(`Fuente RRHH no disponible (categoría: ${categoria})`);
  err.categoria = categoria;
  return err;
}

function categorizarErrorConexion(err) {
  const msg = String(err?.message ?? '');
  // ORA-01017 (invalid username/password), ORA-01005, etc. → autenticación.
  if (/ORA-0101[0-9]|invalid username\/password|logon denied|authentication/i.test(msg)) {
    return 'autenticacion';
  }
  return 'conexion';
}

// node-oracledb (modo thin) real. Import dinámico para que la suite de tests
// —que siempre inyecta una fábrica fake— no dependa del driver ni de una
// base disponible (research.md §8).
async function defaultConnectionFactory(config) {
  const oracledb = (await import('oracledb')).default;
  const connection = await oracledb.getConnection({
    user: config.user,
    password: config.password,
    connectString: config.connectString,
  });
  // FR-009: además del corte por deadline propio, acotamos la llamada en el
  // driver cuando está disponible.
  try {
    connection.callTimeout = config.timeoutMs;
  } catch {
    // Algunas versiones/fakes no exponen callTimeout; el deadline propio cubre igual.
  }
  return connection;
}

// Corta cualquier promesa que exceda `ms`, sin dejar la espera indefinida
// (FR-009). Resuelve/rechaza con lo que llegue primero.
function conDeadline(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutSentinel()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Extrae la columna del legajo tal cual (sin normalizar): la normalización
// (dedup/descartes, FR-012) es responsabilidad del provider.
function extraerFilas(result, columnaLegajo) {
  const rows = result?.rows ?? [];
  return rows.map((row) => {
    if (Array.isArray(row)) return row[0];
    if (row && typeof row === 'object') {
      // node-oracledb con outFormat OBJECT expone la columna en mayúsculas.
      if (columnaLegajo in row) return row[columnaLegajo];
      const upper = columnaLegajo.toUpperCase();
      if (upper in row) return row[upper];
    }
    return row;
  });
}

// Extrae filas {legajo, categoria[, nombre][, fechaIngreso]} respetando
// OBJECT (mayúsculas) o array. `extras` es la lista ORDENADA de columnas
// opcionales realmente proyectadas (mismo orden que en el SQL), cada una
// `{ key, columna }`; una columna no configurada ni se proyecta ni se lee.
function extraerFilasConCategoria(result, columnaLegajo, columnaCategoria, extras = []) {
  const rows = result?.rows ?? [];
  const val = (row, col, idx) => {
    if (Array.isArray(row)) return row[idx];
    if (row && typeof row === 'object') {
      if (col in row) return row[col];
      const upper = col.toUpperCase();
      if (upper in row) return row[upper];
    }
    return undefined;
  };
  return rows.map((row) => {
    const fila = {
      legajo: val(row, columnaLegajo, 0),
      categoria: val(row, columnaCategoria, 1),
    };
    extras.forEach(({ key, columna }, i) => {
      fila[key] = val(row, columna, 2 + i);
    });
    return fila;
  });
}

export function createOracleRosterRepository({ config, connectionFactory = defaultConnectionFactory }) {
  async function fetchLegajosActivos() {
    // Defensa en profundidad: re-validar identificadores ANTES de construir el
    // SQL o abrir conexión, aunque la config ya los haya validado.
    if (!SQL_IDENT_VISTA.test(config.vistaPadron)) {
      throw new Error(`oracle-roster-repository: vistaPadron no es un identificador SQL válido`);
    }
    if (!SQL_IDENT_COLUMNA.test(config.columnaLegajo)) {
      throw new Error(`oracle-roster-repository: columnaLegajo no es un identificador SQL válido`);
    }

    const sql = `SELECT ${config.columnaLegajo} FROM ${config.vistaPadron}`;
    const timeoutMs = config.timeoutMs;

    let connection = null;
    let fase = 'conexion';
    try {
      connection = await conDeadline(Promise.resolve().then(() => connectionFactory(config)), timeoutMs);
      fase = 'consulta';
      const result = await conDeadline(connection.execute(sql, [], {}), timeoutMs);
      return extraerFilas(result, config.columnaLegajo);
    } catch (err) {
      if (err instanceof TimeoutSentinel) throw rosterError('timeout');
      if (fase === 'conexion') throw rosterError(categorizarErrorConexion(err));
      throw rosterError('consulta');
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {
          // Cerrar es best-effort; un error al cerrar no debe enmascarar el resultado.
        }
      }
    }
  }

  // Feature 004: proyecta legajo + categoría (solo lectura). Requiere
  // config.columnaCategoria configurada. Misma disciplina de conexión efímera,
  // deadline y errores sin datos sensibles que fetchLegajosActivos.
  async function fetchLegajosConCategoria() {
    if (!config.columnaCategoria) {
      throw new Error(
        'oracle-roster-repository: columnaCategoria no configurada ' +
        '(definí RRHH_ORACLE_COLUMNA_CATEGORIA para leer la categoría del padrón)'
      );
    }
    if (!SQL_IDENT_VISTA.test(config.vistaPadron)) {
      throw new Error('oracle-roster-repository: vistaPadron no es un identificador SQL válido');
    }
    if (!SQL_IDENT_COLUMNA.test(config.columnaLegajo)) {
      throw new Error('oracle-roster-repository: columnaLegajo no es un identificador SQL válido');
    }
    if (!SQL_IDENT_COLUMNA.test(config.columnaCategoria)) {
      throw new Error('oracle-roster-repository: columnaCategoria no es un identificador SQL válido');
    }
    // Columnas opcionales (nombre, fecha de ingreso — spec 015 FR-001). Se
    // validan solo si están configuradas; el orden acá define el orden de
    // proyección en el SQL y de extracción posicional de filas en array.
    const extras = [];
    if (config.columnaNombre) extras.push({ key: 'nombre', columna: config.columnaNombre });
    if (config.columnaFechaIngreso) extras.push({ key: 'fechaIngreso', columna: config.columnaFechaIngreso });
    for (const { columna } of extras) {
      if (!SQL_IDENT_COLUMNA.test(columna)) {
        throw new Error(`oracle-roster-repository: columna "${columna}" no es un identificador SQL válido`);
      }
    }

    const columnas = [config.columnaLegajo, config.columnaCategoria, ...extras.map((e) => e.columna)];
    const sql = `SELECT ${columnas.join(', ')} FROM ${config.vistaPadron}`;
    const timeoutMs = config.timeoutMs;

    let connection = null;
    let fase = 'conexion';
    try {
      connection = await conDeadline(Promise.resolve().then(() => connectionFactory(config)), timeoutMs);
      fase = 'consulta';
      const result = await conDeadline(connection.execute(sql, [], {}), timeoutMs);
      return extraerFilasConCategoria(result, config.columnaLegajo, config.columnaCategoria, extras);
    } catch (err) {
      if (err instanceof TimeoutSentinel) throw rosterError('timeout');
      if (fase === 'conexion') throw rosterError(categorizarErrorConexion(err));
      throw rosterError('consulta');
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {
          // best-effort
        }
      }
    }
  }

  return { fetchLegajosActivos, fetchLegajosConCategoria };
}
