import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function derive(pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? reject(e) : resolve(k))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await derive(pw, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${h.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const got = await derive(pw, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch { return false; }
}

/** Hashes the configured password into <data>/auth.json (600) on first start; rehashes if the configured one changed. */
export async function ensureAuthFile(dataDir: string, password: string): Promise<string> {
  const file = join(dataDir, 'auth.json');
  if (existsSync(file)) {
    try {
      const { hash } = JSON.parse(readFileSync(file, 'utf8')) as { hash?: string };
      if (hash && await verifyPassword(password, hash)) { chmodSync(file, 0o600); return hash; }
    } catch { /* rewrite below */ }
  }
  const hash = await hashPassword(password);
  writeFileSync(file, JSON.stringify({ hash, createdAt: new Date().toISOString() }), { mode: 0o600 });
  chmodSync(file, 0o600);
  return hash;
}
