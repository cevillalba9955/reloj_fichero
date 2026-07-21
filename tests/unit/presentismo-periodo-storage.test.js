import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  rutaCarpetaPeriodo,
  ARCHIVO_CALENDARIO,
  ARCHIVO_FICHADAS,
  ARCHIVO_PADRON,
} from '../../src/presentismo/domain/periodo-storage.js';

test('rutaCarpetaPeriodo compone <repoDir>/P<periodo>', () => {
  assert.equal(rutaCarpetaPeriodo('/repo', '202608'), join('/repo', 'P202608'));
});

test('rutaCarpetaPeriodo: períodos distintos producen carpetas distintas', () => {
  const a = rutaCarpetaPeriodo('/repo', '202607');
  const b = rutaCarpetaPeriodo('/repo', '202608');
  assert.notEqual(a, b);
});

test('rutaCarpetaPeriodo: mismo repoDir, mismo período → misma ruta (determinista)', () => {
  assert.equal(rutaCarpetaPeriodo('/repo', '202608'), rutaCarpetaPeriodo('/repo', '202608'));
});

test('rutaCarpetaPeriodo valida el formato del período (delega en parsePeriodo)', () => {
  assert.throws(() => rutaCarpetaPeriodo('/repo', '2026-08'), /período inválido/);
  assert.throws(() => rutaCarpetaPeriodo('/repo', '202613'), /mes inválido/);
});

test('los tres nombres de archivo son fijos', () => {
  assert.equal(ARCHIVO_CALENDARIO, 'calendario.json');
  assert.equal(ARCHIVO_FICHADAS, 'fichadas.json');
  assert.equal(ARCHIVO_PADRON, 'padron.json');
});
