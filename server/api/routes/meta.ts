import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { contentDir } from '../../paths.js';

export function registerMetaRoutes(app: FastifyInstance, opts: { disclosureFile?: string } = {}): void {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/disclosure', async () => ({
    markdown: readFileSync(opts.disclosureFile ?? path.join(contentDir(), 'outbound-disclosure.md'), 'utf8'),
  }));
}
