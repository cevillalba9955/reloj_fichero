import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { crearApp } from '../../src/web/server.js';

// feature 014 — Entorno de pruebas de contrato/integración de la página de
// Configuración: servidor web real (crearApp) sobre un `.env` y unos JSON de
// config temporales (nunca los del repositorio real), para poder escribir en
// ellos sin afectar `config/categorias.json`/`config/motivos-ausencia.json`
// del proyecto. Sin Oracle ni reloj real.

export const CATEGORIAS_DEFAULT = {
  esquemaSemanal: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  modalidades: {
    mensual: {
      tipo: 'Mensual',
      aperturaOficial: '07:00',
      cierreOficial: '16:00',
      margenAperturaMin: 30,
      margenCierreMin: 30,
      ventanaApertura: ['05:00', '12:00'],
      ventanaCierre: ['12:00', '23:59'],
    },
  },
  categorias: { ADMIN: { modalidad: 'mensual' } },
};

export const MOTIVOS_DEFAULT = {
  motivos: [
    { id: 'sin_aviso', etiqueta: 'Sin Aviso', tipoPago: 'No paga', activo: true },
    { id: 'enfermedad', etiqueta: 'Enfermedad', tipoPago: 'Paga', activo: true },
  ],
};

export async function crearEntornoConfiguracion({
  envContenido = '# .env de prueba\nFICHADAS_HOST=10.0.0.5\nFICHADAS_PORT=5005\n',
  categorias = CATEGORIAS_DEFAULT,
  motivos = MOTIVOS_DEFAULT,
  envExtra = {},
} = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'configuracion-'));
  const rutaEnv = join(raiz, '.env');
  const categoriasPath = join(raiz, 'categorias.json');
  const motivosPath = join(raiz, 'motivos-ausencia.json');
  writeFileSync(rutaEnv, envContenido, 'utf8');
  writeFileSync(categoriasPath, JSON.stringify(categorias, null, 2), 'utf8');
  writeFileSync(motivosPath, JSON.stringify(motivos, null, 2), 'utf8');

  const env = {
    CONFIGURACION_ENV_PATH: rutaEnv,
    PRESENTISMO_CATEGORIAS_CONFIG: categoriasPath,
    PRESENTISMO_MOTIVOS_AUSENCIA_CONFIG: motivosPath,
    PRESENTISMO_REPO_DIR: join(raiz, 'repo'),
    PRESENTISMO_LOG_DIR: join(raiz, 'logs'),
    ...envExtra,
  };
  const app = crearApp({ env });
  const server = createServer((req, res) =>
    app(req, res).catch((e) => {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(e));
    }),
  );
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;

  return {
    base,
    rutaEnv,
    categoriasPath,
    motivosPath,
    close() {
      server.close();
      rmSync(raiz, { recursive: true, force: true });
    },
  };
}
