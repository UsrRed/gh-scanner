import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { initRedaction } from '../../server/redact/index.js';
import { renderPrompt, systemPrompt, PASS2_BATCHES } from '../../server/analysis/prompts.js';
import { MappingOutput, TargetedOutput, SynthesisOutput } from '../../server/analysis/schemas.js';
import { BudgetTracker } from '../../server/analysis/budget.js';

const u = (o: Partial<Record<string, number>> = {}) => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0, ...o });

beforeAll(() => initRedaction({ dataDir: '/data', workDir: '/data/work', hostname: 'myhost', username: 'alice', homeDir: '/home/alice' }));

describe('schemas', () => {
  const f = { severity: 'high', category: 'secrets', rule: 'hard-coded-key', title: 't', file: 'a/b.js', line: 3, explanation: 'e', fix: 'f' };
  it('accepts valid output', () => {
    expect(TargetedOutput.safeParse({ findings: [f] }).success).toBe(true);
    expect(SynthesisOutput.safeParse({ verdict: 'caution', justification: 'j', keyRisks: [] }).success).toBe(true);
    expect(MappingOutput.safeParse({ languages: [], entryPoints: [], manifests: [], lockfiles: [], ciWorkflows: [], installScripts: [], riskZones: [] }).success).toBe(true);
  });
  it('rejects bad severity, missing fields, traversal', () => {
    expect(TargetedOutput.safeParse({ findings: [{ ...f, severity: 'bogus' }] }).success).toBe(false);
    const { fix: _fix, ...noFix } = f;
    expect(TargetedOutput.safeParse({ findings: [noFix] }).success).toBe(false);
    expect(TargetedOutput.safeParse({ findings: [{ ...f, file: '../x' }] }).success).toBe(false);
    expect(SynthesisOutput.safeParse({ verdict: 'ok', justification: '', keyRisks: [] }).success).toBe(false);
  });
});

describe('budget', () => {
  it('flags tokens and usd overrun', () => {
    const a = new BudgetTracker({ usd: 1, tokens: 100 });
    a.add(u({ inputTokens: 60 })); expect(a.exceeded).toBe(false);
    a.add(u({ outputTokens: 50 })); expect(a.exceeded).toBe(true);
    const b = new BudgetTracker({ usd: 1, tokens: 1e9 });
    b.add(u({ costUsd: 1.5 })); expect(b.exceeded).toBe(true);
    expect(b.total.costUsd).toBe(1.5);
  });
});

describe('prompts', () => {
  it('system has anti-injection rule', () => {
    expect(systemPrompt()).toMatch(/DONNÉE/);
    expect(systemPrompt()).toContain('prompt-injection');
  });
  it('renders with marker, no abs path or token', () => {
    const tok = 'ghp_' + 'a'.repeat(36);
    const out = renderPrompt('mapping', { repo: 'o/n', ref: 'main', inventory: `/data/work/abc/src/x.js\n${tok}` });
    expect(out.startsWith('PASS: mapping')).toBe(true);
    expect(out).not.toContain(tok);
    expect(out).not.toContain('/data/work');
  });
  it('renders every batch and synthesis', () => {
    for (const b of PASS2_BATCHES) {
      const o = renderPrompt('targeted', { repo: 'o/n', batch: b.id, mapping: '{}' });
      expect(o).toContain('PASS: targeted');
      expect(o).not.toContain('SECTION:');
      expect(o).not.toMatch(/\{\{(batch|section)\}\}/);
    }
    expect(renderPrompt('synthesis', { repo: 'o/n', findings: '[]', score: '100' })).toContain('PASS: synthesis');
    expect(fs.existsSync(path.join('prompts', 'VERSION'))).toBe(true);
  });
});
