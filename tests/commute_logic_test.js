#!/usr/bin/env node
// Seeded tests for commute playback and road events. No DOM.
const assert = require('assert');
const L = require('../commute_logic.js');

function pass(name) { console.log('PASS', name); }

// shouldPlayCommute
assert.strictEqual(L.shouldPlayCommute({ force: true, seed: 'x' }), true);
assert.strictEqual(L.shouldPlayCommute({ isFirstWorkday: true, seed: 'x' }), true);
assert.strictEqual(L.shouldPlayCommute({ isNewCar: true, seed: 'x' }), true);
assert.strictEqual(L.shouldPlayCommute({ isNewJob: true, seed: 'x' }), true);
// 1-in-5 is deterministic per seed
const playA = L.shouldPlayCommute({ seed: 'alpha' });
const playB = L.shouldPlayCommute({ seed: 'alpha' });
assert.strictEqual(playA, playB);
let hits = 0;
for (let i = 0; i < 1000; i++) if (L.shouldPlayCommute({ seed: 'batch:' + i })) hits++;
assert.ok(hits >= 160 && hits <= 240, '1-in-5 rate was ' + hits);
// a seed that does not play (cut straight to the scene)
const silent = [];
for (let i = 0; i < 40; i++) if (!L.shouldPlayCommute({ seed: 'quiet:' + i })) silent.push('quiet:' + i);
assert.ok(silent.length > 0);
assert.strictEqual(L.shouldPlayCommute({ seed: silent[0] }), false);
pass('shouldPlayCommute force / flags / 1-in-5 / silent seed ' + silent[0]);

// pickNoCarMode
assert.strictEqual(L.pickNoCarMode({ seed: 'z' }), L.pickNoCarMode({ seed: 'z' }));
const modes = new Set();
for (let i = 0; i < 60; i++) modes.add(L.pickNoCarMode({ seed: 'm:' + i }));
assert.deepStrictEqual(new Set([...modes].sort()), new Set(['bike', 'bus', 'scooter']));
for (let i = 0; i < 40; i++) {
  const m = L.pickNoCarMode({ seed: 'rain:' + i, rain: true });
  assert.ok(m === 'scooter' || m === 'bus', m);
}
// known seed for screenshots: find one that yields bike with no rain
let noneBikeSeed = null;
for (let i = 0; i < 30; i++) {
  if (L.pickNoCarMode({ seed: 'shot:' + i }) === 'bike') { noneBikeSeed = 'shot:' + i; break; }
}
assert.ok(noneBikeSeed);
pass('pickNoCarMode rain bias + none→bike seed ' + noneBikeSeed);

// resolveRiders
assert.deepStrictEqual(L.resolveRiders('solo'), { riders: 'solo', passengers: 0, kidSeat: false });
assert.deepStrictEqual(L.resolveRiders('partner'), { riders: 'partner', passengers: 1, kidSeat: false });
assert.deepStrictEqual(L.resolveRiders('kid_seat'), { riders: 'kid_seat', passengers: 1, kidSeat: true });
assert.deepStrictEqual(L.resolveRiders('parents'), { riders: 'parents', passengers: 2, kidSeat: false });
assert.strictEqual(L.resolveRiders(null, '2').passengers, 2);
assert.strictEqual(L.resolveRiders(null, '3').passengers, 3);
pass('resolveRiders');

// pickRoadEvent forced + wear raises breakdown rate
assert.strictEqual(L.pickRoadEvent({ seed: 'e', forced: 'traffic' }).type, 'traffic');
assert.strictEqual(L.pickRoadEvent({ seed: 'e', event: 'none' }).type, 'none');
let brOld = 0, brNew = 0;
for (let i = 0; i < 2000; i++) {
  if (L.pickRoadEvent({ seed: 'ev:' + i, wear: 'old', mode: 'car' }).type === 'breakdown') brOld++;
  if (L.pickRoadEvent({ seed: 'ev:' + i, wear: 'new', mode: 'car', durability: 100 }).type === 'breakdown') brNew++;
}
assert.ok(brOld > brNew * 2, 'breakdown old=' + brOld + ' new=' + brNew);
assert.ok(brNew > 20 && brNew < 150, 'new breakdown count ' + brNew);
assert.strictEqual(L.pickRoadEvent({ seed: 'b', wear: 'old', mode: 'bike', forced: null }).type !== 'x', true);
// bike should not break down
let bikeBreak = 0;
for (let i = 0; i < 500; i++) if (L.pickRoadEvent({ seed: 'bk:' + i, wear: 'old', mode: 'bike' }).type === 'breakdown') bikeBreak++;
assert.strictEqual(bikeBreak, 0);
pass('pickRoadEvent wear vs breakdown old=' + brOld + ' new=' + brNew);

