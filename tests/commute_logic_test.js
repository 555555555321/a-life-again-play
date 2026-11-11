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

// annual rates and aliases
assert.strictEqual(L.TRIPS_PER_YEAR, 550);
assert.strictEqual(L.MAINT_FACTOR, 0.7);
assert.strictEqual(L.annualBreakdownRate(0, false), 0.25);
assert.strictEqual(L.annualBreakdownRate(3, false), 0.25);
assert.strictEqual(L.annualBreakdownRate(4, false), 0.5);
assert.strictEqual(L.annualBreakdownRate(9, false), 0.5);
assert.strictEqual(L.annualBreakdownRate(10, false), 1.5);
assert.strictEqual(L.annualBreakdownRate(12, false), 1.5);
assert.strictEqual(L.annualBreakdownRate(12, true), 1.5 * 0.7);
assert.strictEqual(L.annualBreakdownRate(0, true), 0.25 * 0.7);
assert.strictEqual(L.annualBreakdownRate(6, true), 0.5 * 0.7);
assert.strictEqual(L.resolveCarAge({ wear: 'old' }), 12);
assert.strictEqual(L.resolveCarAge({ wear: 'new' }), 0);
assert.strictEqual(L.resolveCarAge({ carAge: '6', wear: 'old' }), 6);
assert.ok(Math.abs(L.tripBreakdownProbability({ carAge: 12, mode: 'car' }) - 1.5 / 550) < 1e-12);
assert.ok(Math.abs(L.tripBreakdownProbability({ carAge: 0, mode: 'car' }) - 0.25 / 550) < 1e-12);
assert.ok(Math.abs(L.tripBreakdownProbability({ carAge: 6, maint: true, mode: 'car' }) - 0.5 * 0.7 / 550) < 1e-12);
assert.strictEqual(L.tripBreakdownProbability({ carAge: 12, mode: 'bike' }), 0);
assert.strictEqual(L.tripBreakdownProbability({ carAge: 12, mode: 'bus' }), 0);
pass('annualBreakdownRate bands, maint factor, wear aliases');

// pickRoadEvent forced + age-based breakdown; bike never breaks
assert.strictEqual(L.pickRoadEvent({ seed: 'e', forced: 'traffic' }).type, 'traffic');
assert.strictEqual(L.pickRoadEvent({ seed: 'e', event: 'none' }).type, 'none');
assert.strictEqual(L.pickRoadEvent({ seed: 'e', forced: 'breakdown' }).type, 'breakdown');
assert.strictEqual(L.pickRoadEvent({ seed: 'b', wear: 'old', mode: 'bike', forced: null }).type !== 'x', true);
let bikeBreak = 0;
for (let i = 0; i < 500; i++) if (L.pickRoadEvent({ seed: 'bk:' + i, wear: 'old', mode: 'bike' }).type === 'breakdown') bikeBreak++;
assert.strictEqual(bikeBreak, 0);
// same seed is deterministic
assert.strictEqual(
  L.pickRoadEvent({ seed: 'det', carAge: 12, mode: 'car' }).type,
  L.pickRoadEvent({ seed: 'det', carAge: 12, mode: 'car' }).type
);
pass('pickRoadEvent forced + bike never breaks');

