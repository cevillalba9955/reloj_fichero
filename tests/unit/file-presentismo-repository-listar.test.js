import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// T005 (feature 007) + 013 (reestructurar-data-periodos): listarPeriodos()
// devuelve los YYYYMM con calendario persistido, ordenados; ignora entradas
// que no matchean `^P\d{6}$` o carpetas `P<periodo>` sin calendario. Sin
// acceso a Oracle. Layout: `<repoDir>/P<periodo>/calendario.json`.

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'presentismo-listar-'));
  return { dir, repo: createFilePresentismoRepository({ repoDir: dir }) };
}

function escribirCalendario(dir, periodo) {
  const cal = { periodo, esquemaSemanal: [1, 2, 3, 4, 5], dias: [] };
  const carpeta = join(dir, `P${periodo}`);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, 'calendario.json'), JSON.stringify({ calendario: cal, correcciones: [], pausas: [] }));
}

test('listarPeriodos: directorio vacío → []', async () => {
  const { dir, repo } = tmpRepo();
  try {
    assert.deepEqual(await repo.listarPeriodos(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listarPeriodos: devuelve los YYYYMM ordenados ascendentemente', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202608');
    escribirCalendario(dir, '202606');
    escribirCalendario(dir, '202607');
    assert.deepEqual(await repo.listarPeriodos(), ['202606', '202607', '202608']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listarPeriodos: reporta el período SIN el prefijo "P" (invariante data-model.md)', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202607');
    const periodos = await repo.listarPeriodos();
    assert.deepEqual(periodos, ['202607']);
    assert.ok(periodos.every((p) => !p.startsWith('P')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listarPeriodos: ignora entradas que no matchean ^P\\d{6}$ (archivos sueltos, carpetas mal formadas)', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202607');
    writeFileSync(join(dir, 'padron.json'), '{}'); // archivo suelto en la raíz
    mkdirSync(join(dir, 'P2026070')); // 7 dígitos
    mkdirSync(join(dir, 'P20260')); // 5 dígitos
    mkdirSync(join(dir, '202607')); // sin el prefijo "P"
    writeFileSync(join(dir, 'notas.txt'), 'x');
    assert.deepEqual(await repo.listarPeriodos(), ['202607']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listarPeriodos: ignora carpetas P<periodo> sin calendario (calendario null)', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202607');
    const vacia = join(dir, 'P202605');
    mkdirSync(vacia, { recursive: true });
    writeFileSync(join(vacia, 'calendario.json'), JSON.stringify({ calendario: null, correcciones: [], pausas: [] }));
    assert.deepEqual(await repo.listarPeriodos(), ['202607']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
