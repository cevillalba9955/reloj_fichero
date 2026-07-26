import { loadCategoriasConfig } from '../presentismo/config/categorias-config.js';
import { loadMotivosAusenciaConfig } from '../presentismo/config/motivos-ausencia-config.js';
import { loadVacacionesConfig } from '../presentismo/config/vacaciones-config.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createFileVacacionesRepository } from '../presentismo/adapters/file-vacaciones-repository.js';
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
  // spec 015 — ruta de la config de vacaciones (incremento anual + escala de
  // antigüedad→días), mismo criterio de override que motivosAusenciaConfigPath.
  const vacacionesConfigPath = env.PRESENTISMO_VACACIONES_CONFIG ?? './config/vacaciones.json';
  const controlUrl = env.FICHADAS_CONTROL_URL ?? 'http://127.0.0.1:5006';
  // feature 014 — ruta del `.env` que edita la página de Configuración
  // (contracts/env-config.schema.md). Override solo para tests; en producción
  // siempre es el `.env` de la raíz del proyecto (mismo que carga
  // `--env-file-if-exists` en los scripts de package.json).
  const rutaEnv = env.CONFIGURACION_ENV_PATH ?? '.env';
  // feature 011 (FR-013): granularidad del "Resumen del Período". Variable
  // vacía cae al default (misma convención que FICHADAS_*, spec 002).
  const modoResumenPeriodo = (env.PRESENTISMO_RESUMEN_PERIODO || 'MENSUAL').toUpperCase();
  if (modoResumenPeriodo !== 'MENSUAL' && modoResumenPeriodo !== 'QUINCENAL') {
    throw new Error(
      `presentismo: PRESENTISMO_RESUMEN_PERIODO inválido "${env.PRESENTISMO_RESUMEN_PERIODO}" (se espera MENSUAL o QUINCENAL)`,
    );
  }

  // feature 014 — a diferencia de 007-012 (que cacheaban la config parseada
  // una sola vez al arrancar el proceso), esta feature permite editar
  // categorias.json/motivos-ausencia.json en caliente desde la página de
  // Configuración (US2 FR: el motivo nuevo aparece "en el selector de
  // Justificación"; US3 FR: la categoría editada "se refleja en los próximos
  // cálculos"). Envolver el acceso para releer+re-parsear el archivo en cada
  // llamada evita que el proceso web siga sirviendo una copia en memoria
  // vieja tras un guardado, sin tener que reiniciar `rs956-web` — el costo es
  // un `readFileSync`+parse de un archivo pequeño por llamada, despreciable
  // para el volumen de uso de este sistema. `esquemaSemanal` es la única
  // excepción: se captura una sola vez al construir el servicio (como ya
  // hacía `generarCalendario`, spec 013), consistente con "un período en
  // curso no se recalcula retroactivamente" (spec 014, Edge Cases).
  const categoriasConfigInicial = loadCategoriasConfig(configPath);
  const categoriasConfig = {
    esquemaSemanal: categoriasConfigInicial.esquemaSemanal,
    get modalidades() {
      return loadCategoriasConfig(configPath).modalidades;
    },
    get categorias() {
      return loadCategoriasConfig(configPath).categorias;
    },
    resolverModalidadPorCategoria: (codigo) => loadCategoriasConfig(configPath).resolverModalidadPorCategoria(codigo),
  };
  const motivosAusenciaConfig = {
    listarActivos: () => loadMotivosAusenciaConfig(motivosAusenciaConfigPath).listarActivos(),
    resolverMotivoActivo: (id) => loadMotivosAusenciaConfig(motivosAusenciaConfigPath).resolverMotivoActivo(id),
  };
  // spec 015 — igual criterio que motivosAusenciaConfig: re-lee+re-parsea en
  // cada acceso para que editar config/vacaciones.json a mano tome efecto sin
  // reiniciar el proceso web (SC-005, FR-011).
  const vacacionesConfig = {
    get incrementoAnual() {
      return loadVacacionesConfig(vacacionesConfigPath).incrementoAnual;
    },
    get escalaAntiguedad() {
      return loadVacacionesConfig(vacacionesConfigPath).escalaAntiguedad;
    },
  };
  const repo = createFilePresentismoRepository({ repoDir });
  const vacacionesRepo = createFileVacacionesRepository({ repoDir });
  const logger = createPresentismoLogger({ logDir });
  // 013-reestructurar-data-periodos (FR-004): el padrón es por período
  // (`P<periodo>/padron.json`); ambos proveedores resuelven el mes en curso en
  // cada llamada (research.md §5), nunca un `filePath` fijo cacheado al
  // arrancar el servidor.
  const categoryProvider = createFilePadronCategoryProvider({ repoDir });
  const fichadasProvider = createArchiveFichadasProvider({ repoDir });
  const activeEmployeesProvider = createLocalFileActiveEmployeesProvider({ repoDir });
  const consultarReloj = createConsultarRelojCliente({ baseUrl: controlUrl });
  const service = createCalcularPresentismoService({
    repo,
    categoriasConfig,
    logger,
    fichadasProvider,
    categoryProvider,
    motivosAusenciaConfig,
    vacacionesRepo,
    vacacionesConfig,
    activeEmployeesProvider,
  });

  return {
    repo,
    service,
    categoriasConfig,
    motivosAusenciaConfig,
    vacacionesConfig,
    vacacionesRepo,
    logger,
    repoDir,
    categoryProvider,
    activeEmployeesProvider,
    consultarReloj,
    modoResumenPeriodo,
    // feature 014 — rutas de archivo que necesita configuracion-handlers.js
    // para leer/escribir (env-file.js reescribe rutaEnv; categorias-config.js
    // /motivos-ausencia-config.js re-parsean configPath/motivosAusenciaConfigPath
    // en cada request, ver comentario arriba).
    rutaEnv,
    categoriasConfigPath: configPath,
    motivosAusenciaConfigPath,
    vacacionesConfigPath,
  };
}
