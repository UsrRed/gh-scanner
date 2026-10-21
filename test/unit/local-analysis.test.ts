import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makeVulnRepo, fakeSecret } from '../fixtures/make-vuln-repo.js';
import { buildInventory } from '../../server/cloner/inventory.js';
import { initRedaction } from '../../server/redact/index.js';
import { runLocalDetectors, extractSnippet, fingerprintOf, mergeFindings, computeScore, type RawFinding } from '../../server/analysis/index.js';

let dir: string;
let findings: RawFinding[];
beforeAll(async () => {
  initRedaction({ dataDir: '/data', workDir: '/data/work', hostname: 'h', username: 'u' });
  dir = makeVulnRepo(path.join(mkdtempSync(path.join(tmpdir(), 'la-')), 'r'), { git: false });
  findings = await runLocalDetectors(dir, await buildInventory(dir));
});

describe('local detectors', () => {
  it('detects the 4 planted flaws with file:line', () => {
    const secret = findings.find((f) => f.category === 'secrets')!;
    expect(secret).toMatchObject({ severity: 'critical', file: 'src/config.js', line: 1 });
    expect(secret.title).not.toContain(fakeSecret());
    expect(findings.find((f) => f.rule === 'ci-pull-request-target-checkout')).toMatchObject({ severity: 'high', file: '.github/workflows/pr.yml', line: 2 });
    expect(findings.find((f) => f.category === 'install-scripts')).toMatchObject({ file: 'package.json' });
    expect(findings.find((f) => f.category === 'prompt-injection')).toMatchObject({ file: 'README.md', line: 5 });
  });
  it('never leaks a full secret nor exceeds 20 lines', async () => {
    for (const f of findings) {
      expect(f.snippet ?? '').not.toContain(fakeSecret());
      expect((f.snippet ?? '').split('\n').length).toBeLessThanOrEqual(20);
      expect(JSON.stringify(f)).not.toContain(fakeSecret());
    }
    writeFileSync(path.join(dir, 'big.txt'), Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n'));
    expect((await extractSnippet(dir, 'big.txt', 50, 500)).split('\n').length).toBe(20);
    expect(await extractSnippet(dir, '../etc/passwd', 1)).toBe('');
  });
});

describe('fingerprint / merge / score', () => {
  it('fingerprint stable and whitespace-insensitive', () => {
    const a = fingerprintOf({ rule: 'r', file: 'f', snippet: 'a  b\n c' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf({ rule: 'r', file: 'f', snippet: 'a b c' })).toBe(a);
    expect(fingerprintOf({ rule: 'r2', file: 'f', snippet: 'a b c' })).not.toBe(a);
  });
  it('merge dedups claude/local duplicates', () => {
    const base = { severity: 'high', category: 'secrets', title: 't', explanation: '', fix: '' } as const;
    const local: RawFinding = { ...base, rule: 'secret-aws-key', file: 'a', line: 3, source: 'local' };
    const claude: RawFinding = { ...base, rule: 'secret-aws-key', file: 'a', line: 3, source: 'claude' };
    const other: RawFinding = { ...base, rule: 'x', category: 'quality', file: 'a', line: 9, source: 'claude' };
    const m = mergeFindings([claude, other], [local]);
    expect(m).toHaveLength(2);
    expect(m[0]!.source).toBe('local');
  });
  it('score', () => {
    expect(computeScore([{ severity: 'critical' }, { severity: 'high' }])).toBe(45);
    expect(computeScore(Array(5).fill({ severity: 'critical' }))).toBe(0);
  });
});
