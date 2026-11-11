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

const overlayManifests = {
  0: require('../assets/vehicles/a/smallcar_m0/overlays/manifest.json'),
  1: require('../assets/vehicles/a/smallcar_m1/overlays/manifest.json'),
  2: require('../assets/vehicles/a/smallcar_m2/overlays/manifest.json'),
};
cfg.overlayManifests = overlayManifests;
const v2 = require('../assets/vehicles/a/bicycle_m2_v2/anchors_day_dad.json');
const famAnchors = require('../assets/vehicles/a/scooter_m0_family_v2/anchors_day_dad.json');
const scoot0v2 = require('../assets/vehicles/a/scooter_m0_v2/anchors_day_dad.json');
const scoot2v2 = require('../assets/vehicles/a/scooter_m2_v2/anchors_day_dad.json');
function bakedFrom(anchors) {
  return {
    source: 'anchors_day_dad',
    canvas: anchors.canvas,
    ground_row: anchors.ground_row,
    px_per_frame: anchors.wheels[0].px_per_frame,
    origin: [0, 0],
  };
}
cfg.bakedMetrics = {
  bicycle_m2_v2: bakedFrom(v2),
  scooter_m0_family_v2: bakedFrom(famAnchors),
  scooter_m0_family: bakedFrom(famAnchors),
  scooter_m0_v2: bakedFrom(scoot0v2),
  scooter_m2_v2: bakedFrom(scoot2v2),
};

// px/frame and canvas for small cars come from overlays/manifest.json, not the old composite.
for (const m of [0, 1, 2]) {
  const man = overlayManifests[m];
  const got = L.pxPerFrameFor(cfg, 'car', m);
  assert.ok(Math.abs(got - man.px_per_frame) < 1e-12, 'car m' + m + ' px ' + got);
  const met = L.metricsFor(cfg, 'car', m);
  assert.strictEqual(met.source, 'overlay_manifest');
  assert.deepStrictEqual(met.canvas, man.canvas);
  assert.strictEqual(met.ground_row, man.ground_row);
  assert.ok(met.canvas[1] === man.canvas[1], 'must use 1px-taller overlay canvas, not old composite');
}
assert.deepStrictEqual(overlayManifests[0].canvas, [98, 46]);
assert.deepStrictEqual(overlayManifests[1].canvas, [94, 50]);
assert.deepStrictEqual(overlayManifests[2].canvas, [90, 48]);
assert.notStrictEqual(overlayManifests[0].canvas[1], 45, 'never the old 45-tall composite');
assert.strictEqual(L.BODY_BOB_KEY, 'body_bob_px');
for (const m of [0, 1, 2]) {
  const man = overlayManifests[m];
  const entry = cfg.vehicles.smallcar.models[String(m)];
  assert.strictEqual(entry.ground_row, man.ground_row, 'config ground_row must match new-body manifest m' + m);
  assert.deepStrictEqual(entry.canvas, man.canvas);
  assert.strictEqual(entry.origin.y, man.ground_row);
  assert.ok(Array.isArray(man.body_bob_px) && man.body_bob_px.length === 8);
  assert.strictEqual(entry.legacy_composite.ground_row, man.ground_row - 1, 'legacy stays 1 px shorter');
  const met = L.metricsFor(cfg, 'car', m);
  assert.deepStrictEqual(met.body_bob_px, man.body_bob_px);
  assert.strictEqual(met.body_bob_missing, false);
}

const PX = {
  bicycle: [7.0685834705770345, 7.0685834705770345, 5.497787143782138],
  scooter: [5.497787143782138, 7.0685834705770345, 5.497787143782138],
  smallcar: [overlayManifests[0].px_per_frame, overlayManifests[1].px_per_frame, overlayManifests[2].px_per_frame],
};
const modeOf = { bicycle: 'bike', scooter: 'scooter', smallcar: 'car' };
for (const kind of Object.keys(PX)) {
  for (let m = 0; m < 3; m++) {
    const got = L.pxPerFrameFor(cfg, modeOf[kind], m);
    assert.ok(Math.abs(got - PX[kind][m]) < 1e-12, kind + ' m' + m + ' ' + got);
  }
}
assert.ok(Math.abs(L.travelPixels(1000, PX.bicycle[0], 8) - 8 * PX.bicycle[0]) < 1e-12);
assert.ok(Math.abs(L.travelPixels(125, PX.smallcar[0], 8) - PX.smallcar[0]) < 1e-12);
assert.strictEqual(L.travelPixels(0, PX.bicycle[0], 8), 0);
pass('px_per_frame and canvas from overlay manifests / REPORT.md');

