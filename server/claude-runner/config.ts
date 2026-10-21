import type { Config } from '../config/index.js';

let current: Config | null = null;

/** Must be called once at startup (and by tests) before any session. */
export function initClaudeRunner(config: Config): void { current = config; }

export function getConfig(): Config {
  if (!current) throw new Error('claude-runner not initialised: call initClaudeRunner(config)');
  return current;
}
