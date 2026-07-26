import { readFileSync, writeFileSync, renameSync } from 'node:fs';

// Configuración de vacaciones (contracts/vacaciones-config.schema.md,
// spec 015 FR-010/FR-011): fecha de incremento anual + escala de
// antigüedad→días, validada fail-fast. Mismo patrón que
// motivos-ausencia-config.js/categorias-config.js: un archivo inválido o
// incompleto bloquea el incremento automático y la carga de nuevas
// asignaciones, nunca aplica un valor arbitrario.

// Día máximo por mes sin asumir año bisiesto (research.md §5): febrero
// admite 29 porque el día se re-evalúa cada año contra el mes real, nunca se
// fija en 28.
const DIAS_MAX_POR_MES = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };

function fail(msg) {
  throw new Error(`vacaciones-config: ${msg}`);
}

function validarIncrementoAnual(incrementoAnual) {
  if (!incrementoAnual || typeof incrementoAnual !== 'object') {
    fail('"incrementoAnual" debe ser un objeto');
  }
  const { mes, dia } = incrementoAnual;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    fail(`incrementoAnual.mes inválido "${mes}" (se espera 1..12)`);
  }
  const maxDia = DIAS_MAX_POR_MES[mes];
  if (!Number.isInteger(dia) || dia < 1 || dia > maxDia) {
    fail(`incrementoAnual.dia inválido "${dia}" para el mes ${mes} (se espera 1..${maxDia})`);
  }
  return { mes, dia };
}

function validarEscalaAntiguedad(escalaAntiguedad) {
  if (!Array.isArray(escalaAntiguedad) || escalaAntiguedad.length === 0) {
    fail('"escalaAntiguedad" debe ser un array no vacío');
  }
  const tramos = escalaAntiguedad.map((t, idx) => {
    if (!t || typeof t !== 'object') fail(`tramo ${idx} de escalaAntiguedad debe ser un objeto`);
    const { aniosMinimos, dias } = t;
    if (!Number.isInteger(aniosMinimos) || aniosMinimos < 0) {
      fail(`tramo ${idx}: "aniosMinimos" debe ser un entero >= 0`);
    }
    if (!Number.isInteger(dias) || dias <= 0) {
      fail(`tramo ${idx}: "dias" debe ser un entero > 0`);
    }
    return { aniosMinimos, dias };
  });

  if (tramos[0].aniosMinimos !== 0) {
    fail('el primer tramo de "escalaAntiguedad" DEBE tener aniosMinimos: 0');
  }
  for (let i = 1; i < tramos.length; i++) {
    if (tramos[i].aniosMinimos <= tramos[i - 1].aniosMinimos) {
      fail('"escalaAntiguedad" debe estar ordenada estrictamente creciente por aniosMinimos');
    }
  }
  return tramos;
}

// Parsea y valida un objeto de configuración ya deserializado.
export function parseVacacionesConfig(raw) {
  if (!raw || typeof raw !== 'object') fail('la configuración raíz debe ser un objeto');
  const incrementoAnual = validarIncrementoAnual(raw.incrementoAnual);
  const escalaAntiguedad = validarEscalaAntiguedad(raw.escalaAntiguedad);
  return { incrementoAnual, escalaAntiguedad };
}

export function serializarVacacionesConfig(config) {
  return {
    incrementoAnual: { ...config.incrementoAnual },
    escalaAntiguedad: config.escalaAntiguedad.map((t) => ({ ...t })),
  };
}

// Edita la fecha de incremento anual (FR-011). Re-valida con
// parseVacacionesConfig antes de aceptar el cambio: nunca persiste un
// incremento inválido.
export function editarIncrementoAnual(config, { mes, dia }) {
  const raw = serializarVacacionesConfig(config);
  raw.incrementoAnual = { mes, dia };
  return parseVacacionesConfig(raw);
}

// Reemplaza la escala de antigüedad→días completa (FR-011); re-valida igual
// que arriba.
export function editarEscalaAntiguedad(config, tramos) {
  const raw = serializarVacacionesConfig(config);
  raw.escalaAntiguedad = tramos;
  return parseVacacionesConfig(raw);
}

// Escritura atómica (archivo temporal + rename), mismo criterio que
// motivos-ausencia-config.js.
export function saveVacacionesConfig(path, config) {
  const contenido = `${JSON.stringify(serializarVacacionesConfig(config), null, 2)}\n`;
  const rutaTmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(rutaTmp, contenido, 'utf8');
  renameSync(rutaTmp, path);
}

// Carga desde archivo JSON (fail-fast ante ausencia / JSON inválido).
export function loadVacacionesConfig(path) {
  let contenido;
  try {
    contenido = readFileSync(path, 'utf8');
  } catch {
    fail(`no se pudo leer el archivo de configuración "${path}"`);
  }
  let raw;
  try {
    raw = JSON.parse(contenido);
  } catch {
    fail(`el archivo "${path}" no es JSON válido`);
  }
  return parseVacacionesConfig(raw);
}
