import { readFileSync } from 'node:fs';

export function hexToBuffer(hex) {
  return Buffer.from(hex.replace(/\s+/g, ''), 'hex');
}

export function loadFixture(relativePath) {
  const url = new URL(`../contract/fixtures/${relativePath}`, import.meta.url);
  const text = readFileSync(url, 'utf8');
  return JSON.parse(text);
}
