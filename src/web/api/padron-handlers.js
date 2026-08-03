import { ApiError } from './router.js';
import { exigirRol } from '../acl/autorizacion.js';

// fix vacaciones — endpoint para forzar manualmente la sincronización del
// padrón desde Oracle (mismo criterio que `sincronizar-padron` del CLI y que
// el intento automático al iniciar un período, calendario-handlers.js). Rol
// 'configurador': es una operación de infraestructura, no de uso diario
// (mismo nivel que el resto de /api/configuracion/*).
export function registrarRutas(router, ctx) {
  router.add('POST', '/api/padron/sincronizar', exigirRol(ctx, 'configurador', async () => {
    try {
      const resultado = await ctx.sincronizarPadronOracle();
      return { status: 200, body: resultado };
    } catch (err) {
      throw new ApiError(502, 'PADRON_SINCRONIZACION_FALLIDA', err.message);
    }
  }));
}
