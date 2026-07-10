import { loadCategoriasConfig } from '../presentismo/config/categorias-config.js';
import { createFilePresentismoRepository } from '../presentismo/adapters/file-presentismo-repository.js';
import { createPresentismoLogger } from '../presentismo/logging/presentismo-logger.js';
import { createCalcularPresentismoService } from '../presentismo/service/calcular-presentismo-service.js';
import { createOracleRosterRepository } from '../db/oracle-roster-repository.js';
import { readOracleRosterConfig } from '../db/oracle-roster-config.js';
import { createOracleEmployeeCategoryProvider } from '../presentismo/adapters/oracle-employee-category-provider.js';
import { Clasificacion } from '../presentismo/domain/calendario-mes.js';
import { parseHoraMinuto, formatHoraMinuto } from '../presentismo/domain/tiempo.js';

// CLI del dominio de presentismo (contracts/cli-presentismo.md).
// Precedencia de configuración: argumento CLI > variable de entorno > default.

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

function construirServicio(args, { intentarOracle = false } = {}) {
  const configPath = resolver(args['config'], 'PRESENTISMO_CATEGORIAS_CONFIG', './config/categorias.json');
  const repoDir = resolver(args['repo-dir'], 'PRESENTISMO_REPO_DIR', './data/presentismo');
  const logDir = resolver(args['log-dir'], 'PRESENTISMO_LOG_DIR', './logs');

  const categoriasConfig = loadCategoriasConfig(configPath);
  const repo = createFilePresentismoRepository({ repoDir });
  const logger = createPresentismoLogger({ logDir });

  // La categoría del empleado se lee del padrón Oracle (solo lectura). Se
  // intenta solo cuando hace falta (calcular) y de forma best-effort: si el
  // entorno RRHH no está configurado, se avisa y se calcula sin categoría.
  let categoryProvider = null;
  if (intentarOracle) {
    try {
      const oracleConfig = readOracleRosterConfig(process.env);
      const repository = createOracleRosterRepository({ config: oracleConfig });
      categoryProvider = createOracleEmployeeCategoryProvider({ repository });
    } catch (err) {
      console.error(`Aviso: categoría desde Oracle no disponible (${err.message}).`);
    }
  }

  return createCalcularPresentismoService({ repo, categoriasConfig, logger, categoryProvider });
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
  const svc = construirServicio(args, { intentarOracle: true });

  if (!args['legajo']) {
    throw new Error(
      'calcular sin --legajo (plantilla completa) requiere la lista de legajos activos del padrón; ' +
        'por ahora indicá --legajo N. El cálculo de plantilla está disponible vía la API del servicio.'
    );
  }
  const resultados = await svc.calcularEmpleado(Number(args['legajo']), periodo);
  if (formato === 'tabla') {
    for (const r of resultados) {
      imprimirResumenTabla(r);
      if (args['detalle'] && r.jornadas) imprimirDetalle(r.jornadas);
    }
  } else {
    console.log(JSON.stringify(resultados, null, 2));
  }
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
  const svc = construirServicio(args, { intentarOracle: false });
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
  const svc = construirServicio(args, { intentarOracle: false });
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
