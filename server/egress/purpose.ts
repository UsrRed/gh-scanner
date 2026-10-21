const GITHUB = new Set(['github.com', 'api.github.com', 'codeload.github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com']);
const ANTHROPIC = new Set(['api.anthropic.com', 'console.anthropic.com', 'claude.ai', 'platform.claude.com']);

function hostPurpose(host: string): string {
  const h = host.toLowerCase();
  if (GITHUB.has(h)) return 'github';
  if (ANTHROPIC.has(h) || h.endsWith('.anthropic.com')) return 'anthropic';
  return 'unknown';
}

/** Decode `Proxy-Authorization: Basic base64(<purpose>:x)`; purpose such as `scan.<id>.claude.mapping`
 *  or `scan:<id>:clone`. Falls back to a host-based purpose. */
export function decodePurpose(header: string | undefined, host: string): { purpose: string; scanId: string | null } {
  if (header) {
    const m = /^Basic\s+(\S+)$/i.exec(header.trim());
    if (m) {
      let user = '';
      try { user = Buffer.from(m[1]!, 'base64').toString('utf8'); } catch { /* ignore */ }
      const i = user.lastIndexOf(':');
      let purpose = (i >= 0 ? user.slice(0, i) : user);
      try { purpose = decodeURIComponent(purpose); } catch { /* keep raw */ }
      if (/^[\w.:-]{1,200}$/.test(purpose)) {
        const s = /^scan[.:]([A-Za-z0-9-]+)(?:[.:]|$)/.exec(purpose);
        return { purpose: purpose.replace(/^scan:/, 'scan.').replace(/:/g, '.'), scanId: s ? s[1]! : null };
      }
    }
  }
  return { purpose: hostPurpose(host), scanId: null };
}
