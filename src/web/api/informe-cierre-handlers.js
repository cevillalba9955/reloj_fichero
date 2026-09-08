import { join } from 'node:path';
import { ApiError } from './router.js';
import { exigirRol } from '../acl/autorizacion.js';
import { parsePeriodoId } from './periodo-id.js';
import { construirVistaInformeCierre } from '../view-model.js';
import { rutaCarpetaPeriodo, ARCHIVO_PADRON } from '../../presentismo/domain/periodo-storage.js';
import {
  leerSnapshotPadron,
  createFilePadronCategoryProvider,
} from '../../presentismo/adapters/file-padron-category-provider.js';
import { createCalcularPresentismoService } from '../../presentismo/service/calcular-presentismo-service.js';

// 018-informe-cierre-periodo — Handlers de la API del informe de cierre.
//   POST /api/calendarios/:periodo/informe-cierre  → emite / re-emite (rol editor+)
//   GET  /api/calendarios/:periodo/informe-cierre   → copia guardada
// La emisión también ocurre automáticamente al cerrar el período
// (calendario-handlers.js, ruta `cerrar`). NO escribe en Oracle (Principio VI).
// Ver specs/018-informe-cierre-periodo/contracts/web-api.md.

// Universo de empleados del período (FR-005): el snapshot `P<periodo>/padron.json`,
// NO el padrón vigente. Exportado para que calendario-handlers.js reutilice la
// misma resolución en la emisión automática al cerrar.
export function legajosYNombresDelPeriodo(ctx, periodoMes) {
  const filePath = join(rutaCarpetaPeriodo(ctx.repoDir, periodoMes), ARCHIVO_PADRON);
  const empleados = leerSnapshotPadron({ filePath });
  return {
    legajos: empleados.map((e) => e.legajo),
    nombres: new Map(empleados.map((e) => [e.legajo, e.nombre ?? null])),
  };
}

// Servicio de presentismo pinchado al período: la categoría/modalidad de cada
// empleado se resuelve contra `P<periodo>/padron.json` (FR-005), no contra el
// padrón del mes en curso (que es lo que usa `ctx.service`, feature 011). Se
// arma por emisión — es barato (todos los puertos ya están cableados en `ctx`).
// Exportado para la emisión automática al cerrar (calendario-handlers.js).
export function servicioDelPeriodo(ctx, periodoMes) {
  return createCalcularPresentismoService({
    repo: ctx.repo,
    categoriasConfig: ctx.categoriasConfig,
    logger: ctx.logger,
    fichadasProvider: ctx.fichadasProvider,
    categoryProvider: createFilePadronCategoryProvider({ repoDir: ctx.repoDir, periodo: periodoMes }),
    motivosAusenciaConfig: ctx.motivosAusenciaConfig,
    vacacionesRepo: ctx.vacacionesRepo,
    vacacionesConfig: ctx.vacacionesConfig,
    activeEmployeesProvider: ctx.activeEmployeesProvider,
  });
}

// Tramos a emitir según el modo de la instalación y el query `?tramo=`.
// MENSUAL → ['Mes'] (un `tramo` explícito es error). QUINCENAL → el tramo
// pedido, o ambas quincenas si se omite.
function tramosParaEmitir(modo, tramoQuery) {
  if (modo !== 'QUINCENAL') {
    if (tramoQuery != null) {
      throw new ApiError(400, 'PERIODO_INVALIDO', 'La instalación es mensual: no corresponde indicar un tramo');
    }
    return ['Mes'];
  }
  if (tramoQuery == null) return ['Q1', 'Q2'];
  if (tramoQuery === 'Q1' || tramoQuery === 'Q2') return [tramoQuery];
  throw new ApiError(400, 'PERIODO_INVALIDO', `Tramo inválido "${tramoQuery}" (se espera Q1 o Q2)`);
}

// Tramo único a leer.
function tramoParaLeer(modo, tramoQuery) {
  if (modo !== 'QUINCENAL') {
    if (tramoQuery != null) {
      throw new ApiError(400, 'PERIODO_INVALIDO', 'La instalación es mensual: no corresponde indicar un tramo');
    }
    return 'Mes';
  }
  if (tramoQuery === 'Q1' || tramoQuery === 'Q2') return tramoQuery;
  throw new ApiError(400, 'PERIODO_INVALIDO', 'En modo quincenal el informe se pide por tramo (?tramo=Q1 o ?tramo=Q2)');
}

async function exigirCalendarioCerrado(ctx, periodoMes, { debeEstarCerrado }) {
  const calendario = await ctx.repo.cargarCalendario(periodoMes);
  if (!calendario) {
    throw new ApiError(404, 'CALENDARIO_NO_GENERADO', `No hay calendario para ${periodoMes}`);
  }
  if (debeEstarCerrado && calendario.cerrado !== true) {
    throw new ApiError(409, 'PERIODO_ABIERTO', `El período ${periodoMes} debe cerrarse antes de emitir el informe`);
  }
  return calendario;
}

export function registrarRutas(router, ctx) {
  // POST — emite / re-emite (rol editor+). El período debe estar cerrado.
  router.add(
    'POST',
    '/api/calendarios/:periodo/informe-cierre',
    exigirRol(ctx, 'editor', async ({ params, query, body }) => {
      const modo = ctx.modoResumenPeriodo ?? 'MENSUAL';
      const { periodoMes } = parsePeriodoId(params.periodo, modo);
      await exigirCalendarioCerrado(ctx, periodoMes, { debeEstarCerrado: true });

      const tramos = tramosParaEmitir(modo, query.tramo);
      const { legajos, nombres } = legajosYNombresDelPeriodo(ctx, periodoMes);
      const autor = body?.autor ?? null;
      const servicio = servicioDelPeriodo(ctx, periodoMes);

      const emitidos = [];
      for (const tramo of tramos) {
        const entrada = await servicio.emitirInformeCierre({
          periodoMes,
          tramo,
          legajos,
          nombres,
          autor,
          emision: 'manual',
          granularidad: modo,
        });
        emitidos.push(construirVistaInformeCierre({ entrada }));
      }
      return { status: 200, body: emitidos.length === 1 ? emitidos[0] : { emitidos } };
    }),
  );

  // GET — copia guardada de un tramo (lectura abierta, como /api/resumen-periodo).
  router.add('GET', '/api/calendarios/:periodo/informe-cierre', async ({ params, query }) => {
    const modo = ctx.modoResumenPeriodo ?? 'MENSUAL';
    const { periodoMes } = parsePeriodoId(params.periodo, modo);
    await exigirCalendarioCerrado(ctx, periodoMes, { debeEstarCerrado: false });

    const tramo = tramoParaLeer(modo, query.tramo);
    const entrada = await ctx.service.obtenerInformeCierre(periodoMes, tramo);
    if (!entrada) {
      const sufijo = tramo === 'Mes' ? '' : `-${tramo}`;
      throw new ApiError(404, 'INFORME_NO_EMITIDO', `No hay informe de cierre emitido para ${periodoMes}${sufijo}`);
    }
    return { status: 200, body: construirVistaInformeCierre({ entrada }) };
  });
}
