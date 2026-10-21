import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('app.css', () => {
  it('has no external URL or remote import', () => {
    expect(css).not.toMatch(/https?:\/\//i);
    expect(css).not.toMatch(/@import/i);
  });
  it('disables animations under prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none!important/);
  });
  it('defines stamp and meter animations', () => {
    expect(css).toContain('@keyframes stamp-in');
    expect(css).toContain('@keyframes meter-fill');
  });
});
