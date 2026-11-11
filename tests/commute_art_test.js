#!/usr/bin/env node
// Layer order, per-model speed, and arrival-card lookup. No DOM.
const assert = require('assert');
const path = require('path');
const L = require('../commute_logic.js');
const cfg = require('../assets/vehicles/config.json');
const cards = require('../assets/vehicles/arrival_cards.json');

function pass(name) { console.log('PASS', name); }

// fps source of truth
assert.strictEqual(cfg.fps, 8);
assert.strictEqual(cfg.packs.a.scale, 1);
assert.strictEqual(cfg.packs.a.frames, 8);
assert.strictEqual(cfg.packs.old.scale, 2);
assert.strictEqual(cfg.packs.old.frames, 6);
pass('config fps=8 is the single source of truth; A scale 1 / old scale 2');

const PX = {
  bicycle: [7.0685834705770345, 7.0685834705770345, 5.497787143782138],
  scooter: [5.497787143782138, 7.0685834705770345, 5.497787143782138],
  smallcar: [5.497787143782138, 5.497787143782138, 7.0685834705770345],
};
const modeOf = { bicycle: 'bike', scooter: 'scooter', smallcar: 'car' };
for (const kind of Object.keys(PX)) {
  for (let m = 0; m < 3; m++) {
    const got = L.pxPerFrameFor(cfg, modeOf[kind], m);
    assert.ok(Math.abs(got - PX[kind][m]) < 1e-12, kind + ' m' + m + ' ' + got);
  }
}
// 1s at 8 fps moves 8 × px_per_frame scene pixels (wheel rotation matches travel).
assert.ok(Math.abs(L.travelPixels(1000, PX.bicycle[0], 8) - 8 * PX.bicycle[0]) < 1e-12);
assert.ok(Math.abs(L.travelPixels(125, PX.smallcar[0], 8) - PX.smallcar[0]) < 1e-12);
assert.strictEqual(L.travelPixels(0, PX.bicycle[0], 8), 0);
pass('px_per_frame table from REPORT.md + travelPixels = fps × px × seconds');

assert.deepStrictEqual(L.SMALLCAR_LAYER_ORDER, ['body', 'child_seat', 'passengers', 'driver']);

const bakedBike = L.resolveArtPlan({
  pack: 'a', mode: 'bike', model: 0, driver: 'mom', lighting: 'daylight',
  passengers: 0, cfg, available: new Set(['day_dad', 'day_mom', 'night_dad', 'night_mom']),
});
assert.strictEqual(bakedBike.compose, 'baked_rider');
assert.strictEqual(bakedBike.variant, 'day_mom');
assert.strictEqual(bakedBike.scale, 1);
assert.strictEqual(bakedBike.frames, 8);
assert.strictEqual(bakedBike.layers[0].role, 'combined');
assert.ok(!bakedBike.pending.length);

const eveBike = L.resolveArtPlan({
  pack: 'a', mode: 'bike', model: 0, driver: 'dad', lighting: 'evening', headlights: false,
  passengers: 0, cfg, available: new Set(['day_dad', 'night_dad']),
});
assert.strictEqual(eveBike.duskTint, true);
assert.strictEqual(eveBike.variant, 'day_dad');
assert.strictEqual(eveBike.layers[0].tint, 'evening');

const nightScoot = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 1, driver: 'dad', lighting: 'evening', headlights: true,
  passengers: 0, cfg, available: new Set(['day_dad', 'night_dad']),
});
assert.strictEqual(nightScoot.duskTint, false);
assert.strictEqual(nightScoot.variant, 'night_dad');

const scootP1 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'partner', cfg,
  available: new Set(['day_dad', 'day_dad_p1']),
});
assert.strictEqual(scootP1.variant, 'day_dad_p1');

const famMissing = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'family', cfg,
  available: new Set(['day_dad', 'day_dad_p1']),
});
assert.strictEqual(famMissing.variant, 'day_dad');
assert.strictEqual(famMissing.fallbackFrom, 'family');
assert.ok(famMissing.pending.includes('scooter_family'));
assert.ok(famMissing.labels.includes('機車全家款待王子'));

const famHit = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'mom', lighting: 'daylight',
  passengers: 1, riders: 'family', cfg,
  available: new Set(['day_mom', 'day_mom_family']),
});
assert.strictEqual(famHit.variant, 'day_mom_family');
assert.ok(!famHit.pending.includes('scooter_family'));

const carInterim = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 2, riders: 'parents', cfg,
  available: new Set(['day_dad', 'day_dad_p1', 'day_dad_p2', 'day_dad_p3']),
});
assert.strictEqual(carInterim.compose, 'baked_rider');
assert.strictEqual(carInterim.variant, 'day_dad_p2');
assert.ok(carInterim.pending.includes('smallcar_body_strip'));
assert.ok(carInterim.labels.includes('小型車車身條帶待王子'));

const carLayered = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'mom', lighting: 'daylight',
  passengers: 3, riders: 'parents', kidSeat: false, cfg, layeredAvailable: true,
  available: new Set(['layer:body:day', 'layer:driver_mom:day', 'layer:passengers_p3:day']),
});
assert.strictEqual(carLayered.compose, 'layered');
assert.deepStrictEqual(carLayered.layers.map((x) => x.role), ['body', 'passengers', 'driver']);
assert.strictEqual(carLayered.layers[1].headsOnly, true);
assert.strictEqual(carLayered.layers[2].driver, 'mom');
assert.ok(!carLayered.pending.includes('smallcar_body_strip'));

