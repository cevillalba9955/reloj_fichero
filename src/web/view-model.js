import { parsePeriodo, periodoAnterior, periodoSiguiente, mesActualPeriodo, hoyLocal } from '../presentismo/domain/calendario-mes.js';
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
// Período 'YYYYMM' del mes actual según el reloj del servidor (feature 008).
// 013-reestructurar-data-periodos: reexportan el único punto de verdad de
// calendario-mes.js (dedup, research.md nota de la fase US2).
export { hoyLocal, mesActualPeriodo };

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
    // feature 012: motivo vigente del día (si lo hay) y señalado de revisión
    // cuando llegaron fichadas después de justificar (FR-010/FR-011).
    justificacion: jornada?.justificacion
      ? {
          motivoId: jornada.justificacion.motivoId,
          etiquetaMotivo: jornada.justificacion.etiquetaMotivo,
          tipoPago: jornada.justificacion.tipoPago,
        }
      : null,
    requiereJustificacionRevision: Boolean(jornada?.requiereJustificacionRevision),
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

// iteración 2 — Período 'YYYYMM' de una fecha 'YYYY-MM-DD'.
function periodoDeFecha(fecha) {
  return fecha.slice(0, 4) + fecha.slice(5, 7);
}

// Día vecino de una fecha ISO (delta en días, UTC para evitar saltos de DST).
function diaVecino(fecha, delta) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

// feature 010, iteración 2 (research.md §6) — Predicado ÚNICO de navegabilidad:
// fecha <= hoy (nunca futuro, FR-017) y período con calendario generado (la
// materialización operativa de "período de liquidación abierto" mientras el
// cierre de período del Principio VI no exista; cuando exista, la condición
// "y no cerrado" se agrega SOLO acá).
export function fechaNavegable(fecha, { hoy, periodos = [] }) {
  return fecha <= hoy && periodos.includes(periodoDeFecha(fecha));
}

// Bloque `navegacion` de la VistaFichadasHoy (data-model.md): la UI no
// re-deriva la regla — navega solo a las fechas que el servidor le ofrece.
export function construirNavegacion({ fecha, hoy, periodos = [] }) {
  const anterior = diaVecino(fecha, -1);
  const siguiente = diaVecino(fecha, 1);
  return {
    anterior: fechaNavegable(anterior, { hoy, periodos }) ? anterior : null,
    siguiente: fechaNavegable(siguiente, { hoy, periodos }) ? siguiente : null,
    esHoy: fecha === hoy,
  };
}

// feature 010 — VistaFichadasHoy (data-model.md): lo que devuelve
// GET /api/fichadas-hoy. `filas` es la salida de service.calcularHoy con el
// `nombre` del padrón ya mezclado por el handler. `hoy`/`periodos` alimentan
// el bloque `navegacion` (iteración 2).
export function construirVistaFichadasHoy({ fecha, periodo, diaClasificacion, filas = [], hoy = hoyLocal(), periodos = [] }) {
  return {
    fecha,
    periodo,
    diaClasificacion,
    navegacion: construirNavegacion({ fecha, hoy, periodos }),
    empleados: filas.map(construirFilaFichadaHoy),
  };
}

// feature 011 — VistaResumenPeriodo / FilaResumenPeriodo (data-model.md):
// lo que devuelve GET /api/resumen-periodo. `filas` es la salida de
// service.calcularResumenPeriodo con el `nombre` ya mezclado por el handler.
export function construirVistaResumenPeriodo({ periodo, periodos, filas = [] }) {
  return {
    periodo,
    periodos,
    filas: filas.map((f) =>
      f.anomalia
        ? {
            legajo: f.legajo,
            nombre: f.nombre ?? null,
            horasTrabajadas: 0,
            completas: 0,
            incompletas: 0,
            ausencias: 0,
            llegadasTarde: 0,
            retirosAnticipados: 0,
            correcciones: 0,
            feriado: 0,
            licencia: 0,
            anomalia: f.anomalia,
          }
        : {
            legajo: f.legajo,
            nombre: f.nombre ?? null,
            horasTrabajadas: f.horasTrabajadas,
            completas: f.completas,
            incompletas: f.incompletas,
            ausencias: f.ausencias,
            llegadasTarde: f.llegadasTarde,
            retirosAnticipados: f.retirosAnticipados,
            correcciones: f.correcciones,
            // feature 012 (FR-012): días Feriado y días con Justificación
            // Paga del período, junto a los 7 acumulados existentes.
            feriado: f.feriado ?? 0,
            licencia: f.licencia ?? 0,
            anomalia: null,
          },
    ),
  };
}

// feature 011 — VistaDetalleEmpleado / DetalleJornada (data-model.md): lo que
// devuelve GET /api/resumen-periodo/{legajo}. Horas SIEMPRE en 'HH:MM' hacia
// el cliente (nunca minutos crudos), mismo criterio que 010.
export function construirDetalleEmpleado({ periodo, legajo, nombre = null, detalle = [] }) {
  return {
    periodo,
    legajo,
    nombre,
    dias: detalle.map((d) => ({
      fecha: d.fecha,
      clasificacion: d.clasificacion,
      estado: d.estado,
      entrada: d.entrada != null ? formatHoraMinuto(d.entrada) : null,
      salida: d.salida != null ? formatHoraMinuto(d.salida) : null,
      horas: d.horas,
      llegadaTarde: d.llegadaTarde,
      corregida: d.corregida,
      pausas: d.pausas.map((p) => ({
        desde: formatHoraMinuto(p.desde),
        hasta: formatHoraMinuto(p.hasta),
        tipo: p.tipo,
      })),
      // feature 012 (FR-011): motivo y clasificación de pago del día, o null
      // si no hay Justificación vigente.
      justificacion: d.justificacion ?? null,
      requiereJustificacionRevision: Boolean(d.requiereJustificacionRevision),
    })),
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
    // 013-reestructurar-data-periodos (US3, contracts/web-api.md): campo nuevo
    // al nivel raíz; los clientes existentes que ignoran campos desconocidos
    // no se rompen.
    cerrado: Boolean(calendario.cerrado),
    cierre: calendario.cierre ?? null,
    reapertura: calendario.reapertura ?? null,
  };
}