// breakdown trip always plays, even on a silent (1-in-5 miss) seed
assert.strictEqual(L.shouldPlayTrip({ seed: silent[0], event: { type: 'none' } }), false);
assert.strictEqual(L.shouldPlayTrip({ seed: silent[0], event: { type: 'breakdown' } }), true);
assert.strictEqual(L.shouldPlayTrip({ seed: silent[0], eventType: 'breakdown' }), true);
pass('shouldPlayTrip forces play on breakdown');

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
assert.strictEqual(old.carAge, 12);
assert.strictEqual(old.maint, false);
assert.ok(Math.abs(old.breakdownP - 1.5 / 550) < 1e-12);
const fresh = L.readCarState({ vehicle: 'car', wear: 'new' });
assert.strictEqual(fresh.carAge, 0);
assert.ok(Math.abs(fresh.breakdownP - 0.25 / 550) < 1e-12);
const aged = L.readCarState({ vehicle: 'car', carage: '12' });
assert.strictEqual(aged.carAge, 12);
assert.strictEqual(aged.wear, 'old');
const agedMaint = L.readCarState({ vehicle: 'car', carage: '12', maint: '1' });
assert.strictEqual(agedMaint.maint, true);
assert.ok(Math.abs(agedMaint.breakdownP - 1.5 * 0.7 / 550) < 1e-12);
const mid = L.readCarState({ vehicle: 'car', carage: '6', wear: 'new' });
assert.strictEqual(mid.carAge, 6);
assert.strictEqual(mid.wear, 'new');
assert.ok(Math.abs(mid.breakdownP - 0.5 / 550) < 1e-12);
const fromGameAge = L.readCarState({ vehicle: 'car' }, { vehicle: { owned: { type: 'compact', carAge: 8, maintenance: true } } });
assert.strictEqual(fromGameAge.carAge, 8);
assert.strictEqual(fromGameAge.maint, true);
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
assert.strictEqual(ev.play, true);
assert.ok(ev.durationMs > 3000);
const skip = L.readCarState({ seed: silent[0] });
assert.strictEqual(skip.play, false);
const forcedPlay = L.readCarState({ seed: silent[0], force: '1' });
assert.strictEqual(forcedPlay.play, true);
// a silent seed with a forced breakdown still plays
const forcedBreak = L.readCarState({ seed: silent[0], vehicle: 'car', event: 'breakdown' });
assert.strictEqual(forcedBreak.play, true);
assert.strictEqual(forcedBreak.event.type, 'breakdown');
pass('readCarState adapter, URL aliases, play-on-breakdown');

// carAge must never take g.age (that is often the person). Use car.boughtAge.
const notPersonAge = L.readCarState({ vehicle: 'car' }, { vehicle: { owned: { type: 'compact', age: 40 } } });
assert.strictEqual(notPersonAge.carAge, 0, 'g.age must not be used as carAge, got ' + notPersonAge.carAge);
const notCarObjAge = L.readCarState({ vehicle: 'car' }, { car: { type: 'compact', age: 40 } });
assert.strictEqual(notCarObjAge.carAge, 0);
const fromBought = L.readCarState({ vehicle: 'car' }, { age: 30, car: { type: 'compact', boughtAge: 26 } });
assert.strictEqual(fromBought.carAge, 4);
const fromPlayerBought = L.readCarState({ vehicle: 'car' }, { player: { age: 18 }, vehicle: { owned: { type: 'compact', boughtAge: 16 } } });
assert.strictEqual(fromPlayerBought.carAge, 2);
const boughtNoPlayer = L.readCarState({ vehicle: 'car' }, { car: { type: 'compact', boughtAge: 16 } });
assert.strictEqual(boughtNoPlayer.carAge, 0);
const boughtClamped = L.readCarState({ vehicle: 'car' }, { age: 10, car: { type: 'compact', boughtAge: 16 } });
assert.strictEqual(boughtClamped.carAge, 0);
const qBeatsBought = L.readCarState({ vehicle: 'car', carage: '7' }, { age: 30, car: { type: 'compact', boughtAge: 26 } });
assert.strictEqual(qBeatsBought.carAge, 7);
const explicitCarAge = L.readCarState({ vehicle: 'car' }, { age: 40, vehicle: { owned: { type: 'compact', carAge: 8, age: 40 } } });
assert.strictEqual(explicitCarAge.carAge, 8);
pass('carAge from boughtAge, never g.age');

// 王: scooter uses the same breakdown rate as the car
assert.strictEqual(
  L.tripBreakdownProbability({ mode: 'scooter', carAge: 12 }),
  L.tripBreakdownProbability({ mode: 'car', carAge: 12 })
);
assert.strictEqual(
  L.tripBreakdownProbability({ mode: 'scooter', carAge: 1, maint: true }),
  L.tripBreakdownProbability({ mode: 'car', carAge: 1, maint: true })
);
pass('scooter breakdown rate matches car');


