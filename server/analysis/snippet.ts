import { redact } from '../redact/index.js';
import { truncateSecrets } from './detectors/secrets.js';
import { readText } from './detectors/util.js';

const HARD_MAX = 20;

/** Reads an excerpt (≤ maxLines, never more than 20) around `line` from the clone, secrets truncated then redacted. */
export async function extractSnippet(dir: string, file: string, line: number | null, maxLines = HARD_MAX): Promise<string> {
  const text = await readText(dir, file);
  if (text === null) return '';
  const n = Math.max(1, Math.min(maxLines, HARD_MAX));
  const lines = text.split(/\r?\n/);
  const center = line && line > 0 ? Math.min(line, lines.length) : 1;
  const start = line ? Math.max(1, center - Math.floor((n - 1) / 2)) : 1;
  const slice = lines.slice(start - 1, start - 1 + n).map((l) => (l.length > 300 ? l.slice(0, 300) + '…' : l));
  return redact(truncateSecrets(slice.join('\n')), { repoContent: true });
}
