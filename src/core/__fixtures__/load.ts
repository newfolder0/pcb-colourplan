import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read a fixture file (test-only helper). */
export function loadFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
}
