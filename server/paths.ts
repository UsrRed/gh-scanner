import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

/** Walks up from this file until a package.json is found. */
export function appRoot(): string {
  if (cached) return cached;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return (cached = dir);
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found above ' + dir);
    dir = parent;
  }
}

export const promptsDir = (): string => path.join(appRoot(), 'prompts');
export const contentDir = (): string => path.join(appRoot(), 'content');
export const distDir = (): string => path.join(appRoot(), 'dist');
export const webDistDir = (): string => path.join(distDir(), 'web');
