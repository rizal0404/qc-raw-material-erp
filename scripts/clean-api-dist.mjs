import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = resolve(repositoryRoot, 'apps/api');
const target = resolve(apiRoot, 'dist');
if (dirname(target) !== apiRoot || target === repositoryRoot) {
  throw new Error('Refusing to clean an unexpected API build directory.');
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
