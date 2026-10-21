export interface RepoRef { owner: string; name: string; fullName: string; ref: string | null }
export type RepoInputResult =
  | { ok: true; value: RepoRef }
  | { ok: false; error: { code: 'invalid_repo' | 'invalid_ref'; message: string } };

const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

/** Mirrors `git check-ref-format` (plus: no leading '-'). */
export function isValidRef(ref: string): boolean {
  if (SHA_RE.test(ref)) return true;
  if (!ref || ref.length > 255 || ref.startsWith('-') || ref === '@') return false;
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(ref)) return false;
  if (ref.includes('..') || ref.includes('@{') || ref.includes('//')) return false;
  if (ref.startsWith('/') || ref.endsWith('/') || ref.endsWith('.')) return false;
  return ref.split('/').every((c) => !c.startsWith('.') && !c.endsWith('.lock'));
}

const bad = (code: 'invalid_repo' | 'invalid_ref', message: string): RepoInputResult =>
  ({ ok: false, error: { code, message } });

function splitRepo(raw: string): string | null {
  const s = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.includes('@')) {
    let u: URL;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password
      || u.port || u.search || u.hash) return null;
    return u.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  }
  return s;
}

export function parseRepoInput(input: { repo: string; ref?: string | null }): RepoInputResult {
  if (typeof input.repo !== 'string') return bad('invalid_repo', 'repo must be a string');
  const path = splitRepo(input.repo);
  const parts = path?.split('/');
  if (!path || !parts || parts.length !== 2) return bad('invalid_repo', 'Expected owner/name or https://github.com/owner/name');
  const [owner, name] = parts as [string, string];
  if (!OWNER_RE.test(owner) || owner.startsWith('-') || !NAME_RE.test(name) || name === '.' || name === '..'
    || name.startsWith('-')) {
    return bad('invalid_repo', 'Invalid owner/name');
  }
  let ref: string | null = null;
  if (input.ref !== undefined && input.ref !== null && input.ref !== '') {
    if (typeof input.ref !== 'string' || !isValidRef(input.ref)) return bad('invalid_ref', 'Invalid git ref');
    ref = input.ref;
  }
  return { ok: true, value: { owner, name, fullName: `${owner}/${name}`, ref } };
}