// tripDurationMs
assert.strictEqual(L.tripDurationMs({}), 3000);
assert.strictEqual(L.tripDurationMs({ newCar: true }), 5000);
assert.ok(L.tripDurationMs({ newCar: true, trip: 'weekend' }) >= 5000);
assert.ok(L.tripDurationMs({ eventType: 'breakdown' }) > L.tripDurationMs({}));
pass('tripDurationMs new-car longer');

// readCarState adapter + query overrides
const none = L.readCarState({ vehicle: 'none', seed: noneBikeSeed });
assert.strictEqual(none.hasCar, false);
assert.strictEqual(none.mode, 'bike');
const car2 = L.readCarState({ vehicle: 'car', passengers: '2', lit: 'evening' });
assert.strictEqual(car2.hasCar, true);
assert.strictEqual(car2.mode, 'car');
assert.strictEqual(car2.passengers, 2);
assert.strictEqual(car2.headlights, true);
assert.strictEqual(car2.lighting, 'evening');
const kids = L.readCarState({ vehicle: 'car', riders: 'kid_seat' });
assert.strictEqual(kids.kidSeat, true);
assert.strictEqual(kids.passengers, 1);
const old = L.readCarState({ vehicle: 'car', wear: 'old' });
assert.strictEqual(old.wear, 'old');
assert.ok(old.durability < 50);
const wk = L.readCarState({ trip: 'weekend', dest: 'beach', vehicle: 'car' });
assert.strictEqual(wk.trip, 'weekend');
assert.strictEqual(wk.dest, 'beach');
const fromGame = L.readCarState({}, { vehicle: { owned: { type: 'compact', color: 2, model: 1, durability: 88 } } });
assert.strictEqual(fromGame.hasCar, true);
assert.strictEqual(fromGame.mode, 'car');
assert.strictEqual(fromGame.color, 2);
assert.strictEqual(fromGame.model, 1);
assert.strictEqual(fromGame.durability, 88);
assert.strictEqual(fromGame.stockType, 'compact');
const qOverride = L.readCarState({ vehicle: 'none', seed: noneBikeSeed, durability: '10' }, { vehicle: { owned: { type: 'compact', durability: 90 } } });
assert.strictEqual(qOverride.hasCar, false);
assert.strictEqual(qOverride.durability, 10);
const rainyScooter = L.readCarState({ vehicle: 'scooter', rain: '1', lit: 'daylight' });
assert.strictEqual(rainyScooter.mode, 'scooter');
assert.strictEqual(rainyScooter.rain, true);
const bus = L.readCarState({ vehicle: 'bus' });
assert.strictEqual(bus.mode, 'bus');
assert.strictEqual(bus.passengers, 0);
const ev = L.readCarState({ vehicle: 'car', event: 'breakdown' });
assert.strictEqual(ev.event.type, 'breakdown');
assert.ok(ev.durationMs > 3000);
const skip = L.readCarState({ seed: silent[0] });
assert.strictEqual(skip.play, false);
const forcedPlay = L.readCarState({ seed: silent[0], force: '1' });
assert.strictEqual(forcedPlay.play, true);
pass('readCarState adapter and URL overrides');

console.log('ALL PASS');
console.log(JSON.stringify({ noneBikeSeed, silentSeed: silent[0], hitsPer1000: hits, breakdownOld: brOld, breakdownNew: brNew }));
