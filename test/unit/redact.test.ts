import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initRedaction, redact, redactDeep, truncateSecret, registerSecret } from '../../server/redact/index.js';
import { log, safeErrorMessage } from '../../server/log.js';

beforeEach(() => initRedaction({ dataDir: '/data', workDir: '/data/work', hostname: 'myhost', username: 'alice' }));

describe('redact', () => {
  it('paths', () => {
    expect(redact('at /data/work/abc123/src/x.js')).toBe('at <repo>/src/x.js');
    expect(redact('db /data/scanner.db')).toBe('db <data>/scanner.db');
  });
  it('hostname and username', () => {
    expect(redact('on myhost by alice')).toBe('on <host> by <user>');
    expect(redact('malice')).toBe('malice');
  });
  it('ips', () => {
    expect(redact('10.1.2.3 and 8.8.8.8')).toBe('<ip> and <ip>');
    expect(redact('8.8.8.8 127.0.0.1 203.0.113.5', { repoContent: true })).toBe('8.8.8.8 127.0.0.1 203.0.113.5');
    expect(redact('127.0.0.1 0.0.0.0 192.0.2.1')).toBe('127.0.0.1 0.0.0.0 192.0.2.1');
  });
  it('tokens', () => {
    expect(redact('t=ghp_' + 'a'.repeat(36))).toBe('t=[REDACTED:github-token]');
    expect(redact('github_pat_' + 'A1_'.repeat(10))).toBe('[REDACTED:github-pat]');
    expect(redact('sk-ant-api03-abcdefghij')).toBe('[REDACTED:anthropic-key]');
    expect(redact('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED:aws-key]');
    expect(redact('eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4')).toBe('[REDACTED:jwt]');
    expect(redact('-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\nok')).toBe('[REDACTED:private-key]\nok');
  });
  it('registered secrets', () => {
    registerSecret('supersecretvalue', 'secret');
    expect(redact('x supersecretvalue')).toBe('x [REDACTED:secret]');
  });
  it('leaves ordinary text', () => {
    for (const t of ['Hello world', 'version 1.2.3', 'node v22.1.0 released', 'lodash@4.17.21', 'See README.md line 12'])
      expect(redact(t)).toBe(t);
  });
  it('truncateSecret never returns whole', () => {
    expect(truncateSecret('AKIAIOSFODNN7')).toBe('AKIA…');
    expect(truncateSecret('abc')).not.toContain('abc');
    expect(truncateSecret('')).toBe('…');
  });
  it('redactDeep', () => {
    const r = redactDeep({ a: ['by alice', { b: 'AKIAIOSFODNN7EXAMPLE' }], n: 3 });
    expect(r).toEqual({ a: ['by <user>', { b: '[REDACTED:aws-key]' }], n: 3 });
  });
});

describe('log', () => {
  it('redacts and emits no stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('fail', new Error('boom alice'));
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('boom <user>');
    expect(line).not.toContain('    at ');
    spy.mockRestore();
    expect(safeErrorMessage(new Error('x myhost'))).toBe('x <host>');
  });
});
