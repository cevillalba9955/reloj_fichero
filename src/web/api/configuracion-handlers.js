import { ApiError } from './router.js';
import { leerParametrosEditables, escribirParametrosEditables } from '../../config/env-file.js';
import {
  loadMotivosAusenciaConfig,
  saveMotivosAusenciaConfig,
  agregarMotivo,
  editarMotivo,
} from '../../presentismo/config/motivos-ausencia-config.js';
import {
  loadCategoriasConfig,
  saveCategoriasConfig,
  serializarCategoriasConfig,
  agregarModalidad,
  editarModalidad,
  eliminarModalidad,
  agregarCategoria,
  editarCategoriaModalidad,
  editarEsquemaSemanal,
} from '../../presentismo/config/categorias-config.js';

// feature 014 — Handlers de la API de "Configuración". Permiten editar, sin
// tocar archivos a mano: los parámetros de conexión/sondeo del reloj y del
// servicio (`.env`, contracts/env-config.schema.md), el catálogo de motivos
// de ausencia y las categorías/modalidades/esquema semanal
// (contracts/web-api-configuracion.md). Traducen errores de los módulos de
// config a la forma uniforme `{ error: { codigo, mensaje } }` del router.

function relanzarComoConfiguracionInvalida(err) {
  throw new ApiError(400, 'CONFIGURACION_INVALIDA', err.message);
}

// contracts/web-api-configuracion.md ↔ contracts/env-config.schema.md: la API
// web usa nombres camelCase; env-file.js usa las claves `FICHADAS_*`/
// `PRESENTISMO_*` tal cual viven en el `.env`.
const CAMPO_A_CLAVE_ENV = {
  host: 'FICHADAS_HOST',
  port: 'FICHADAS_PORT',
  timeoutMs: 'FICHADAS_TIMEOUT_MS',
  tickIntervalMs: 'FICHADAS_TICK_INTERVAL_MS',
  statusIntervalMs: 'FICHADAS_STATUS_INTERVAL_MS',
  entradaHora: 'FICHADAS_ENTRADA_HORA',
  entradaDuracion: 'FICHADAS_ENTRADA_DURACION',
  fullHandshake: 'FICHADAS_FULL_HANDSHAKE',
  controlPort: 'FICHADAS_CONTROL_PORT',
  resumenPeriodo: 'PRESENTISMO_RESUMEN_PERIODO',
};

function aRespuestaReloj(parametros) {
  const respuesta = {};
  for (const [campo, clave] of Object.entries(CAMPO_A_CLAVE_ENV)) {
    respuesta[campo] = parametros[clave];
  }
  return respuesta;
}

function aCambiosEnv(bodyCamelCase) {
  const cambios = {};
  for (const [campo, valor] of Object.entries(bodyCamelCase ?? {})) {
    const clave = CAMPO_A_CLAVE_ENV[campo];
    if (!clave) throw new ApiError(400, 'CONFIGURACION_INVALIDA', `campo desconocido "${campo}"`);
    cambios[clave] = valor;
  }
  return cambios;
}

