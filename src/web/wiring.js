import { loadCategoriasConfig } from '../presentismo/config/categorias-config.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createPresentismoLogger } from '../presentismo/logging/presentismo-logger.js';
import { createCalcularPresentismoService } from '../presentismo/service/calcular-presentismo-service.js';

// feature 007 — Cableado del backend web. Resuelve configuración desde el
// entorno (sin argumentos CLI) con la misma precedencia y defaults que
// src/cli/calcular-presentismo.js, y construye el repositorio + servicio de
// presentismo (file-based, sin Oracle: esta feature no toca la DB ni el reloj).
export function crearContextoWeb(env = process.env) {
  const repoDir = env.PRESENTISMO_REPO_DIR ?? './data/presentismo';
  const logDir = env.PRESENTISMO_LOG_DIR ?? './logs';
  const configPath = env.PRESENTISMO_CATEGORIAS_CONFIG ?? './config/categorias.json';

  const categoriasConfig = loadCategoriasConfig(configPath);
  const repo = createFilePresentismoRepository({ repoDir });
  const logger = createPresentismoLogger({ logDir });
  const service = createCalcularPresentismoService({ repo, categoriasConfig, logger });

  return { repo, service, categoriasConfig, logger, repoDir };
}