const bakedBike = L.resolveArtPlan({
  pack: 'a', mode: 'bike', model: 0, driver: 'mom', lighting: 'daylight',
  passengers: 0, cfg, available: new Set(['day_dad', 'day_mom', 'night_dad', 'night_mom']),
});
assert.strictEqual(bakedBike.compose, 'baked_rider');
assert.strictEqual(bakedBike.variant, 'day_mom');
assert.strictEqual(bakedBike.scale, 1);

const bikeV2 = L.resolveArtPlan({
  pack: 'a', mode: 'bike', model: 2, driver: 'dad', lighting: 'daylight',
  passengers: 0, cfg, available: new Set(['day_dad', 'day_mom', 'night_dad', 'night_mom']),
});
assert.strictEqual(bikeV2.assetDir, 'assets/vehicles/a/bicycle_m2_v2');
assert.deepStrictEqual(bikeV2.canvas, [42, 52]);
assert.strictEqual(bikeV2.ground_row, 51);
assert.ok(Math.abs(bikeV2.px_per_frame - v2.wheels[0].px_per_frame) < 1e-12);

const eveBike = L.resolveArtPlan({
  pack: 'a', mode: 'bike', model: 0, driver: 'dad', lighting: 'evening', headlights: false,
  passengers: 0, cfg, available: new Set(['day_dad', 'night_dad']),
});
assert.strictEqual(eveBike.duskTint, true);
assert.strictEqual(eveBike.variant, 'day_dad');

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
assert.strictEqual(scootP1.assetDir, 'assets/vehicles/a/scooter_m0_v2');

const famHit = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'mom', lighting: 'daylight',
  passengers: 1, riders: 'family', cfg, familyAvailable: true,
});
assert.strictEqual(famHit.variant, 'day_mom');
assert.strictEqual(famHit.assetDir, 'assets/vehicles/a/scooter_m0_family_v2');
assert.strictEqual(famHit.family, true);
assert.ok(!famHit.pending.includes('scooter_family'));
assert.deepStrictEqual(famHit.canvas, [52, 50]);

const famM1 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 1, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'family', cfg, familyAvailable: true,
  available: new Set(['day_dad']),
});
assert.strictEqual(famM1.fallbackFrom, 'family');
assert.ok(famM1.pending.includes('scooter_family'));
assert.ok(famM1.assetDir.indexOf('scooter_m1') >= 0);

const carPartner = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'partner', cfg, overlayManifests,
});
assert.strictEqual(carPartner.compose, 'layered');
assert.strictEqual(carPartner.metricsSource, 'overlay_manifest');
assert.deepStrictEqual(carPartner.canvas, [98, 46]);
assert.strictEqual(carPartner.ground_row, 45);
assert.deepStrictEqual(carPartner.layers.map((x) => x.folder), ['body_day', 'passenger_spouse_mom', 'driver_dad']);
assert.ok(carPartner.layers[1].headsOnly);
assert.ok(!carPartner.pending.length);
assert.ok(!carPartner.variant, 'must not use old baked composites');

const carParentsEve = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 2, driver: 'mom', lighting: 'evening', headlights: true,
  passengers: 2, riders: 'parents', cfg, overlayManifests,
});
assert.deepStrictEqual(carParentsEve.layers.map((x) => x.folder), ['body_night', 'passengers_parents', 'driver_mom']);
assert.strictEqual(carParentsEve.layers[0].tint, null);
assert.strictEqual(carParentsEve.layers[1].tint, 'evening');
assert.deepStrictEqual(carParentsEve.canvas, [90, 48]);

const carKid = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 1, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'kid_seat', kidSeat: true, cfg, overlayManifests,
});
assert.deepStrictEqual(carKid.layers.map((x) => x.folder), ['body_day', 'child_seat', 'driver_dad']);
assert.deepStrictEqual(carKid.canvas, [94, 50]);

const noMan = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  cfg: { fps: 8, vehicles: cfg.vehicles, overlayManifests: {} },
  available: new Set(['day_dad', 'day_dad_p2']),
});
assert.strictEqual(noMan.compose, 'missing');
assert.ok(noMan.pending.includes('smallcar_overlay_manifest'));