const carKidLayered = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 1, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'kid_seat', kidSeat: true, cfg, layeredAvailable: true,
});
assert.deepStrictEqual(carKidLayered.layers.map((x) => x.role), ['body', 'child_seat', 'passengers', 'driver']);

const oldPlan = L.resolveArtPlan({ pack: 'old', mode: 'car', model: 0, cfg });
assert.strictEqual(oldPlan.compose, 'old_strip');
assert.strictEqual(oldPlan.scale, 2);
pass('layer composition: baked bike/scooter final, family fallback, smallcar interim vs layered order');

// Card lookup coverage: every keys-combo resolves or falls back deterministically.
const trips = cards.keys.trip;
const dests = cards.keys.dest;
const modes = cards.keys.mode;
const events = cards.keys.event;
const riders = cards.keys.riders;
const sources = new Set();
let n = 0, arrive = 0, road = 0, placeholder = 0, breakdown = 0;
const seen = new Map();
for (const trip of trips) {
  const destList = trip === 'weekend' ? dests : [null];
  for (const dest of destList) {
    for (const mode of modes) {
      for (const ev of events) {
        for (const r of riders) {
          const state = { trip, dest, mode, riders: r, event: { type: ev }, seed: 'cover:' + n };
          const a = L.lookupArrivalCard(cards, state);
          const b = L.lookupArrivalCard(cards, state);
          assert.ok(a && a.source && typeof a.text === 'string', 'missing result for ' + JSON.stringify(state));
          assert.strictEqual(a.source, b.source);
          assert.strictEqual(a.id, b.id);
          assert.strictEqual(a.text, b.text);
          sources.add(a.source);
          n++;
          if (ev === 'breakdown') {
            assert.strictEqual(a.source, 'breakdown_fallback');
            assert.strictEqual(a.text, '文案待公主');
            breakdown++;
          } else if (a.source === 'arrive') arrive++;
          else if (a.source === 'road_line') road++;
          else if (a.source === 'placeholder') placeholder++;
          else assert.fail('unexpected source ' + a.source);
          const key = [trip, dest, mode, ev, r].join('|');
          seen.set(key, a.source + ':' + (a.id || a.text));
        }
      }
    }
  }
}

const beachSolo = L.lookupArrivalCard(cards, {
  trip: 'weekend', dest: 'beach', mode: 'car', riders: 'solo', event: { type: 'none' }, seed: 'x',
});
assert.strictEqual(beachSolo.source, 'arrive');
assert.ok(beachSolo.id && beachSolo.id.indexOf('WEEKEND-BEACH') === 0);
assert.ok(beachSolo.text.length > 0);

const beachBike = L.lookupArrivalCard(cards, {
  trip: 'weekend', dest: 'beach', mode: 'bike', riders: 'solo', event: { type: 'none' }, seed: 'x',
});
assert.strictEqual(beachBike.source, 'placeholder');

const workCar = L.lookupArrivalCard(cards, {
  trip: 'work', mode: 'car', riders: 'solo', event: { type: 'none' }, seed: 'x',
});
assert.strictEqual(workCar.source, 'arrive');
assert.ok(workCar.id && workCar.id.indexOf('ARRIVE-WORK') === 0);

const homeKid = L.lookupArrivalCard(cards, {
  trip: 'home', mode: 'car', riders: 'kid_seat', event: { type: 'none' }, seed: 'x',
});
assert.strictEqual(homeKid.source, 'arrive');
assert.ok(homeKid.id.indexOf('ARRIVE-HOME-CAR-KID') === 0);

const workParents = L.lookupArrivalCard(cards, {
  trip: 'work', mode: 'car', riders: 'parents', event: { type: 'none' }, seed: 'x',
});
assert.strictEqual(workParents.source, 'placeholder');
assert.ok(workParents.text.indexOf('到公司') >= 0);

const workTraffic = L.lookupArrivalCard(cards, {
  trip: 'work', mode: 'car', riders: 'solo', event: { type: 'traffic' }, seed: 'x',
});
// arrive line exists for work/car/solo, so that wins; event text may be attached
assert.strictEqual(workTraffic.source, 'arrive');

const br = L.lookupArrivalCard(cards, {
  trip: 'work', mode: 'car', riders: 'solo', event: { type: 'breakdown' }, seed: 'x',
});
assert.strictEqual(br.source, 'breakdown_fallback');
assert.strictEqual(br.text, '文案待公主');

const wkTraffic = L.lookupArrivalCard(cards, {
  trip: 'weekend', dest: 'beach', mode: 'car', riders: 'partner', event: { type: 'traffic' }, seed: 'x',
});
assert.strictEqual(wkTraffic.source, 'arrive');
assert.ok(wkTraffic.eventText);

pass('card lookup: ' + n + ' combos deterministic, arrive=' + arrive + ' road_line=' + road + ' placeholder=' + placeholder + ' breakdown=' + breakdown);

console.log('ALL PASS');
console.log(JSON.stringify({
  combos: n,
  arrive, road_line: road, placeholder, breakdown,
  sources: [...sources],
  fps: cfg.fps,
  px_per_frame: PX,
}, null, 2));
