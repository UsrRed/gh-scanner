import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/index.js';
import { resolveBin } from '../proc/spawn.js';

/** Writes <data>/git/gitconfig: no hooks, gh credential helper, no submodules, no LFS filters. */
export function writeGitConfig(c: Config): string {
  const file = path.join(c.dataDir, 'git', 'gitconfig');
  mkdirSync(path.dirname(file), { recursive: true });
  const { cmd, prefixArgs } = resolveBin(c.ghBin);
  const helper = [cmd, ...prefixArgs].map((s) => `"${s.replace(/(["\\])/g, '\\$1')}"`).join(' ') + ' auth git-credential';
  writeFileSync(file, [
    '[core]', '\thooksPath = /dev/null', '\tfsmonitor = false',
    '[credential]', `\thelper = !${helper}`,
    '[submodule]', '\trecurse = false',
    '[protocol "file"]', '\tallow = user',
    '[filter "lfs"]', '\tclean =', '\tsmudge =', '\tprocess =', '\trequired = false',
    '',
  ].join('\n'));
  return file;
}
