import { describe, expect, it } from 'vitest';
import { isValidRef, parseRepoInput } from '../../server/repo-input/index.js';
import { computeScore } from '../../server/analysis/score.js';
import { mergeFindings } from '../../server/analysis/merge.js';
import type { RawFinding } from '../../server/analysis/types.js';
import { fingerprintOf } from '../../server/analysis/fingerprint.js';
import { BudgetTracker } from '../../server/analysis/budget.js';
import { parseAllowlist } from '../../server/egress/allowlist.js';
import { decodePurpose } from '../../server/egress/purpose.js';

const usage = (o: Partial<Record<'inputTokens' | 'outputTokens' | 'costUsd', number>>) =>
  ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, ...o });

describe('repo-input edge cases', () => {
  it.each([
    'a/b/c', '/', 'owner/', '/repo', 'owner/repo/', 'own er/repo', 'owner/re po', '-owner/repo', 'owner/-repo',
    'owner/..', 'owner/.', '../repo', 'a'.repeat(40) + '/repo', 'owner/' + 'r'.repeat(101), '',
    'https://gitlab.com/o/r', 'http://github.com/o/r', 'https://user:pw@github.com/o/r', 'https://github.com:444/o/r',
    'https://github.com/o/r?x=1', 'https://github.com/o', 'git@github.com:o/r.git', 'ftp://github.com/o/r',
  ])('rejects %j', (repo) => {
    const r = parseRepoInput({ repo });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_repo');
  });

  it('accepts boundary lengths, trailing slash and .git', () => {
    expect(parseRepoInput({ repo: 'a'.repeat(39) + '/' + 'r'.repeat(100) }).ok).toBe(true);
    const r = parseRepoInput({ repo: 'https://github.com/o/r.git/' });
    expect(r.ok && r.value.fullName).toBe('o/r');
    expect(parseRepoInput({ repo: '  o/r  ' }).ok).toBe(true);
  });

  it('rejects non-string repo and bad refs', () => {
    expect(parseRepoInput({ repo: 42 as unknown as string }).ok).toBe(false);
    for (const ref of ['-x', 'a..b', 'a b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[', 'a\\b', 'a//b', '/a', 'a/', 'a.', 'a.lock', 'a@{1}', '@', '.hidden', 'x/.y', '--upload-pack=x']) {
      const r = parseRepoInput({ repo: 'o/r', ref });
      expect(r.ok, ref).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid_ref');
    }
  });

  it('accepts sha refs and treats empty/null ref as none', () => {
    expect(isValidRef('abcdef1')).toBe(true);
    expect(isValidRef('ABCDEF1234')).toBe(true);
    expect(isValidRef('feature/x-1.2')).toBe(true);
    for (const ref of [undefined, null, '']) {
      const r = parseRepoInput({ repo: 'o/r', ref });
      expect(r.ok && r.value.ref).toBeNull();
    }
  });
});

describe('score edge cases', () => {
  it('is 100 for no findings and ignores info', () => {
    expect(computeScore([])).toBe(100);
    expect(computeScore([{ severity: 'info' }, { severity: 'info' }])).toBe(100);
  });
  it('applies the weights exactly and floors at 0', () => {
    expect(computeScore([{ severity: 'critical' }, { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }])).toBe(39);
    expect(computeScore([{ severity: 'critical' }, { severity: 'critical' }, { severity: 'critical' }])).toBe(0);
    expect(computeScore(Array.from({ length: 500 }, () => ({ severity: 'low' as const })))).toBe(0);
  });
});

describe('merge/fingerprint edge cases', () => {
  const f = (o: Partial<RawFinding>): RawFinding => ({ severity: 'high', category: 'secrets', rule: 'r', title: 't', file: 'a.js', line: 1,
    explanation: 'e', fix: 'f', source: 'claude', ...o });

  it('handles empty inputs', () => {
    expect(mergeFindings([], [])).toEqual([]);
    expect(mergeFindings([f({})], [])).toHaveLength(1);
    expect(mergeFindings([], [f({ source: 'local' })])).toHaveLength(1);
  });
  it('dedups same (file,line,rule) with local priority, keeps distinct lines/files', () => {
    const out = mergeFindings([f({}), f({ line: 2 }), f({ file: 'b.js' })], [f({ source: 'local' })]);
    expect(out).toHaveLength(3);
    expect(out.find((x) => x.file === 'a.js' && x.line === 1)?.source).toBe('local');
  });
  it('does not collapse null lines of different files', () => {
    expect(mergeFindings([f({ line: null }), f({ line: null, file: 'z.js' })], [])).toHaveLength(2);
  });
  it('fingerprint is stable, whitespace-insensitive and rule/file sensitive', () => {
    const base = { rule: 'r', file: 'a.js', snippet: 'const  x = 1;' };
    expect(fingerprintOf(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base, snippet: ' const x =   1;\n' }));
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, rule: 'r2' }));
    expect(fingerprintOf(base)).not.toBe(fingerprintOf({ ...base, file: 'b.js' }));
  });
});

describe('budget edge cases', () => {
  it('trips at the limit (usd or tokens, cache tokens included) and not below', () => {
    const b = new BudgetTracker({ usd: 1, tokens: 100 });
    b.add(usage({ costUsd: 0.99, inputTokens: 60, outputTokens: 39 }));
    expect(b.exceeded).toBe(false);
    b.add(usage({ outputTokens: 1 }));
    expect(b.exceeded).toBe(true);
    const c = new BudgetTracker({ usd: 1, tokens: 1e9 });
    c.add(usage({ costUsd: 1.01 }));
    expect(c.exceeded).toBe(true);
    const d = new BudgetTracker({ usd: 99, tokens: 10 });
    d.add({ ...usage({}), cacheReadTokens: 10 });
    expect(d.exceeded).toBe(true);
  });
});

describe('egress parsing edge cases', () => {
  it('parses allowlist with spaces, empty items, explicit ports', () => {
    expect(parseAllowlist(' a.com , ,b.com:8443,')).toEqual([{ host: 'a.com', port: 443 }, { host: 'b.com', port: 8443 }]);
    expect(parseAllowlist('')).toEqual([]);
  });
  it('falls back safely on missing or malformed Proxy-Authorization', () => {
    for (const h of [undefined, '', 'Basic', 'Basic !!!notbase64', 'Bearer abc']) {
      const r = decodePurpose(h, 'api.github.com');
      expect(typeof r.purpose).toBe('string');
      expect(r.scanId).toBeNull();
    }
  });
});
