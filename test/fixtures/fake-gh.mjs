#!/usr/bin/env node
// Fake `gh` CLI. Scenario read from $GH_CONFIG_DIR/.fake-gh.json:
// { loggedIn=true, user='octocat', token, fixtureDir, cloneError, deviceCode='ABCD-1234' }
import { openSync, readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const cfgDir = process.env.GH_CONFIG_DIR ?? '';
const scFile = path.join(cfgDir, '.fake-gh.json');
const stateFile = path.join(cfgDir, '.fake-gh-state.json');
const sc = existsSync(scFile) ? JSON.parse(readFileSync(scFile, 'utf8')) : {};
const user = sc.user ?? 'octocat';
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { loggedIn: sc.loggedIn ?? true };
const save = () => { mkdirSync(cfgDir, { recursive: true }); writeFileSync(stateFile, JSON.stringify(state)); };
const fail = (msg, code = 1) => { console.error(msg); process.exit(code); };

const [a, b] = args;
if (a === '--version') console.log('gh version 0.0.0-fake');
else if (a === 'auth' && b === 'status') {
  if (!state.loggedIn) fail('You are not logged into any GitHub hosts. To log in, run: gh auth login');
  console.log(`github.com\n  ✓ Logged in to github.com account ${user} (keyring)`);
} else if (a === 'auth' && b === 'login') {
  const code = sc.deviceCode ?? 'ABCD-1234';
  console.log(`! First copy your one-time code: ${code}`);
  console.log('Open this URL to continue in your web browser: https://github.com/login/device');
  const finish = () => { state.loggedIn = true; save(); console.log(`✓ Authentication complete.\n✓ Logged in as ${user}`); process.exit(0); };
  if (sc.loginWait === false) finish(); else setTimeout(finish, sc.loginDelayMs ?? 300);
} else if (a === 'auth' && b === 'logout') {
  state.loggedIn = false; save(); console.log(`✓ Logged out of github.com account ${user}`);
} else if (a === 'auth' && b === 'token') {
  if (!state.loggedIn) fail('no oauth token');
  console.log(sc.token ?? 'gho_FAKETOKEN0000000000000000000000000000');
} else if (a === 'api') {
  if (!state.loggedIn) fail('gh: authentication required (HTTP 401)');
  if (b === 'user') console.log(JSON.stringify({ login: user, id: 1 }));
  else console.log('{}');
} else if (a === 'repo' && b === 'clone') {
  if (!state.loggedIn) fail('gh: authentication required');
  if (sc.cloneError) fail(sc.cloneError);
  const repo = args[2], dest = args[3];
  if (!repo || !dest) fail('usage: gh repo clone <repo> <dest>');
  if (!sc.fixtureDir) fail('fake-gh: fixtureDir not configured');
  const sh = path.join(sc.fixtureDir, '.git');
  rmSync(dest, { recursive: true, force: true });
  cpSync(sc.fixtureDir, dest, { recursive: true, verbatimSymlinks: true, filter: (s) => s !== sh && !s.startsWith(sh + path.sep) });
  const git = (...g) => { const r = spawnSync('git', g, { cwd: dest, encoding: 'utf8' }); if (r.status !== 0) fail(`git ${g[0]} failed: ${r.stderr}`); };
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');
  git('remote', 'add', 'origin', sc.originUrl ?? `https://github.com/${repo}.git`);
  if (sc.cloneMode === 'huge') spawnSync('head', ['-c', String(sc.hugeBytes ?? 3 * 1024 * 1024), '/dev/zero'], { stdio: ['ignore', openSync(path.join(dest, 'huge.bin'), 'w'), 'ignore'] });
  if (sc.cloneMode === 'slow') await new Promise((r) => setTimeout(r, 60000));
  console.error(`Cloning into '${dest}'...`);
} else fail(`fake-gh: unsupported: ${args.join(' ')}`, 2);
