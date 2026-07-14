import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilePresentismoRepository } from '../../src/presentismo/adapters/file-presentismo-repository.js';

// T005 (feature 007): listarPeriodos() devuelve los YYYYMM con calendario
// persistido, ordenados; ignora archivos que no matchean ^\d{6}\.json$ o sin
// calendario; [] si el directorio está vacío. Sin acceso a Oracle.

function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'presentismo-listar-'));
  return { dir, repo: createFilePresentismoRepository({ repoDir: dir }) };
}

function escribirCalendario(dir, periodo) {
  const cal = { periodo, esquemaSemanal: [1, 2, 3, 4, 5], dias: [] };
  writeFileSync(join(dir, `${periodo}.json`), JSON.stringify({ calendario: cal, correcciones: [], pausas: [] }));
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

test('listarPeriodos: ignora archivos que no son ^\\d{6}\\.json$ y subdirectorios', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202607');
    writeFileSync(join(dir, 'padron.json'), '{}');
    writeFileSync(join(dir, '2026070.json'), '{}'); // 7 dígitos
    writeFileSync(join(dir, '20260.json'), '{}'); // 5 dígitos
    writeFileSync(join(dir, 'notas.txt'), 'x');
    mkdirSync(join(dir, 'fichadas'));
    assert.deepEqual(await repo.listarPeriodos(), ['202607']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listarPeriodos: ignora archivos NNNNNN.json sin calendario (calendario null)', async () => {
  const { dir, repo } = tmpRepo();
  try {
    escribirCalendario(dir, '202607');
    writeFileSync(join(dir, '202605.json'), JSON.stringify({ calendario: null, correcciones: [], pausas: [] }));
    assert.deepEqual(await repo.listarPeriodos(), ['202607']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
