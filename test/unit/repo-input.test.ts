import { describe, expect, it } from 'vitest';
import { isValidRef, parseRepoInput } from '../../server/repo-input/index.js';

const ok = (repo: string, ref?: string | null) => {
  const r = parseRepoInput({ repo, ref });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('parseRepoInput', () => {
  it.each([
    ['octo/hello', 'octo/hello'],
    ['https://github.com/octo/hello', 'octo/hello'],
    ['https://github.com/octo/hello.git', 'octo/hello'],
    ['https://github.com/octo/hello/', 'octo/hello'],
    ['a-b/c.d_e-f', 'a-b/c.d_e-f'],
  ])('accepts %s', (i, full) => expect(ok(i).fullName).toBe(full));

  it.each([
    'https://gitlab.com/o/r', 'https://evil.com/github.com/o/r', 'octo/../x', '../hello', 'octo/..',
    'oc to/hello', 'octo/hel lo', '-x/hello', 'octo/-x', 'https://user:pass@github.com/o/r',
    'http://github.com/o/r', 'git@github.com:o/r.git', 'octo', 'a/b/c', '', 'o_o/r', 'https://github.com:8443/o/r',
    'https://github.com/o/r?x=1',
  ])('rejects %j', (i) => {
    const r = parseRepoInput({ repo: i });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_repo');
  });

  it('rejects too long owner', () => expect(parseRepoInput({ repo: 'a'.repeat(40) + '/r' }).ok).toBe(false));

  it('handles refs', () => {
    expect(ok('o/r', 'main').ref).toBe('main');
    expect(ok('o/r', 'feature/x-1').ref).toBe('feature/x-1');
    expect(ok('o/r', 'DEADBEEF1234').ref).toBe('DEADBEEF1234');
    expect(ok('o/r').ref).toBeNull();
    expect(ok('o/r', '').ref).toBeNull();
    for (const bad of ['-x', 'a..b', 'a b', 'a~1', 'x.lock', 'a//b', '/a', 'a/', 'a@{1}', '@', 'a:b', '.hid']) {
      const r = parseRepoInput({ repo: 'o/r', ref: bad });
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid_ref');
    }
  });

  it('isValidRef', () => {
    expect(isValidRef('v1.2.3')).toBe(true);
    expect(isValidRef('--upload-pack=x')).toBe(false);
  });
});
