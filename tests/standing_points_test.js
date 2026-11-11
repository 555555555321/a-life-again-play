#!/usr/bin/env node
// Standing-points CSV: parse, apply to a cast member, and (with Playwright)
// prove that changing the CSV moves the sprite on style_trial_mom_a5c.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SP = require('../standing_points.js');

function pass(name) { console.log('PASS', name); }

const csv = fs.readFileSync(path.join(ROOT, 'data/standing_points.csv'), 'utf8');
const rows = SP.parse(csv);
assert.ok(rows.length >= 8, 'expected family + action rows, got ' + rows.length);
const mom = SP.lookup(rows, 'mom_A_r5c');
assert.ok(mom, 'mom_A_r5c missing');
assert.strictEqual(mom.x, 295);
assert.strictEqual(mom.floor_y, 252);
assert.strictEqual(mom.status, 'pass');
assert.strictEqual(SP.lookup(rows, 'dad_walk').x, 291);
assert.strictEqual(SP.lookup(rows, 'grandma').status, 'pending_redraw');
assert.strictEqual(SP.lookup(rows, 'action_write').status, 'pending_scene');
assert.strictEqual(SP.lookup(rows, 'no_such'), null);
pass('parse and lookup');

const placed = SP.applyToCastMember({ id: 'mother', x: 100, feet: 200, standing_group: 'mom_A_r5c' }, rows);
assert.strictEqual(placed.x, 295);
assert.strictEqual(placed.feet, 252);
const unchanged = SP.applyToCastMember({ id: 'mother', x: 100, feet: 200 }, rows);
assert.strictEqual(unchanged.x, 100);
pass('applyToCastMember uses standing_group and leaves others alone');

const movedCsv = csv.replace(/^mom_A_r5c,([^,]+),([^,]+),295,/m, 'mom_A_r5c,$1,$2,310,');
const movedRows = SP.parse(movedCsv);
assert.strictEqual(SP.lookup(movedRows, 'mom_A_r5c').x, 310);
const before = SP.applyToVersion({ id: 'a5c_12', src: 'x', x: 295, feet: 252 }, 'mom_A_r5c', rows);
const after = SP.applyToVersion({ id: 'a5c_12', src: 'x', x: 295, feet: 252 }, 'mom_A_r5c', movedRows);
assert.strictEqual(before.x, 295);
assert.strictEqual(after.x, 310);
assert.notStrictEqual(before.x, after.x);
pass('changing the CSV moves the applied sprite x (unit)');

const py = path.join(__dirname, 'standing_points_move_test.py');
if (fs.existsSync(py)) {
  const r = spawn(process.env.PYTHON || '/usr/bin/python3', [py], {stdio: 'inherit'});
  r.on('exit', (code) => process.exit(code || 0));
} else {
  console.log('SKIP browser move test (tests/standing_points_move_test.py missing)');
}
