import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { crearApp } from '../../src/web/server.js';
import { generarCalendario, reclasificarDia } from '../../src/presentismo/domain/calendario-mes.js';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';
import { registrarFichadas } from '../../src/presentismo/adapters/file-fichadas-archive.js';

// Entorno de pruebas de la feature 010 (contract + integration): servidor web
// real (crearApp) sobre directorios temporales, con calendario del período
// ACTUAL del reloj del sistema (la página opera sobre "hoy"), snapshot local
// del padrón y archivo acumulativo de fichadas. Sin Oracle ni reloj.

export function mesActualPeriodo() {
  const n = new Date();
  return `${String(n.getFullYear()).padStart(4, '0')}${String(n.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' del día `dd` del mes actual.
export function fechaDelMes(dd) {
  const p = mesActualPeriodo();
  return `${p.slice(0, 4)}-${p.slice(4, 6)}-${String(dd).padStart(2, '0')}`;
}

let rawSeq = 0;
export function fichadaCruda({ legajo, fecha, hora }) {
  rawSeq += 1;
  return {
    legajo,
    fecha,
    hora,
    metodo: 'huella',
    rawHex: String(rawSeq).padStart(4, '0').repeat(10), // única, 40 chars
  };
}

// Crea el entorno completo. `padron`: [{ legajo, categoria, nombre }];
// `clasificaciones`: { 'YYYY-MM-DD': 'Laborable'|'Feriado'|'No Laborable' };
// `fichadas`: [{ legajo, fecha, hora }] pre-cargadas en el archivo del período.
export async function crearEntornoFichadasHoy({
  padron = [],
  clasificaciones = {},
  fichadas = [],
  envExtra = {},
} = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'fichadas-hoy-'));
  const repoDir = join(raiz, 'repo');
  const logDir = join(raiz, 'logs');
  const fichadasDir = join(raiz, 'fichadas');
  const padronFile = join(raiz, 'padron.json');
  const periodo = mesActualPeriodo();

  // Calendario del mes actual (esquema lun-vie) + reclasificaciones explícitas
  // para que cada escenario controle la clasificación del día bajo prueba.
  const repo = createFilePresentismoRepository({ repoDir });
  let cal = generarCalendario(periodo, new Set([1, 2, 3, 4, 5]));
  for (const [fecha, clasificacion] of Object.entries(clasificaciones)) {
    cal = reclasificarDia(cal, fecha, clasificacion);
  }
  await repo.guardarCalendario(cal);

  writeFileSync(padronFile, JSON.stringify({ empleados: padron }, null, 2), 'utf8');

  if (fichadas.length > 0) {
    registrarFichadas({ archiveDir: fichadasDir, periodo, fichadas: fichadas.map(fichadaCruda) });
  }

  const env = {
    PRESENTISMO_REPO_DIR: repoDir,
    PRESENTISMO_LOG_DIR: logDir,
    PRESENTISMO_CATEGORIAS_CONFIG: './config/categorias.json',
    PRESENTISMO_PADRON_FILE: padronFile,
    PRESENTISMO_FICHADAS_DIR: fichadasDir,
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
    periodo,
    repoDir,
    logDir,
    fichadasDir,
    padronFile,
    // Agrega fichadas "nuevas del reloj" al archivo del período en caliente.
    agregarFichadas(nuevas) {
      registrarFichadas({ archiveDir: fichadasDir, periodo, fichadas: nuevas.map(fichadaCruda) });
    },
    close() {
      server.close();
      rmSync(raiz, { recursive: true, force: true });
    },
  };
}
