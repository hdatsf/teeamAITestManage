import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

rmSync(dataDir, { recursive: true, force: true });
console.log(`Removed ${path.relative(root, dataDir)}. The demo dataset will be re-seeded on next server start.`);
