import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForSite } from '../scripts/publish-gh-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = path.join(root, '_tmp_ghpages');
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('one preparation replaces old files and preserves Git and .nojekyll without committing', async () => {
  await mkdir(temporary);
  const life = path.join(temporary, 'life');
  const phone = path.join(temporary, 'phone');
  const target = path.join(temporary, 'checkout');
  for (const destination of [life, phone]) command('git', ['clone', '--shared', '--no-checkout', root, destination]);
  command('git', ['clone', '--shared', root, target]);
  command('git', ['-C', target, 'switch', '-c', 'gh-pages']);
  const before = command('git', ['-C', target, 'rev-parse', 'HEAD']);
  const marker = await readFile(path.join(target, '.nojekyll'));
  const artifacts = path.join(life, 'artifacts', 'pages');
  await mkdir(path.join(artifacts, 'phone-b'), { recursive: true });
  await writeFile(path.join(artifacts, 'index.html'), '<html>fixture release 4730a1e</html>');
  await writeFile(path.join(artifacts, 'phone-b', 'index.html'), '<html>Phone B fixture</html>');
  await writeFile(path.join(artifacts, 'build-info.json'), JSON.stringify({ life: before.trim(), phone: before.trim(), fixture: true }));
  await writeFile(path.join(artifacts, '.nojekyll'), 'must not replace existing marker');
  const output = command(process.execPath, [path.join(root, 'scripts', 'publish-gh-pages.mjs'), life, phone, target, '--skip-build']);
  await writeFile(path.join(temporary, 'dry-run-output.txt'), output);
  console.log(output);
  assert.equal(command('git', ['-C', target, 'rev-parse', 'HEAD']), before);
  assert.deepEqual(await readFile(path.join(target, '.nojekyll')), marker);
  for (const file of ['index.html', 'phone-b/index.html', 'build-info.json']) assert.equal(await readFile(path.join(target, file), 'utf8'), await readFile(path.join(artifacts, file), 'utf8'));
  await assert.rejects(access(path.join(target, 'game.js')));
  assert.equal(command('git', ['-C', target, 'diff', '--cached', '--name-only']).trim(), '');
  assert.match(output, /Prepared only; no commit/);
});

test('poll accepts matching metadata and page content', async () => {
  const expected = { 'build-info.json': '{"version":"new"}', 'index.html': 'new page', 'phone-b/index.html': 'new phone' };
  const requests = [];
  await waitForSite(expected, { timeoutMs: 1000, fetcher: async url => {
    requests.push(url.href);
    return new Response(expected[url.pathname.replace('/a-life-again-play/', '')]);
  } });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => url.includes('publish_check=')));
});

test('matching version metadata with stale HTML times out', async () => {
  await assert.rejects(waitForSite({ 'build-info.json': 'new', 'index.html': 'new' }, {
    timeoutMs: 30, intervalMs: 10,
    fetcher: async url => new Response(url.pathname.endsWith('.json') ? 'new' : 'old'),
  }), /Pages did not match within 30 ms/);
});
