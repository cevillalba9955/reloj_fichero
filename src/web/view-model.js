import { parsePeriodo, periodoAnterior, periodoSiguiente } from '../presentismo/domain/calendario-mes.js';
import { recortar, Tramo } from '../presentismo/domain/periodo-liquidacion.js';
import { formatHoraMinuto } from '../presentismo/domain/tiempo.js';

// feature 007 — Armado de las proyecciones de presentación (view-models) que la
// API entrega al frontend. Deriva todo del dominio de presentismo (feature 004);
// NO expone datos personales, legajos ni fichadas (FR-014). Ver data-model.md.

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const RESALTADO = {
  Laborable: 'habil',
  'No Laborable': 'no-laborable',
  Feriado: 'feriado',
};

// domingo=0 .. sabado=6 (UTC), consistente con calendario-mes/categorias-config.
function diaSemanaDe(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Fecha "hoy" del servidor en hora local del establecimiento (YYYY-MM-DD).
export function hoyLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Período 'YYYYMM' del mes actual según el reloj del servidor (feature 008).
export function mesActualPeriodo(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Calcula la frontera generable (feature 008): los períodos habilitados para
// generar ahora, garantizando contigüidad (sin tope de mes futuro: corrección
// 2026-07-17, ver research.md D4).
// - Sin períodos: solo el mes semilla (mesActual) (FR-005).
// - Con períodos: min-1 (backfill) y max+1 siempre (FR-002/FR-003).
// `periodos` puede venir en cualquier orden; se usan su mínimo y máximo.
export function calcularFronteraGenerable({ periodos = [], mesActual }) {
  if (periodos.length === 0) return [mesActual];
  const ordenados = [...periodos].sort();
  const min = ordenados[0];
  const max = ordenados[ordenados.length - 1];
  return [periodoAnterior(min), periodoSiguiente(max)].sort();
}

// La leyenda: una clave por distinción visual (FR-006). Texto legible garantiza
// que cada clave tenga significado sin depender del color (FR-004).
function construirLeyenda() {
  return [
    { clave: 'habil', etiqueta: 'Hábil', descripcion: 'Día laborable' },
    { clave: 'no-laborable', etiqueta: 'No laborable', descripcion: 'No aporta jornada' },
    { clave: 'feriado', etiqueta: 'Feriado', descripcion: 'Pago, no se trabaja' },
    { clave: 'hoy', etiqueta: 'Hoy', descripcion: 'Fecha actual' },
    { clave: 'periodo-activo', etiqueta: 'Período activo', descripcion: 'Días del período en curso' },
  ];
}

// Deriva el período de liquidación activo del mes: por defecto el mes completo
// (Tramo.MES), institucional (research §4). Devuelve la proyección + el set de
// fechas que lo componen para marcar `enPeriodoActivo` en cada día.
function periodoActivoDe(calendario, anio, mes) {
  const recorte = recortar(calendario, Tramo.MES);
  const fechas = recorte.dias.map((d) => d.fecha);
  if (fechas.length === 0) {
    return { periodoActivo: null, fechasActivas: new Set() };
  }
  const periodoActivo = {
    etiqueta: `${MESES[mes - 1]} ${anio}`,
    tramo: Tramo.MES,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
  };
  return { periodoActivo, fechasActivas: new Set(fechas) };
}

// feature 010 — FilaFichadaHoy (data-model.md): proyección por empleado del día
// en curso. Horas SIEMPRE en 'HH:MM' hacia el cliente (nunca minutos crudos);
// la corrección vigente de entrada/salida prevalece sobre la fichada real
// (FR-009). `horasTrabajadas` en minutos, mismo formato que `totalDiario` de
// 004. Sin datos biométricos ni rawHex (Principio V, FR-015).
export function construirFilaFichadaHoy({ legajo, nombre = null, jornada = null, situacion, anomalias = [] }) {
  const correccion = jornada?.correccionVigente ? jornada.correccion : null;
  const entradaMin = correccion?.entradaCorregida ?? jornada?.entrada?.hora ?? null;
  const salidaMin = correccion?.salidaCorregida ?? jornada?.salida?.hora ?? null;
  return {
    legajo,
    nombre,
    entrada: entradaMin != null ? formatHoraMinuto(entradaMin) : null,
    salida: salidaMin != null ? formatHoraMinuto(salidaMin) : null,
    horasTrabajadas: jornada?.totalDiario ?? 0,
    situacion,
    correccionVigente: Boolean(jornada?.correccionVigente),
    pausas: (jornada?.pausas ?? [])
      .filter((p) => p.vigente !== false)
      .map((p) => ({
        desde: formatHoraMinuto(p.desde),
        hasta: formatHoraMinuto(p.hasta),
        tipo: p.tipo ?? 'intermedia',
        motivo: p.motivo,
      })),
    anomalias,
  };
}

// feature 010 — VistaFichadasHoy (data-model.md): lo que devuelve
// GET /api/fichadas-hoy. `filas` es la salida de service.calcularHoy con el
// `nombre` del padrón ya mezclado por el handler.
export function construirVistaFichadasHoy({ fecha, periodo, diaClasificacion, filas = [] }) {
  return {
    fecha,
    periodo,
    diaClasificacion,
    empleados: filas.map(construirFilaFichadaHoy),
  };
}

// Construye la VistaCalendarioMes. `periodos` es la lista de YYYYMM generados
// (para `esUltimoGenerado`); `hoy` es la fecha del servidor (YYYY-MM-DD).
export function construirVistaCalendario({ calendario, periodos = [], hoy = hoyLocal() }) {
  const { anio, mes } = parsePeriodo(calendario.periodo);
  const ultimo = periodos.length > 0 ? [...periodos].sort().at(-1) : null;
  const { periodoActivo, fechasActivas } = periodoActivoDe(calendario, anio, mes);
  const hoyEnMes = typeof hoy === 'string' && hoy.startsWith(`${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}`);

  const dias = calendario.dias.map((d) => ({
    fecha: d.fecha,
    dd: d.dd,
    diaSemana: diaSemanaDe(d.fecha),
    clasificacion: d.clasificacion,
    reclasificadoManual: Boolean(d.reclasificadoManual),
    esHoy: hoyEnMes && d.fecha === hoy,
    enPeriodoActivo: fechasActivas.has(d.fecha),
    resaltado: RESALTADO[d.clasificacion] ?? 'no-laborable',
  }));

  return {
    periodo: calendario.periodo,
    anio,
    mes,
    esUltimoGenerado: calendario.periodo === ultimo,
    hoy: hoyEnMes ? hoy : null,
    periodoActivo,
    leyenda: construirLeyenda(),
    dias,
  };
}
