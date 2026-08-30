import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = dirname(fileURLToPath(import.meta.url));
const target = resolve(apiRoot, "dist");
if (dirname(target) !== apiRoot || target === apiRoot) {
  throw new Error("Refusing to clean an unexpected API build directory.");
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
