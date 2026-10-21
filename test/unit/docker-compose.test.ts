import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const compose = parse(readFileSync('docker-compose.yml', 'utf8'));
const dockerfile = readFileSync('Dockerfile', 'utf8');
const services = compose.services as Record<string, any>;

describe('docker-compose', () => {
  it('has app and egress with an internal-only network for app', () => {
    expect(Object.keys(services).sort()).toEqual(['app', 'egress']);
    expect(compose.networks.internal.internal).toBe(true);
    expect(services.app.networks).toEqual(['internal']);
    expect(services.egress.networks).toEqual(expect.arrayContaining(['internal', 'outside']));
    expect(compose.networks.outside?.internal).not.toBe(true);
    expect(services.egress.command).toEqual(['node', 'dist/egress.js']);
  });

  it('hardens every service', () => {
    for (const s of Object.values(services)) {
      expect(s.cap_drop).toEqual(['ALL']);
      expect(s.read_only).toBe(true);
      expect(s.security_opt).toContain('no-new-privileges:true');
      expect(String(s.user)).toBe('10001');
      expect(s.tmpfs).toContain('/tmp');
    }
  });

  it('uses only named volumes, no docker.sock nor env_file', () => {
    expect(Object.keys(compose.volumes).sort()).toEqual(['egress-shared', 'scanner-data']);
    for (const s of Object.values(services)) {
      expect(s.env_file).toBeUndefined();
      for (const v of (s.volumes ?? []) as string[]) {
        expect(v).not.toMatch(/docker\.sock/);
        expect(v).toMatch(/^(scanner-data|egress-shared):/);
      }
    }
  });

  it('publishes only 127.0.0.1:8417, through egress', () => {
    expect(services.app.ports).toBeUndefined();
    expect(services.egress.ports).toEqual(['127.0.0.1:8417:8417']);
  });
});

describe('Dockerfile', () => {
  it('runs as uid 10001 with pinned versions', () => {
    expect(dockerfile).toMatch(/^USER 10001$/m);
    expect(dockerfile).not.toMatch(/latest/i);
    expect(dockerfile).toMatch(/CLAUDE_CODE_VERSION=\d+\.\d+\.\d+/);
    expect(dockerfile).toMatch(/GH_SHA256_AMD64=[0-9a-f]{64}/);
    expect(dockerfile).toMatch(/^CMD \["node", "dist\/index\.js"\]$/m);
  });
});
