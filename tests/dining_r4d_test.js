#!/usr/bin/env node
// dining_r4d config, layer order, placement and standing rows. No DOM.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const D = require('../dining_r4d.js');
const SP = require('../standing_points.js');
const cfg = require('../data/dining_r4d.json');
const scenes = require('../scenes.json');
function pass(name) { console.log('PASS', name); }

assert.deepStrictEqual(cfg.layer_order, ['plate', 'sprite', 'dining_fg', 'front_mask']);
for (const p of cfg.poses) {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, p.dir, 'person_spec.json'), 'utf8'));
  assert.deepStrictEqual(spec.layer_order, cfg.layer_order, p.id + ' person_spec layer_order');
  assert.deepStrictEqual(spec.canvas, p.canvas, p.id + ' canvas');
  assert.deepStrictEqual(spec.anchor, p.anchor, p.id + ' anchor');
  assert.strictEqual(spec.frame_count, p.frames, p.id + ' frame count');
  assert.strictEqual(spec.ground_row, p.anchor[1], p.id + ' ground row is anchor y');
  for (let i = 0; i < p.frames; i++) {
    for (const kind of ['frames', 'front_mask']) assert.ok(fs.existsSync(path.join(ROOT, D.framePath(p, kind, i))), D.framePath(p, kind, i));
  }
  assert.ok(!fs.existsSync(path.join(ROOT, D.framePath(p, 'frames', p.frames))), p.id + ' has no extra frame');
}
const you = cfg.poses.find(p => p.id === 'you_sit_table');
const mom = cfg.poses.find(p => p.id === 'mom_place_chopsticks');
assert.deepStrictEqual([you.frames, you.canvas, you.anchor], [4, [72, 116], [27, 115]]);
assert.deepStrictEqual([mom.frames, mom.canvas, mom.anchor], [8, [78, 116], [33, 115]]);
pass('config matches person_spec: you 4×72×116 anchor (27,115), mom 8×78×116 anchor (33,115), 4-layer order');

const rows = SP.parse(fs.readFileSync(path.join(ROOT, 'data/standing_points.csv'), 'utf8'));
const placed = cfg.poses.map(p => D.applyStanding(p, rows));
assert.deepStrictEqual(placed.map(p => [p.x, p.feet]), [[200, 252], [319, 252]]);
for (const p of cfg.poses) assert.strictEqual(SP.lookup(rows, p.standing_group).status, 'pass');
assert.deepStrictEqual(D.placement(placed[0]), { left: 173, top: 137, w: 72, h: 116 });
assert.deepStrictEqual(D.placement(placed[1]), { left: 286, top: 137, w: 78, h: 116 });
const moved = rows.map(r => r.group_id === mom.standing_group ? Object.assign({}, r, { x: 330 }) : r);
assert.strictEqual(D.applyStanding(mom, moved).x, 330);
const pending = rows.map(r => r.group_id === mom.standing_group ? Object.assign({}, r, { x: 330, status: 'pending_redraw' }) : r);
assert.strictEqual(D.applyStanding(mom, pending).x, 319);
for (const p of placed) {
  const pl = D.placement(p);
  assert.ok(pl.left >= 0 && pl.left + pl.w <= cfg.scene_size[0] && pl.top >= 0 && pl.top + pl.h <= cfg.scene_size[1], p.id + ' inside scene');
}
pass('standing rows place you x=200 / mom x=319 feet 252; only pass rows apply; canvases inside 480×270');

const list = D.drawList(cfg, [1, 5]);
assert.deepStrictEqual(list.map(e => e.layer + (e.pose ? ':' + e.pose + ':' + e.frame : '')), [
  'plate', 'sprite:you_sit_table:1', 'sprite:mom_place_chopsticks:5', 'dining_fg', 'front_mask:you_sit_table:1', 'front_mask:mom_place_chopsticks:5']);
pass('draw list: plate, every sprite, dining_fg, every front_mask');

assert.strictEqual(D.frameIndex(mom, 9, 0, 125), 1);
assert.strictEqual(D.frameIndex(you, 6, 0, 125), 2);
assert.strictEqual(D.frameIndex(mom, null, 125 * 11, 125), 3);
assert.strictEqual(D.frameIndex(you, null, 125 * 11, 125), 3);
pass('frameIndex: fixed frame wraps per pose; animation steps every frame_ms');

assert.ok(scenes.screens.dining_r4d && scenes.screens.dining_r4d.dev_only === true);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(html.indexOf('dining_r4d.js') > html.indexOf('standing_points.js') && html.indexOf('dining_r4d.js') < html.indexOf('src="game.js"'));
pass('dev-only screen registered; dining_r4d.js loads after standing_points.js and before game.js');