const oldPlan = L.resolveArtPlan({ pack: 'old', mode: 'car', model: 0, cfg });
assert.strictEqual(oldPlan.compose, 'old_strip');
assert.strictEqual(oldPlan.scale, 2);
const scootNightP1 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'dad', lighting: 'evening', headlights: true,
  passengers: 1, riders: 'partner', cfg,
  available: new Set(['day_dad', 'day_dad_p1', 'night_dad', 'night_mom']),
});
assert.strictEqual(scootNightP1.variant, 'night_dad');
assert.ok(scootNightP1.pending.includes('baked_passenger_variant'));
assert.strictEqual(scootNightP1.assetDir, 'assets/vehicles/a/scooter_m0_v2');
const scootNightP1v2 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'dad', lighting: 'evening', headlights: true,
  passengers: 1, riders: 'partner', cfg,
  available: new Set(['day_dad', 'day_dad_p1', 'night_dad', 'night_dad_p1', 'night_mom', 'night_mom_p1']),
});
assert.strictEqual(scootNightP1v2.variant, 'night_dad_p1');
assert.ok(!scootNightP1v2.pending.includes('baked_passenger_variant'));
assert.strictEqual(scootNightP1v2.assetDir, 'assets/vehicles/a/scooter_m0_v2');
const scootM2 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 2, driver: 'mom', lighting: 'daylight',
  passengers: 1, riders: 'partner', cfg,
  available: new Set(['day_mom', 'day_mom_p1']),
});
assert.strictEqual(scootM2.assetDir, 'assets/vehicles/a/scooter_m2_v2');
assert.strictEqual(scootM2.variant, 'day_mom_p1');
const scootDuskP1 = L.resolveArtPlan({
  pack: 'a', mode: 'scooter', model: 0, driver: 'dad', lighting: 'evening', headlights: false,
  passengers: 1, riders: 'partner', cfg,
  available: new Set(['day_dad', 'day_dad_p1', 'night_dad']),
});
assert.strictEqual(scootDuskP1.variant, 'day_dad_p1');
assert.strictEqual(scootDuskP1.duskTint, true);
pass('layer composition: overlay manifests, v2 folding bike, scooter family, never mix old composites');


// body_bob_px comes from the overlay manifest, never a hardcoded array, and
// is applied only to driver / passenger / child-seat layers (not the body).
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'driver', 0), 0);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'driver', 2), 1);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'spouse', 6), 1);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'child_seat', 2), 1);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'passengers_parents', 2), 1);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'body', 2), 0);
assert.strictEqual(L.layerDrawOffsetY(overlayManifests[0], 'combined', 2), 0);

const mutatedMan = JSON.parse(JSON.stringify(overlayManifests));
mutatedMan[0] = Object.assign({}, mutatedMan[0], { body_bob_px: [0, 0, 4, 0, 0, 0, 5, 0] });
const mutatedCfg = Object.assign({}, cfg, { overlayManifests: mutatedMan });
const planMut = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'partner', kidSeat: true, cfg: mutatedCfg, overlayManifests: mutatedMan,
});
assert.deepStrictEqual(planMut.body_bob_px, [0, 0, 4, 0, 0, 0, 5, 0]);
assert.strictEqual(planMut.body_bob_missing, false);
assert.ok(!planMut.labels.includes('body_bob_px 缺失'));
assert.strictEqual(L.layerDrawOffsetY(planMut, 'driver', 2), 4);
assert.strictEqual(L.layerDrawOffsetY(planMut, 'spouse', 6), 5);
assert.strictEqual(L.layerDrawOffsetY(planMut, 'child_seat', 2), 4);
assert.strictEqual(L.layerDrawOffsetY(planMut, 'body', 2), 0);
assert.strictEqual(L.layerDrawOffsetY(planMut, 'driver', 0), 0);
// A hardcoded [0,0,1,0,0,0,1,0] in JS would fail the 4 / 5 assertions above.
assert.notDeepStrictEqual(planMut.body_bob_px, overlayManifests[0].body_bob_px);

const noBobMan = JSON.parse(JSON.stringify(overlayManifests));
delete noBobMan[0].body_bob_px;
const noBobCfg = Object.assign({}, cfg, { overlayManifests: noBobMan });
const planMissing = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'partner', cfg: noBobCfg, overlayManifests: noBobMan,
});
assert.strictEqual(planMissing.body_bob_missing, true);
assert.deepStrictEqual(planMissing.body_bob_px, [0, 0, 0, 0, 0, 0, 0, 0]);
assert.ok(planMissing.labels.includes('body_bob_px 缺失'));
assert.strictEqual(L.layerDrawOffsetY(planMissing, 'driver', 2), 0);
assert.strictEqual(L.readBodyBobPx({}).missing, true);
assert.deepStrictEqual(L.readBodyBobPx({ frames: 8 }).px, [0, 0, 0, 0, 0, 0, 0, 0]);
const planReal = L.resolveArtPlan({
  pack: 'a', mode: 'car', model: 0, driver: 'dad', lighting: 'daylight',
  passengers: 1, riders: 'partner', cfg, overlayManifests,
});
assert.deepStrictEqual(planReal.body_bob_px, overlayManifests[0].body_bob_px);
assert.strictEqual(planReal.body_bob_missing, false);
pass('body_bob_px is read from the manifest; mutating the fixture changes overlay y; body layer stays 0');

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
