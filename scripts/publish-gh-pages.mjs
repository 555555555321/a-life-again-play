import { spawnSync } from 'node:child_process';
import { cp, lstat, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = '555555555321/a-life-again-play';
const site = `https://555555555321.github.io/a-life-again-play/`;

function run(command, args, cwd, env = process.env, timeout) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: false, timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function git(dir, ...args) { return run('git', ['-C', dir, ...args]); }
function contains(parent, child) { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); }

async function rejectLinks(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if ((await lstat(name)).isSymbolicLink()) throw new Error(`Symbolic link is not allowed in artifacts: ${name}`);
    if (entry.name === '.git') throw new Error(`Artifacts must not contain .git: ${name}`);
    if (entry.isDirectory()) await rejectLinks(name);
  }
}

export async function syncPages(source, target) {
  for (const name of await readdir(target)) {
    if (name !== '.git' && name !== '.nojekyll') await rm(path.join(target, name), { recursive: true, force: true });
  }
  for (const name of await readdir(source)) {
    if (name !== '.nojekyll') await cp(path.join(source, name), path.join(target, name), { recursive: true });
  }
  try { await lstat(path.join(target, '.nojekyll')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(path.join(target, '.nojekyll'), ''); }
}

export async function waitForSite(expected, { base = site, timeoutMs = 600_000, intervalMs = 15_000, fetcher = fetch, trigger } = {}) {
  const deadline = Date.now() + Math.min(timeoutMs, 600_000);
  const started = Date.now();
  let triggered = false;
  let last = 'No response';
  while (Date.now() < deadline) {
    try {
      let matches = true;
      for (const [file, content] of Object.entries(expected)) {
        const url = new URL(file, base);
        url.searchParams.set('publish_check', `${Date.now()}`);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Deadline reached');
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(Math.min(20_000, remaining)) });
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
        if (await response.text() !== content) { matches = false; last = `${file}: content/version mismatch`; }
      }
      if (matches) { console.log('Online version and pages match the published artifacts.'); return; }
    } catch (error) { last = error.message; }
    if (trigger && !triggered && Date.now() - started >= 120_000) {
      triggered = true;
      try { await trigger(); } catch (error) { console.warn(`Pages rebuild request failed: ${error.message}`); }
    }
    console.log(`Waiting for Pages: ${last}`);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(intervalMs, deadline - Date.now()))));
  }
  throw new Error(`Pages did not match within ${Math.min(timeoutMs, 600_000)} ms: ${last}`);
}

export async function main(args = process.argv.slice(2)) {
  const flags = new Set(args.filter(arg => arg.startsWith('--')));
  const dirs = args.filter(arg => !arg.startsWith('--'));
  if (flags.has('--help')) { console.log('node scripts/publish-gh-pages.mjs <A-Life-Again> <Phone-B> <gh-pages-checkout> [--skip-build] [--push] [--request-build]'); return; }
  if (dirs.length !== 3 || [...flags].some(flag => !['--skip-build', '--push', '--request-build'].includes(flag))) throw new Error('Expected three paths; use --help for usage.');
  if (flags.has('--request-build') && !flags.has('--push')) throw new Error('--request-build requires --push');
  if (flags.has('--skip-build') && flags.has('--push')) throw new Error('--skip-build is for local preparation only; --push requires a fresh build.');
  const [life, phone, target] = await Promise.all(dirs.map(dir => realpath(dir)));
  for (const source of [life, phone]) {
    if (contains(source, target) || contains(target, source)) throw new Error('Source and destination checkouts must not overlap.');
  }
  for (const dir of [life, phone, target]) {
    if (await realpath(git(dir, 'rev-parse', '--show-toplevel')) !== dir) throw new Error(`Path must be a checkout root: ${dir}`);
  }
  if (git(target, 'branch', '--show-current') !== 'gh-pages') throw new Error('Destination must be on gh-pages.');
  if (git(target, 'status', '--porcelain')) throw new Error('Destination must be clean before replacement.');
  const hashes = [git(life, 'rev-parse', '--short', 'HEAD'), git(phone, 'rev-parse', '--short', 'HEAD')];
  const message = `pages: A-Life-Again ${hashes[0]} + Phone B ${hashes[1]}`;
  if (flags.has('--push')) {
    for (const dir of [life, phone]) if (git(dir, 'status', '--porcelain')) throw new Error(`Source must be clean for publishing: ${dir}`);
    const remote = git(target, 'remote', 'get-url', '--push', 'origin');
    if (!new RegExp(`^(https://github\\.com/|git@github\\.com:|ssh://git@github\\.com/)${repository}(\\.git)?$`).test(remote)) throw new Error(`Unexpected origin push URL: ${remote}`);
  }
  if (!flags.has('--skip-build')) {
    const pkg = JSON.parse(await readFile(path.join(life, 'package.json'), 'utf8'));
    if (!pkg.scripts?.['build:pages']) throw new Error('A-Life-Again has no build:pages script; use the intended source checkout.');
    const env = { ...process.env, PHONE_B_DIR: phone };
    const output = process.platform === 'win32'
      ? run('cmd.exe', ['/d', '/s', '/c', 'npm run build:pages'], life, env)
      : run('npm', ['run', 'build:pages'], life, env);
    console.log(output);
  }
  const artifacts = await realpath(path.join(life, 'artifacts', 'pages'));
  if (!contains(life, artifacts)) throw new Error('Artifacts must be inside A-Life-Again.');
  await rejectLinks(artifacts);
  const expected = {};
  for (const file of ['build-info.json', 'index.html', 'phone-b/index.html']) expected[file] = await readFile(path.join(artifacts, file), 'utf8');
  JSON.parse(expected['build-info.json']);
  if (!expected['index.html'].trim() || !expected['phone-b/index.html'].trim()) throw new Error('Empty page artifact');
  console.log(message);
  console.log(`Version source: ${path.join(artifacts, 'build-info.json')}`);
  await syncPages(artifacts, target);
  console.log(git(target, 'diff', '--stat') || 'No tracked-file changes.');
  console.log(`Untracked files:\n${git(target, 'ls-files', '--others', '--exclude-standard') || '(none)'}`);
  if (!flags.has('--push')) { console.log('Prepared only; no commit, push, build request or online polling.'); return; }
  git(target, 'add', '--all');
  if (git(target, 'diff', '--cached', '--name-only')) console.log(git(target, 'commit', '-m', message));
  else console.log('No changes to commit; pushing current gh-pages and checking deployment.');
  console.log(git(target, 'push', 'origin', 'HEAD:refs/heads/gh-pages'));
  await waitForSite(expected, { trigger: flags.has('--request-build') ? () => run('gh', ['api', '-X', 'POST', `repos/${repository}/pages/builds`], target, process.env, 20_000) : undefined });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
