// Smoke test STANDALONE contra la base Oracle/RRHH real (feature 003).
//
// Ejecuta el camino real del padrón —el `defaultConnectionFactory` de
// src/db/oracle-roster-repository.js que hace `import('oracledb')` +
// getConnection— que la suite automatizada (`npm test`) nunca toca por diseño
// (research.md §8: la suite no depende de infraestructura).
//
// Uso:  npm run smoke:oracle
//   con las variables RRHH_ORACLE_* seteadas (ver contracts/env-config-contract.md
//   y .env.example). Usuario Oracle de SOLO lectura (Constitución, Principio II).
//
// NO forma parte de `npm test`: vive en scripts/, que `node --test` no escanea.
//
// Pura "cola": reutiliza los módulos de la feature 003, no agrega lógica nueva.

import { pathToFileURL } from 'node:url';
import { readOracleRosterConfig, ConfiguracionPadronInvalidaError } from '../src/db/oracle-roster-config.js';
import { createOracleRosterRepository } from '../src/db/oracle-roster-repository.js';
import { createOracleActiveEmployeesProvider } from '../src/roster/oracle-active-employees-provider.js';
import { createDailyCachedActiveEmployeesProvider } from '../src/roster/daily-cached-active-employees-provider.js';
import { createRosterFetchLogger } from '../src/logging/roster-fetch-logger.js';
import { RosterNoDisponibleError } from '../src/roster/active-employees-provider.js';

const SC004_UMBRAL_MS = 5000; // SC-004: obtención de ≤500 legajos en < 5s.

export async function runSmoke({ env = process.env, logDir = './logs', print = console.log, error = console.error } = {}) {
  // 1) Config fail-fast (FR-004/FR-005). El mensaje ya nombra las variables
  //    faltantes sin exponer valores; exit 4, igual que el CLI.
  let config;
  try {
    config = readOracleRosterConfig(env);
  } catch (err) {
    if (err instanceof ConfiguracionPadronInvalidaError) {
      error(err.message);
      return 4;
    }
    throw err;
  }

  // 2) Cadena real con un contador alrededor del repositorio, para verificar
  //    FR-014 y dar buen diagnóstico ante fallos.
  const serviceId = 'smoke-oracle';
  const logger = createRosterFetchLogger({ serviceId, logDir });
  const realRepo = createOracleRosterRepository({ config });

  let fetches = 0;
  let lastRawCount = null;
  const countingRepo = {
    async fetchLegajosActivos() {
      fetches += 1;
      const rows = await realRepo.fetchLegajosActivos();
      lastRawCount = rows.length;
      return rows;
    },
  };

  const inner = createOracleActiveEmployeesProvider({ repository: countingRepo, logger });
  const provider = createDailyCachedActiveEmployeesProvider({ inner, logger });

  print('Smoke test padrón Oracle/RRHH');
  print(`  Vista: ${config.vistaPadron}  |  columna: ${config.columnaLegajo}  |  timeout: ${config.timeoutMs}ms`);
  print(`  Log de obtenciones: ${logger.logFilePath}`);
  // Nunca imprimimos user / password / connect string completo (SC-002/Principio V).

  // 3) Primera consulta: mide latencia (SC-004).
  const t0 = Date.now();
  let empleados;
  try {
    empleados = await provider.getActiveEmployees();
  } catch (err) {
    const duracionMs = Date.now() - t0;
    if (err instanceof RosterNoDisponibleError) {
      if (lastRawCount === null) {
        error(`FALLO: no se pudo consultar la fuente (categoría: ${err.categoria ?? 'desconocida'}) tras ${duracionMs}ms.`);
      } else if (lastRawCount === 0) {
        error(`FALLO: la vista devolvió 0 filas → padrón vacío, tratado como fuente no disponible (FR-011).`);
      } else {
        error(`FALLO: la vista devolvió ${lastRawCount} fila(s) pero ninguna es un legajo válido tras normalizar (FR-012).`);
      }
      return 1;
    }
    error(`FALLO inesperado tras ${duracionMs}ms: ${err.message}`);
    return 1;
  }
  const duracionMs = Date.now() - t0;

  const muestra = empleados.slice(0, 5).map((e) => e.legajo);
  print(`  OK: ${empleados.length} legajo(s) activo(s) obtenidos en ${duracionMs}ms.`);
  print(`  Muestra (primeros ${muestra.length}): ${muestra.join(', ')}${empleados.length > muestra.length ? ', …' : ''}`);

  let ok = true;

  // 4) FR-014: la segunda llamada del mismo día NO debe volver a consultar Oracle.
  await provider.getActiveEmployees();
  if (fetches === 1) {
    print('  FR-014 OK: una sola consulta a la fuente (la 2ª llamada usó el snapshot del día).');
  } else {
    error(`  FR-014 FALLO: se esperaba 1 consulta a la fuente, hubo ${fetches}.`);
    ok = false;
  }

  // 5) SC-004: umbral de latencia.
  if (duracionMs >= SC004_UMBRAL_MS) {
    error(`  SC-004 FALLO: la obtención tardó ${duracionMs}ms (≥ ${SC004_UMBRAL_MS}ms objetivo).`);
    ok = false;
  } else {
    print(`  SC-004 OK: ${duracionMs}ms < ${SC004_UMBRAL_MS}ms.`);
  }

  print(ok ? 'Smoke test: ÉXITO.' : 'Smoke test: FALLÓ (ver detalles arriba).');
  return ok ? 0 : 1;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runSmoke()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`Error fatal del smoke test: ${err.message}`);
      process.exitCode = 1;
    });
}
