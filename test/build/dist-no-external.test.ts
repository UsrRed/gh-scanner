import { afterAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterAll(() => td.cleanup());

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

// http(s) URLs in src/href attributes, CSS @import and url(...).
const EXTERNAL = [
  /\b(?:src|href)\s*=\s*["']?\s*https?:\/\/[^\s"'>]+/gi,
  /@import\s+(?:url\(\s*)?["']?\s*https?:\/\/[^\s"')]+/gi,
  /url\(\s*["']?\s*https?:\/\/[^\s"')]+/gi,
];

export function findExternalRefs(dir: string): string[] {
  const out: string[] = [];
  for (const f of walk(dir).filter((x) => /\.(html|css)$/.test(x))) {
    const text = readFileSync(f, 'utf8');
    for (const re of EXTERNAL) for (const m of text.matchAll(re)) out.push(`${path.relative(dir, f)}: ${m[0]}`);
  }
  return out;
}

describe('web build', () => {
  it('has no external http(s) reference, and the check detects an injected one', async () => {
    const outDir = td.make();
    await build({ configFile: path.resolve('vite.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    expect(existsSync(path.join(outDir, 'index.html'))).toBe(true);
    expect(findExternalRefs(outDir)).toEqual([]);
    const css = walk(outDir).find((f) => f.endsWith('.css'));
    const target = css ?? path.join(outDir, 'index.html');
    appendFileSync(target, css ? '\n@import url("https://evil.example/x.css");\n' : '\n<script src="https://evil.example/x.js"></script>\n');
    expect(findExternalRefs(outDir).some((r) => r.includes('evil.example'))).toBe(true);
  }, 40000);
});
