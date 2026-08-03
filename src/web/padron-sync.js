import { join } from 'node:path';
import { readOracleRosterConfig } from '../db/oracle-roster-config.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { createOracleEmployeeCategoryProvider } from '../presentismo/adapters/oracle-employee-category-provider.js';
import { mesActualPeriodo } from '../presentismo/domain/calendario-mes.js';
import { rutaCarpetaPeriodo, ARCHIVO_PADRON } from '../presentismo/domain/periodo-storage.js';
import { guardarSnapshotPadron } from '../presentismo/adapters/file-padron-category-provider.js';

// fix vacaciones — sincroniza el padrón desde Oracle (solo lectura, Principio
// II) y lo persiste como snapshot del período EN CURSO, mismo criterio que
// `sincronizar-padron` del CLI (src/cli/calcular-presentismo.js): Oracle solo
// expone el padrón activo AHORA, nunca el de un período pasado, así que
// siempre se escribe en `P<mesActualPeriodo()>/padron.json`. Se usa tanto al
// iniciar un período nuevo (calendario-handlers.js, best-effort) como desde
// el botón manual de "Sincronizar padrón" (página Configuración).
export function crearSincronizadorPadron({ repoDir, env = process.env, connectionFactory, now = () => new Date() }) {
  return async function sincronizarPadronOracle() {
    const oracleConfig = readOracleRosterConfig(env);
    const repository = createOracleRosterRepository(
      connectionFactory ? { config: oracleConfig, connectionFactory } : { config: oracleConfig },
    );
    const provider = createOracleEmployeeCategoryProvider({ repository });

    const activos = await provider.listar();
    if (activos.length === 0) {
      throw new Error('el padrón Oracle no devolvió legajos activos; no se sobrescribe el snapshot.');
    }

    const periodo = mesActualPeriodo(now());
    const filePath = join(rutaCarpetaPeriodo(repoDir, periodo), ARCHIVO_PADRON);
    const datos = guardarSnapshotPadron({ filePath, empleados: activos, vista: oracleConfig.vistaPadron });
    return { periodo, ...datos };
  };
}
