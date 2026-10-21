import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_READ = 1_000_000;

export async function readText(dir: string, rel: string): Promise<string | null> {
  const abs = path.resolve(dir, rel);
  if (!abs.startsWith(path.resolve(dir) + path.sep)) return null;
  try {
    const buf = await readFile(abs);
    return buf.subarray(0, MAX_READ).toString('utf8');
  } catch {
    return null;
  }
}

export function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
