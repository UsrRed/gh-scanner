import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { envSchema } from '../../server/config/schema';

const readme = readFileSync('README.md', 'utf8');
const disclosure = readFileSync('content/outbound-disclosure.md', 'utf8');
const HEADING = '# Ce que ce logiciel envoie et à qui';

describe('README', () => {
  it('embeds the outbound disclosure verbatim', () => {
    const start = readme.indexOf(`\n${HEADING}\n`);
    expect(start).toBeGreaterThan(-1);
    expect(readme.slice(start + 1).trim()).toBe(disclosure.trim());
  });

  it('documents every config variable', () => {
    for (const name of Object.keys(envSchema.shape)) {
      expect(readme, name).toContain(`| \`${name}\` |`);
    }
  });

  it('has threat model, limits and both install modes', () => {
    for (const h of ['### Serveur', '### PC', '## Modèle de menaces', '## Limites connues', '## Première connexion']) {
      expect(readme).toContain(h);
    }
  });
});
