import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export interface InventoryEntry { path: string; size: number; kind: 'text' | 'binary' | 'minified' | 'symlink-outside' }
export interface Inventory {
  files: InventoryEntry[]; manifests: string[]; lockfiles: string[]; ciWorkflows: string[];
  installScripts: string[]; totalBytes: number; truncated: boolean;
}

const MAX_FILES = 20000;
const MANIFESTS = new Set(['package.json', 'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'Gemfile',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Dockerfile', 'Makefile']);
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Pipfile.lock', 'Gemfile.lock',
  'Cargo.lock', 'go.sum', 'composer.lock', 'npm-shrinkwrap.json']);
const CI_FILES = new Set(['.gitlab-ci.yml', 'Jenkinsfile', '.travis.yml', 'azure-pipelines.yml', '.circleci/config.yml']);
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];

async function classify(abs: string, size: number, name: string): Promise<'text' | 'binary' | 'minified'> {
  if (size === 0) return 'text';
  const fh = await open(abs, 'r');
  try {
    const buf = Buffer.alloc(Math.min(size, 8192));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead);
    if (head.includes(0)) return 'binary';
    if (/\.min\.(js|css|mjs)$/i.test(name)) return 'minified';
    if (size > 1000) {
      let longest = 0, cur = 0;
      for (const b of head) { if (b === 10) { longest = Math.max(longest, cur); cur = 0; } else cur++; }
      longest = Math.max(longest, cur);
      if (longest > 1000) return 'minified';
    }
    return 'text';
  } finally { await fh.close(); }
}

export async function buildInventory(dir: string): Promise<Inventory> {
  const root = await realpath(dir);
  const inv: Inventory = { files: [], manifests: [], lockfiles: [], ciWorkflows: [], installScripts: [], totalBytes: 0, truncated: false };

  async function walk(abs: string, rel: string): Promise<void> {
    const entries = await readdir(abs, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (rel === '' && e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const a = path.join(abs, e.name);
      if (e.isSymbolicLink()) {
        let inside = false;
        try { const t = await realpath(a); inside = t === root || t.startsWith(root + path.sep); } catch { /* dangling → ignored */ }
        if (!inside) {
          if (inv.files.length >= MAX_FILES) { inv.truncated = true; continue; }
          inv.files.push({ path: r, size: 0, kind: 'symlink-outside' });
        }
        continue;
      }
      if (e.isDirectory()) { await walk(a, r); continue; }
      if (!e.isFile()) continue;
      if (inv.files.length >= MAX_FILES) { inv.truncated = true; return; }
      const size = (await lstat(a)).size;
      inv.totalBytes += size;
      inv.files.push({ path: r, size, kind: await classify(a, size, e.name) });
      if (MANIFESTS.has(e.name)) inv.manifests.push(r);
      if (LOCKFILES.has(e.name)) inv.lockfiles.push(r);
      if (CI_FILES.has(r) || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(r) || /^\.circleci\/config\.yml$/.test(r)) inv.ciWorkflows.push(r);
      if (e.name === 'package.json') {
        try {
          const scripts = (JSON.parse(await readFile(a, 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {};
          if (INSTALL_HOOKS.some((h) => typeof scripts[h] === 'string')) inv.installScripts.push(r);
        } catch { /* invalid JSON: not an install-script signal */ }
      } else if (e.name === 'setup.py' || /^(install|setup)\.(sh|ps1|bat)$/i.test(e.name)) inv.installScripts.push(r);
    }
  }
  await walk(root, '');
  return inv;
}
