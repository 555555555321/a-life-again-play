#!/usr/bin/env node
// 王 2026-11-13：網站改由 gh-pages 分支發布；main 只放手機B 的開發檔。
// 這個測試確保 main 根目錄的 index.html 是手機B（截圖腳本 scripts/shoot_*.py 都從根目錄開頁面），
// 也確保建置好的網站檔案沒有再被提交到 main。
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let passed = 0;
const pass = name => { passed += 1; console.log('PASS', name); };

assert.match(html, /<title>再活一次・手機 B<\/title>/, 'root index.html must be Phone B');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const s of ['messages_text.js', 'messages_logic.js', 'messages.js', 'game.js']) {
  assert.ok(scripts.includes(s), `root index.html loads ${s}`);
  assert.ok(fs.existsSync(path.join(ROOT, s)), `${s} exists`);
}
assert.doesNotMatch(html, /round1\.js|ala-legacy/, 'root index.html is not the full game');
pass('root index.html is Phone B (title, scripts), not the full game');

// 只出現在建置好網站（npm run build:pages 輸出）裡的檔案，不該出現在 main。
const SITE_ONLY = ['round1.js', 'round1.css', 'build-info.json', 'phone-b', 'lib-pixi-stage.js', 'entry.js', 'favicon.svg'];
const leaked = SITE_ONLY.filter(f => fs.existsSync(path.join(ROOT, f)));
assert.deepEqual(leaked, [], `site files belong on gh-pages, not main: ${leaked.join(', ')}`);
pass('no published-site files on main (they live on gh-pages)');

console.log(`OK root_index_test.js (${passed})`);