export function registrarRutas(router, ctx) {
  // --- Reloj y servicio (US1, US4 — .env) ---------------------------------

  router.add('GET', '/api/configuracion/reloj', async () => {
    return { status: 200, body: aRespuestaReloj(leerParametrosEditables(ctx.rutaEnv)) };
  });

  router.add('PUT', '/api/configuracion/reloj', async ({ body }) => {
    try {
      escribirParametrosEditables(ctx.rutaEnv, aCambiosEnv(body));
    } catch (err) {
      if (err instanceof ApiError) throw err;
      relanzarComoConfiguracionInvalida(err);
    }
    return { status: 200, body: aRespuestaReloj(leerParametrosEditables(ctx.rutaEnv)) };
  });

  router.add('POST', '/api/configuracion/reloj/probar-conexion', async ({ body }) => {
    const { host, port } = body ?? {};
    if (typeof host !== 'string' || host.trim() === '' || !Number.isInteger(port)) {
      throw new ApiError(400, 'CONFIGURACION_INVALIDA', 'Se requiere host (string) y port (entero)');
    }
    const resultado = await ctx.consultarReloj.probarConexion(host, port);
    if (!resultado.disponible) {
      throw new ApiError(502, 'SERVICIO_FICHADAS_NO_DISPONIBLE', resultado.motivo);
    }
    return { status: 200, body: { ok: resultado.ok, motivo: resultado.motivo ?? undefined } };
  });

  // --- Motivos de ausencia (US2) -------------------------------------------
  // Se relee el archivo en cada request (no ctx.motivosAusenciaConfig, la
  // versión "viva" que usa el cálculo de presentismo) para que esta página
  // siempre trabaje con el estado más reciente, incluidos cambios hechos en
  // la misma sesión.

  router.add('GET', '/api/configuracion/motivos-ausencia', async () => {
    const config = loadMotivosAusenciaConfig(ctx.motivosAusenciaConfigPath);
    const motivos = [...config.motivos.values()];
    return { status: 200, body: { motivos } };
  });

  router.add('POST', '/api/configuracion/motivos-ausencia', async ({ body }) => {
    const { id, etiqueta, tipoPago, activo } = body ?? {};
    if (typeof id !== 'string' || id.trim() === '') {
      throw new ApiError(400, 'CONFIGURACION_INVALIDA', 'El motivo requiere un "id" no vacío');
    }
    const config = loadMotivosAusenciaConfig(ctx.motivosAusenciaConfigPath);
    if (config.motivos.has(id)) {
      throw new ApiError(400, 'MOTIVO_DUPLICADO', `ya existe un motivo con id "${id}"`);
    }
    let actualizado;
    try {
      actualizado = agregarMotivo(config, { id, etiqueta, tipoPago, activo });
    } catch (err) {
      relanzarComoConfiguracionInvalida(err);
    }
    saveMotivosAusenciaConfig(ctx.motivosAusenciaConfigPath, actualizado);
    return { status: 201, body: actualizado.motivos.get(id) };
  });

  router.add('PUT', '/api/configuracion/motivos-ausencia/:id', async ({ params, body }) => {
    const config = loadMotivosAusenciaConfig(ctx.motivosAusenciaConfigPath);
    if (!config.motivos.has(params.id)) {
      throw new ApiError(404, 'MOTIVO_NO_ENCONTRADO', `no existe un motivo con id "${params.id}"`);
    }
    let actualizado;
    try {
      actualizado = editarMotivo(config, params.id, body ?? {});
    } catch (err) {
      relanzarComoConfiguracionInvalida(err);
    }
    saveMotivosAusenciaConfig(ctx.motivosAusenciaConfigPath, actualizado);
    return { status: 200, body: actualizado.motivos.get(params.id) };
  });

  // --- Categorías, modalidades y esquema semanal (US3) ---------------------
  // Igual que motivos: se relee `categorias.json` en cada request, no
  // ctx.categoriasConfig (la versión "viva" que consume el cálculo de
  // presentismo — ver comentario en wiring.js).

  router.add('GET', '/api/configuracion/categorias', async () => {
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    return { status: 200, body: serializarCategoriasConfig(config) };
  });

  router.add('PUT', '/api/configuracion/categorias/esquema-semanal', async ({ body }) => {
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    let actualizado;
    try {
      actualizado = editarEsquemaSemanal(config, body?.dias);
    } catch (err) {
      relanzarComoConfiguracionInvalida(err);
    }
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 200, body: { esquemaSemanal: serializarCategoriasConfig(actualizado).esquemaSemanal } };
  });

  router.add('POST', '/api/configuracion/categorias/modalidades', async ({ body }) => {
    const { nombre, ...datos } = body ?? {};
    if (typeof nombre !== 'string' || nombre.trim() === '') {
      throw new ApiError(400, 'CONFIGURACION_INVALIDA', 'La modalidad requiere un "nombre" no vacío');
    }
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    let actualizado;
    try {
      actualizado = agregarModalidad(config, nombre, datos);
    } catch (err) {
      relanzarComoConfiguracionInvalida(err);
    }
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 201, body: serializarCategoriasConfig(actualizado).modalidades[nombre] };
  });

  router.add('PUT', '/api/configuracion/categorias/modalidades/:nombre', async ({ params, body }) => {
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    if (!config.modalidades.has(params.nombre)) {
      throw new ApiError(404, 'MODALIDAD_NO_ENCONTRADA', `no existe una modalidad "${params.nombre}"`);
    }
    let actualizado;
    try {
      actualizado = editarModalidad(config, params.nombre, body ?? {});
    } catch (err) {
      relanzarComoConfiguracionInvalida(err);
    }
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 200, body: serializarCategoriasConfig(actualizado).modalidades[params.nombre] };
  });

  router.add('DELETE', '/api/configuracion/categorias/modalidades/:nombre', async ({ params }) => {
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    if (!config.modalidades.has(params.nombre)) {
      throw new ApiError(404, 'MODALIDAD_NO_ENCONTRADA', `no existe una modalidad "${params.nombre}"`);
    }
    let actualizado;
    try {
      actualizado = eliminarModalidad(config, params.nombre);
    } catch (err) {
      if (err.categoriasEnUso) {
        throw new ApiError(409, 'MODALIDAD_EN_USO', err.message);
      }
      relanzarComoConfiguracionInvalida(err);
    }
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 200, body: { eliminada: true } };
  });

  router.add('POST', '/api/configuracion/categorias/categorias', async ({ body }) => {
    const { codigo, modalidad } = body ?? {};
    if (typeof codigo !== 'string' || codigo.trim() === '') {
      throw new ApiError(400, 'CONFIGURACION_INVALIDA', 'La categoría requiere un "codigo" no vacío');
    }
    if (typeof modalidad !== 'string' || modalidad.trim() === '') {
      throw new ApiError(400, 'CONFIGURACION_INVALIDA', 'La categoría requiere una "modalidad"');
    }
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    if (config.categorias.has(codigo)) {
      throw new ApiError(400, 'CATEGORIA_DUPLICADA', `ya existe una categoría "${codigo}"`);
    }
    if (!config.modalidades.has(modalidad)) {
      throw new ApiError(400, 'MODALIDAD_INEXISTENTE', `la modalidad "${modalidad}" no existe`);
    }
    const actualizado = agregarCategoria(config, codigo, modalidad);
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 201, body: serializarCategoriasConfig(actualizado).categorias[codigo] };
  });

  router.add('PUT', '/api/configuracion/categorias/categorias/:codigo', async ({ params, body }) => {
    const { modalidad } = body ?? {};
    const config = loadCategoriasConfig(ctx.categoriasConfigPath);
    if (!config.categorias.has(params.codigo)) {
      throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA', `no existe una categoría "${params.codigo}"`);
    }
    if (typeof modalidad !== 'string' || !config.modalidades.has(modalidad)) {
      throw new ApiError(400, 'MODALIDAD_INEXISTENTE', `la modalidad "${modalidad}" no existe`);
    }
    const actualizado = editarCategoriaModalidad(config, params.codigo, modalidad);
    saveCategoriasConfig(ctx.categoriasConfigPath, actualizado);
    return { status: 200, body: serializarCategoriasConfig(actualizado).categorias[params.codigo] };
  });
}
