import { loadCategoriasConfig } from '../presentismo/config/categorias-config.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createPresentismoLogger } from '../presentismo/logging/presentismo-logger.js';
import { createCalcularPresentismoService } from '../presentismo/service/calcular-presentismo-service.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { readOracleRosterConfig } from '../db/oracle-roster-config.js';
import { createOracleEmployeeCategoryProvider } from '../presentismo/adapters/oracle-employee-category-provider.js';
import {
  createFilePadronCategoryProvider,
  guardarSnapshotPadron,
} from '../presentismo/adapters/file-padron-category-provider.js';
import { createArchiveFichadasProvider } from '../presentismo/adapters/archive-fichadas-provider.js';
import { registrarFichadas, leerExportsDeSesion } from '../presentismo/adapters/file-fichadas-archive.js';
import { Clasificacion } from '../presentismo/domain/calendario-mes.js';
import { parseHoraMinuto, formatHoraMinuto } from '../presentismo/domain/tiempo.js';

// CLI del dominio de presentismo (contracts/cli-presentismo.md).
// Precedencia de configuración: argumento CLI > variable de entorno > default.

// Cargamos el .env en el propio arranque para que las variables de entorno
// (RRHH_ORACLE_* y PRESENTISMO_*) estén disponibles aunque el CLI se invoque
// con `node src/cli/calcular-presentismo.js` directo y no vía
// `npm run presentismo` (que ya aporta --env-file-if-exists=.env). Best-effort:
// si no hay .env, se sigue con variables de entorno reales y defaults.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // No hay .env en el CWD: se usan las variables de entorno del proceso.
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function resolver(argVal, envVar, def) {
  return argVal ?? process.env[envVar] ?? def;
}

function normalizarClasificacion(valor) {
  const v = String(valor).trim().toLowerCase().replace(/\s+/g, '');
  if (v === 'laborable') return Clasificacion.LABORABLE;
  if (v === 'nolaborable') return Clasificacion.NO_LABORABLE;
  if (v === 'feriado') return Clasificacion.FERIADO;
  throw new Error(`clasificación inválida "${valor}" (Laborable | NoLaborable | Feriado)`);
}

function cargarCategoriasConfig(args) {
  const configPath = resolver(args['config'], 'PRESENTISMO_CATEGORIAS_CONFIG', './config/categorias.json');
  return loadCategoriasConfig(configPath);
}

// Construye el proveedor de categoría/padrón Oracle (solo lectura, Principio II).
// Lanza si el entorno RRHH no está configurado; el llamador decide si eso es un
// error duro (listar-padron, plantilla) o best-effort (calcular por legajo).
function construirCategoryProviderOracle() {
  const oracleConfig = readOracleRosterConfig(process.env);
  const repository = createOracleRosterRepository({ config: oracleConfig });
  return createOracleEmployeeCategoryProvider({ repository });
}

function rutaSnapshotPadron(args) {
  const repoDir = resolver(args['repo-dir'], 'PRESENTISMO_REPO_DIR', './data/presentismo');
  return resolver(args['padron-file'], 'PRESENTISMO_PADRON_FILE', `${repoDir}/padron.json`);
}

// Fuente del padrón: 'archivo' (snapshot local, sin DB) u 'oracle' (consulta viva).
// Precedencia: --padron > PRESENTISMO_PADRON > default 'archivo' (Principio VI: se
// opera sobre el snapshot; Oracle se toca solo al sincronizar).
function resolverFuentePadron(args) {
  const fuente = String(resolver(args['padron'], 'PRESENTISMO_PADRON', 'archivo')).toLowerCase();
  if (fuente !== 'archivo' && fuente !== 'oracle') {
    throw new Error(`--padron inválido "${fuente}" (archivo | oracle)`);
  }
  return fuente;
}

// Devuelve el EmployeeCategoryProvider según la fuente elegida. Para 'archivo'
// lee el snapshot local (no depende de la conexión a la DB).
function construirCategoryProvider(args) {
  if (resolverFuentePadron(args) === 'oracle') {
    return construirCategoryProviderOracle();
  }
  return createFilePadronCategoryProvider({ filePath: rutaSnapshotPadron(args) });
}

// Directorio del archivo acumulativo de fichadas por período (fuente del
// cálculo). Default <repo-dir>/fichadas.
function rutaArchivoFichadas(args) {
  const repoDir = resolver(args['repo-dir'], 'PRESENTISMO_REPO_DIR', './data/presentismo');
  return resolver(args['fichadas-archive-dir'], 'PRESENTISMO_FICHADAS_DIR', `${repoDir}/fichadas`);
}