assert.deepStrictEqual(L.resolveRiders('family'), { riders: 'family', passengers: 1, kidSeat: false });
const famScoot = L.readCarState({ vehicle: 'scooter', riders: 'family', driver: 'mom' });
assert.strictEqual(famScoot.riders, 'family');
assert.strictEqual(famScoot.passengers, 1);
assert.strictEqual(famScoot.driver, 'mom');
const famCar = L.readCarState({ vehicle: 'car', riders: 'family' });
assert.strictEqual(famCar.riders, 'kid_seat');
assert.strictEqual(famCar.kidSeat, true);
const drv = L.readCarState({ vehicle: 'car' });
assert.strictEqual(drv.driver, 'dad');
pass('riders=family and driver');

const carThree = L.readCarState({ vehicle: 'car', riders: 'partner', kidseat: '1' });
assert.strictEqual(carThree.riders, 'partner');
assert.strictEqual(carThree.kidSeat, true);
assert.strictEqual(carThree.passengers, 2);
const carThreeKid = L.readCarState({ vehicle: 'car', riders: 'partner', kid: '1' });
assert.strictEqual(carThreeKid.kidSeat, true);
assert.strictEqual(carThreeKid.passengers, 2);
const carKidOnly = L.readCarState({ vehicle: 'car', riders: 'kid_seat' });
assert.strictEqual(carKidOnly.riders, 'kid_seat');
assert.strictEqual(carKidOnly.kidSeat, true);
assert.strictEqual(carKidOnly.passengers, 1);
const carPartnerOnly = L.readCarState({ vehicle: 'car', riders: 'partner' });
assert.strictEqual(carPartnerOnly.kidSeat, false);
assert.strictEqual(carPartnerOnly.passengers, 1);
pass('car riders=partner&kidseat=1 is driver+spouse+child seat');


// 10-year sim: 2000 seeds × 5500 trips per age band ± maint
const bands = [
  { label: '0–3', carAge: 1 },
  { label: '4–9', carAge: 6 },
  { label: '10+', carAge: 12 },
];
const simRows = [];
const t0 = Date.now();
for (const band of bands) {
  for (const maint of [false, true]) {
    const row = L.simulateBreakdowns({
      carAge: band.carAge, maint, years: 10, seeds: 2000,
      seedPrefix: 'band-' + band.label + (maint ? '-m' : ''),
    });
    row.label = band.label;
    const rel = Math.abs(row.meanBreakdownsPerYear - row.targetAnnual) / row.targetAnnual;
    assert.ok(rel < 0.10, band.label + ' maint=' + maint + ' mean=' + row.meanBreakdownsPerYear + ' target=' + row.targetAnnual);
    // Every breakdown plays, so animations/year equals breakdowns/year
    assert.ok(Math.abs(row.meanBreakdownAnimsPerYear - row.meanBreakdownsPerYear) < 1e-12);
    simRows.push(row);
  }
}
pass('10-year sim 2000 seeds × 6 bands in ' + (Date.now() - t0) + 'ms');

console.log('ALL PASS');
console.log(JSON.stringify({
  noneBikeSeed,
  silentSeed: silent[0],
  hitsPer1000: hits,
  tripsPerYear: L.TRIPS_PER_YEAR,
  sim: simRows.map(r => ({
    band: r.label,
    carAge: r.carAge,
    maint: r.maint,
    targetAnnual: r.targetAnnual,
    meanBreakdownsPerYear: Number(r.meanBreakdownsPerYear.toFixed(4)),
    meanBreakdownAnimsPerYear: Number(r.meanBreakdownAnimsPerYear.toFixed(4)),
    shareOfPlaysThatAreBreakdowns: Number((r.shareOfPlaysThatAreBreakdowns * 100).toFixed(3)),
    playRate: Number(r.playRate.toFixed(4)),
  })),
}, null, 2));
