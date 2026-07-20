import { loadCategoriasConfig } from '../presentismo/config/categorias-config.js';
import { loadMotivosAusenciaConfig } from '../presentismo/config/motivos-ausencia-config.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createPresentismoLogger } from '../presentismo/logging/presentismo-logger.js';
import { createCalcularPresentismoService } from '../presentismo/service/calcular-presentismo-service.js';
import { createFilePadronCategoryProvider } from '../presentismo/adapters/file-padron-category-provider.js';
import { createArchiveFichadasProvider } from '../presentismo/adapters/archive-fichadas-provider.js';
import { createLocalFileActiveEmployeesProvider } from '../roster/local-file-active-employees-provider.js';
import { createConsultarRelojCliente } from '../presentismo/service/consultar-reloj-cliente.js';

// feature 007 — Cableado del backend web. Resuelve configuración desde el
// entorno (sin argumentos CLI) con la misma precedencia y defaults que
// src/cli/calcular-presentismo.js, y construye el repositorio + servicio de
// presentismo (file-based, sin Oracle: esta feature no toca la DB ni el reloj).
//
// feature 010 — se agregan los puertos que "Fichadas de hoy" necesita y que el
// contexto web no cableaba: el padrón local (empleados esperados + nombre +
// categoría, snapshot de 004, research.md §5), el archivo acumulativo de
// fichadas del período, y el cliente HTTP local hacia el servidor de control
// del servicio de fichadas (research.md §4). Sigue sin Oracle y sin reloj.
export function crearContextoWeb(env = process.env) {
  const repoDir = env.PRESENTISMO_REPO_DIR ?? './data/presentismo';
  const logDir = env.PRESENTISMO_LOG_DIR ?? './logs';
  const configPath = env.PRESENTISMO_CATEGORIAS_CONFIG ?? './config/categorias.json';
  const motivosAusenciaConfigPath = env.PRESENTISMO_MOTIVOS_AUSENCIA_CONFIG ?? './config/motivos-ausencia.json';
  const padronFile = env.PRESENTISMO_PADRON_FILE ?? `${repoDir}/padron.json`;
  const fichadasDir = env.PRESENTISMO_FICHADAS_DIR ?? `${repoDir}/fichadas`;
  const controlUrl = env.FICHADAS_CONTROL_URL ?? 'http://127.0.0.1:5006';
  // feature 011 (FR-013): granularidad del "Resumen del Período". Variable
  // vacía cae al default (misma convención que FICHADAS_*, spec 002).
  const modoResumenPeriodo = (env.PRESENTISMO_RESUMEN_PERIODO || 'MENSUAL').toUpperCase();
  if (modoResumenPeriodo !== 'MENSUAL' && modoResumenPeriodo !== 'QUINCENAL') {
    throw new Error(
      `presentismo: PRESENTISMO_RESUMEN_PERIODO inválido "${env.PRESENTISMO_RESUMEN_PERIODO}" (se espera MENSUAL o QUINCENAL)`,
    );
  }

  const categoriasConfig = loadCategoriasConfig(configPath);
  const motivosAusenciaConfig = loadMotivosAusenciaConfig(motivosAusenciaConfigPath);
  const repo = createFilePresentismoRepository({ repoDir });
  const logger = createPresentismoLogger({ logDir });
  const categoryProvider = createFilePadronCategoryProvider({ filePath: padronFile });
  const fichadasProvider = createArchiveFichadasProvider({ archiveDir: fichadasDir });
  const activeEmployeesProvider = createLocalFileActiveEmployeesProvider({ filePath: padronFile });
  const consultarReloj = createConsultarRelojCliente({ baseUrl: controlUrl });
  const service = createCalcularPresentismoService({
    repo,
    categoriasConfig,
    logger,
    fichadasProvider,
    categoryProvider,
    motivosAusenciaConfig,
  });

  return {
    repo,
    service,
    categoriasConfig,
    motivosAusenciaConfig,
    logger,
    repoDir,
    categoryProvider,
    activeEmployeesProvider,
    consultarReloj,
    modoResumenPeriodo,
  };
}