function construirServicio(args, { categoryProvider = null } = {}) {
  const repoDir = resolver(args['repo-dir'], 'PRESENTISMO_REPO_DIR', './data/presentismo');
  const logDir = resolver(args['log-dir'], 'PRESENTISMO_LOG_DIR', './logs');

  const categoriasConfig = cargarCategoriasConfig(args);
  const repo = createFilePresentismoRepository({ repoDir });
  const logger = createPresentismoLogger({ logDir });
  // Las fichadas del cálculo salen del archivo acumulativo por período
  // (poblado con `importar-fichadas`). Si el período no fue importado, el
  // provider devuelve lista vacía y el cálculo procede sin fichadas.
  const fichadasProvider = createArchiveFichadasProvider({ archiveDir: rutaArchivoFichadas(args) });

  return createCalcularPresentismoService({ repo, categoriasConfig, logger, categoryProvider, fichadasProvider });
}

async function cmdGenerarCalendario(args) {
  const periodo = args['periodo'];
  if (!periodo) throw new Error('falta --periodo YYYYMM');
  const svc = construirServicio(args);
  const cal = await svc.generarCalendario(periodo);
  const conteo = cal.dias.reduce((acc, d) => {
    acc[d.clasificacion] = (acc[d.clasificacion] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Calendario ${periodo}: ${cal.dias.length} días`);
  for (const [k, v] of Object.entries(conteo)) console.log(`  ${k}: ${v}`);
}

async function cmdReclasificar(args) {
  const periodo = args['periodo'];
  const fecha = args['fecha'];
  if (!periodo || !fecha || !args['clasificacion']) {
    throw new Error('uso: reclasificar --periodo YYYYMM --fecha YYYY-MM-DD --clasificacion <Laborable|NoLaborable|Feriado> --autor <id>');
  }
  const clasificacion = normalizarClasificacion(args['clasificacion']);
  const svc = construirServicio(args);
  await svc.reclasificarDia(periodo, fecha, clasificacion, args['autor'] ?? null);
  console.log(`Día ${fecha} reclasificado como ${clasificacion} en ${periodo}`);
}

function imprimirResumenTabla(r) {
  if (r.sinCalculo) {
    console.log(`legajo ${r.legajo} [${r.periodo}]: SIN CÁLCULO — ${r.anomalias.join('; ')}`);
    return;
  }
  const rev = (r.jornadas ?? []).some((j) => j.requiereRevision) ? ' (revisar)' : '';
  console.log(
    `legajo ${r.legajo} [${r.periodo}/${r.tramo}] ${r.modalidad}: ` +
      `trabajadas ${formatHoraMinuto(r.horasTrabajadas)} / esperadas ${formatHoraMinuto(r.horasEsperadas)} ` +
      `(saldo ${r.saldo >= 0 ? '+' : '-'}${formatHoraMinuto(Math.abs(r.saldo))})${rev}`
  );
  const { completas, incompletas, sinFichadas, laborables } = r.conteos;
  console.log(`   laborables ${laborables} · completas ${completas} · incompletas ${incompletas} · sin fichadas ${sinFichadas}`);
  if (r.fichadasFueraDeCalendario.length > 0) {
    console.log(`   fichadas fuera de calendario: ${r.fichadasFueraDeCalendario.length} día(s)`);
  }
  if (r.anomalias.length > 0) console.log(`   anomalías: ${JSON.stringify(r.anomalias)}`);
}

async function cmdCalcular(args) {
  const periodo = args['periodo'];
  if (!periodo) throw new Error('falta --periodo YYYYMM');
  const formato = resolver(args['formato'], null, 'json');

  // La categoría del empleado sale del padrón (snapshot local por defecto, u
  // Oracle con --padron oracle). Para un legajo puntual es best-effort (si el
  // padrón no está disponible, se calcula sin categoría → anomalía). Para la
  // plantilla completa el padrón es obligatorio: es de donde sale la lista.
  let categoryProvider = null;
  try {
    categoryProvider = construirCategoryProvider(args);
  } catch (err) {
    console.error(`Aviso: padrón no disponible (${err.message}).`);
  }
  const svc = construirServicio(args, { categoryProvider });

  let resultados;
  if (args['legajo']) {
    resultados = await svc.calcularEmpleado(Number(args['legajo']), periodo);
  } else {
    if (!categoryProvider) {
      throw new Error(
        'calcular sin --legajo (plantilla completa) requiere el padrón disponible. ' +
          'Sincronizalo con `sincronizar-padron`, usá --padron oracle, o indicá --legajo N.'
      );
    }
    const activos = await categoryProvider.listar();
    if (activos.length === 0) throw new Error('el padrón no devolvió legajos activos.');
    resultados = await svc.calcularPlantilla(periodo, activos.map((e) => e.legajo));
  }

  if (formato === 'tabla') {
    for (const r of resultados) {
      imprimirResumenTabla(r);
      if (args['detalle'] && r.jornadas) imprimirDetalle(r.jornadas);
    }
  } else {
    console.log(JSON.stringify(resultados, null, 2));
  }
}

// Lista el padrón de empleados activos con su categoría (solo lectura). Cruza
// con categorias.json para marcar si cada categoría está configurada y con qué
// modalidad, así se detectan categorías del padrón sin mapear (FR-035).
async function cmdListarPadron(args) {
  const formato = resolver(args['formato'], null, 'tabla');
  const categoriasConfig = cargarCategoriasConfig(args);

  const categoryProvider = construirCategoryProvider(args);
  const activos = await categoryProvider.listar();
  const filas = activos.map(({ legajo, codigoCategoria, nombre }) => {
    const modalidad = codigoCategoria
      ? categoriasConfig.resolverModalidadPorCategoria(codigoCategoria)
      : null;
    return {
      legajo,
      nombre: nombre ?? null,
      categoria: codigoCategoria,
      modalidad: modalidad ? modalidad.tipo : null,
      configurada: Boolean(modalidad),
    };
  });

  if (formato === 'json') {
    console.log(JSON.stringify(filas, null, 2));
    return;
  }

  console.log(`Padrón activo: ${filas.length} legajo(s)`);
  for (const f of filas) {
    const nom = (f.nombre ?? '—').padEnd(24);
    const cat = f.categoria ?? '(sin categoría)';
    const estado = f.configurada ? `${f.modalidad}` : 'SIN CONFIGURAR';
    console.log(`  ${String(f.legajo).padStart(8)}  ${nom} ${cat.padEnd(16)} ${estado}`);
  }
  const sinConfigurar = filas.filter((f) => !f.configurada).length;
  if (sinConfigurar > 0) {
    console.log(`  ⚠ ${sinConfigurar} legajo(s) con categoría ausente o no configurada en categorias.json`);
  }
}

// Consulta el padrón Oracle (solo lectura) UNA vez y lo guarda como snapshot
// local, para que el resto de los comandos operen sin conexión a la DB
// (Principio VI). Es el único comando que exige Oracle configurado.
async function cmdSincronizarPadron(args) {
  const oracleConfig = readOracleRosterConfig(process.env);
  const repository = createOracleRosterRepository({ config: oracleConfig });
  const provider = createOracleEmployeeCategoryProvider({ repository });

  const activos = await provider.listar();
  if (activos.length === 0) throw new Error('el padrón Oracle no devolvió legajos activos; no se sobrescribe el snapshot.');

  const filePath = rutaSnapshotPadron(args);
  const datos = guardarSnapshotPadron({ filePath, empleados: activos, vista: oracleConfig.vistaPadron });
  console.log(`Padrón sincronizado: ${datos.empleados.length} legajo(s) → ${filePath}`);
  console.log(`  generado ${datos.generadoEn}`);
}

// Importa las fichadas del período desde los exports de sesión de la feature
// 001/002 (fichadas-*.json en --fichadas-dir, default ./output) y las registra
// —deduplicadas por rawHex, con rawHex, para trazabilidad— en el archivo
// acumulativo del período. Es la "consulta de fichadas" cuyo registro pide el
// requerimiento; `calcular` luego lee de ese acumulado.
async function cmdImportarFichadas(args) {
  const periodo = args['periodo'];
  if (!periodo || !/^\d{6}$/.test(String(periodo))) throw new Error('falta --periodo YYYYMM válido');
  const inputDir = resolver(args['fichadas-dir'], 'FICHADAS_OUTPUT_DIR', './output');
  const archiveDir = rutaArchivoFichadas(args);

  const { registros, archivos, errores } = leerExportsDeSesion({ inputDir });
  const prefijoFecha = `${String(periodo).slice(0, 4)}-${String(periodo).slice(4, 6)}`;
  const delPeriodo = registros.filter((r) => typeof r.fecha === 'string' && r.fecha.startsWith(prefijoFecha));
  const sinFecha = registros.filter((r) => r.fecha == null).length;

  const { agregadas, duplicadas, total } = registrarFichadas({ archiveDir, periodo, fichadas: delPeriodo });

  // Registro correlacionable en el log (sin datos crudos, Principio V).
  const logDir = resolver(args['log-dir'], 'PRESENTISMO_LOG_DIR', './logs');
  createPresentismoLogger({ logDir }).evento('fichadas_importadas', {
    periodo,
    archivos,
    leidas: delPeriodo.length,
    agregadas,
    duplicadas,
    total,
  });

  console.log(`Fichadas importadas al período ${periodo}: +${agregadas} nuevas (${duplicadas} duplicadas) → ${total} en total`);
  console.log(`  origen: ${archivos} archivo(s) de sesión en ${inputDir} → ${archiveDir}/${periodo}.json`);
  if (sinFecha > 0) console.log(`  ⚠ ${sinFecha} fichada(s) sin fecha no se pudieron imputar a un período (omitidas)`);
  if (errores.length > 0) console.log(`  ⚠ ${errores.length} archivo(s) ilegibles omitidos: ${errores.join(', ')}`);
}

// US4: detalle por jornada (entrada/salida real y efectiva, no usadas, motivo).
function imprimirDetalle(jornadas) {
  for (const j of jornadas) {
    if (j.estado === 'No aplica') continue;
    const partes = [`${j.fecha} ${j.estado}`, `total ${formatHoraMinuto(j.totalDiario)}`];
    if (j.entrada) partes.push(`entrada ${formatHoraMinuto(j.entrada.hora)}→${formatHoraMinuto(j.entradaEfectiva)}`);
    if (j.salida) partes.push(`salida ${formatHoraMinuto(j.salida.hora)}→${formatHoraMinuto(j.salidaEfectiva)}`);
    if (j.sugerencia != null) partes.push(`sugerencia ${formatHoraMinuto(j.sugerencia)}`);
    if (j.descuentoPausas) partes.push(`pausas -${formatHoraMinuto(j.descuentoPausas)}`);
    if (j.correccionVigente) partes.push('corregida');
    if (j.requiereRevision) partes.push('REVISAR');
    if (j.motivo) partes.push(`(${j.motivo})`);
    console.log(`   · ${partes.join(' · ')}`);
  }
}

async function cmdCorreccion(args) {
  const { periodo, fecha } = args;
  const legajo = Number(args['legajo']);
  if (!periodo || !fecha || !Number.isInteger(legajo)) {
    throw new Error('uso: correccion --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--horas HH:MM | --revertir) --autor <id> --motivo "<texto>"');
  }
  const svc = construirServicio(args);
  if (args['revertir']) {
    await svc.revertirCorreccion({ periodo, legajo, fecha, autor: args['autor'] ?? null });
    console.log(`Corrección revertida: legajo ${legajo} ${fecha}`);
    return;
  }
  if (!args['horas']) throw new Error('falta --horas HH:MM (o --revertir)');
  if (!args['motivo']) throw new Error('el motivo es obligatorio (--motivo)');
  const valorCorregido = parseHoraMinuto(args['horas']);
  await svc.cargarCorreccion({ periodo, legajo, fecha, valorCorregido, autor: args['autor'] ?? null, motivo: args['motivo'] });
  console.log(`Corrección cargada: legajo ${legajo} ${fecha} → ${args['horas']}`);
}

async function cmdPausa(args) {
  const { periodo, fecha } = args;
  const legajo = Number(args['legajo']);
  if (!periodo || !Number.isInteger(legajo)) {
    throw new Error('uso: pausa --periodo YYYYMM --legajo N --fecha YYYY-MM-DD (--desde HH:MM --hasta HH:MM | --revertir <id>) --autor <id> --motivo "<texto>"');
  }
  const svc = construirServicio(args);
  if (args['revertir']) {
    const id = typeof args['revertir'] === 'string' ? args['revertir'] : null;
    if (!id) throw new Error('--revertir requiere el id de la pausa');
    await svc.revertirPausa({ periodo, id, autor: args['autor'] ?? null });
    console.log(`Pausa revertida: ${id}`);
    return;
  }
  if (!fecha || !args['desde'] || !args['hasta']) throw new Error('faltan --fecha, --desde y --hasta');
  if (!args['motivo']) throw new Error('el motivo es obligatorio (--motivo)');
  const id = await svc.cargarPausa({
    periodo,
    legajo,
    fecha,
    desde: parseHoraMinuto(args['desde']),
    hasta: parseHoraMinuto(args['hasta']),
    autor: args['autor'] ?? null,
    motivo: args['motivo'],
  });
  console.log(`Pausa cargada (${id}): legajo ${legajo} ${fecha} ${args['desde']}–${args['hasta']}`);
}

const COMANDOS = {
  'generar-calendario': cmdGenerarCalendario,
  reclasificar: cmdReclasificar,
  calcular: cmdCalcular,
  'listar-padron': cmdListarPadron,
  'sincronizar-padron': cmdSincronizarPadron,
  'importar-fichadas': cmdImportarFichadas,
  correccion: cmdCorreccion,
  pausa: cmdPausa,
};

async function main() {
  const [, , subcomando, ...resto] = process.argv;
  const handler = COMANDOS[subcomando];
  if (!handler) {
    console.error(`Subcomando desconocido: ${subcomando ?? '(ninguno)'}`);
    console.error(`Disponibles: ${Object.keys(COMANDOS).join(', ')}`);
    process.exit(1);
  }
  try {
    await handler(parseArgs(resto));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
