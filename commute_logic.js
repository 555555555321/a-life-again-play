// Pure commute helpers for 再活一次 Phone B.
// Works in the browser and in Node (no DOM). Seeded functions are deterministic.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CommuteLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const COLORS = ['red', 'blue', 'white', 'black', 'yellow', 'green'];
  const COLOR_ZH = ['紅', '藍', '白', '黑', '黃', '綠'];
  const WEEKEND_DESTS = ['beach', 'mountain', 'night_market', 'friend'];
  const RIDERS = ['solo', 'partner', 'kid_seat', 'parents', 'family'];
  const ROAD_EVENTS = ['none', 'traffic', 'rain', 'lost', 'breakdown'];
  const TYPE_TO_MODE = {
    bicycle: 'bike', scooter: 'scooter',
    compact: 'car', smallcar: 'car', hatchback: 'car', sedan: 'car',
    truck: 'car', van: 'car', suv: 'car', ev: 'car', sports: 'car', luxury: 'car',
    bike: 'bike', car: 'car', bus: 'bus',
  };
  const AUTO_TYPES = new Set(['compact', 'smallcar', 'hatchback', 'sedan', 'truck', 'van', 'suv', 'ev', 'sports', 'luxury', 'car']);

  function hashSeed(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function rand01(seed, salt) {
    return hashSeed(String(seed) + ':' + salt) / 4294967296;
  }

  // Always play on first workday, new car, or new job; otherwise about 1 in 5.
  // force (dev &force=1) always plays. Cutting straight to the next scene is the caller's job when this returns false.
  function shouldPlayCommute(opts) {
    const o = opts || {};
    if (o.force) return true;
    if (o.isFirstWorkday || o.isNewCar || o.isNewJob) return true;
    const seed = o.seed == null ? '0' : String(o.seed);
    return (hashSeed(seed + ':play') % 5) === 0;
  }

  // No automobile: bicycle, scooter, or wait for the bus.
  // If it is raining, only scooter-in-rain or bus (王).
  function pickNoCarMode(opts) {
    const o = opts || {};
    const seed = o.seed == null ? '0' : String(o.seed);
    if (o.rain) return (hashSeed(seed + ':nocar-rain') % 2) === 0 ? 'scooter' : 'bus';
    return ['bike', 'scooter', 'bus'][hashSeed(seed + ':nocar') % 3];
  }

  function wearIsOld(wear, durability) {
    if (wear === 'old') return true;
    if (wear === 'new') return false;
    return durability != null && Number(durability) < 50;
  }

  // 王 2026-11-11: 550 trips/year (500 commute + 50 weekend).
  // Annual breakdown by car age: 0–3 → 0.25, 4–9 → 0.5, 10+ → 1.5. Insurance/maintenance × 0.7.
  // wear=old aliases to carAge 12; wear=new aliases to 0.
  const TRIPS_PER_YEAR = 550;
  const MAINT_FACTOR = 0.7;
  const WEAR_OLD_AGE = 12;
  const WEAR_NEW_AGE = 0;

  function resolveCarAge(opts) {
    const o = opts || {};
    if (o.carAge != null && o.carAge !== '') {
      const n = Number(o.carAge);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    if (o.wear === 'old') return WEAR_OLD_AGE;
    if (o.wear === 'new') return WEAR_NEW_AGE;
    if (o.durability != null && Number(o.durability) < 50) return WEAR_OLD_AGE;
    return WEAR_NEW_AGE;
  }

  function annualBreakdownRate(carAge, maint) {
    const age = Number(carAge);
    const a = Number.isFinite(age) && age >= 0 ? age : 0;
    let annual = 0.25;
    if (a >= 10) annual = 1.5;
    else if (a >= 4) annual = 0.5;
    if (maint) annual *= MAINT_FACTOR;
    return annual;
  }

  function tripBreakdownProbability(opts) {
    const o = opts || {};
    const mode = o.mode || (o.hasCar ? 'car' : 'bike');
    // 王 2026-11-11: scooter uses the same age-banded rate as the car for now.
    if (mode !== 'car' && mode !== 'scooter') return 0;
    const age = o.carAge != null ? o.carAge : resolveCarAge(o);
    return annualBreakdownRate(age, o.maint) / TRIPS_PER_YEAR;
  }

  // Breakdown is rolled on every trip, independent of the 1-in-5 play rule.
  // A breakdown trip always plays (the breakdown version).
  function shouldPlayTrip(opts) {
    const o = opts || {};
    const type = (o.event && o.event.type) || o.eventType;
    if (type === 'breakdown') return true;
    return shouldPlayCommute(o);
  }

  // Seeded road event. One event per trip. Breakdown uses its own roll and car-age rate.
  // forced (dev &event=) wins. Rain as weather can still stack a non-rain event.
  function pickRoadEvent(opts) {
    const o = opts || {};
    const forced = o.forced || o.event || null;
    if (forced && ROAD_EVENTS.includes(forced) && forced !== 'none') {
      return { type: forced, forced: true };
    }
    if (forced === 'none') return { type: 'none', forced: true };
    const seed = o.seed == null ? '0' : String(o.seed);
    const mode = o.mode || (o.hasCar ? 'car' : 'bike');
    const carAge = o.carAge != null ? o.carAge : resolveCarAge(o);
    const maint = !!o.maint;
    const pBreak = tripBreakdownProbability({ mode, carAge, maint });
    if (pBreak > 0 && rand01(seed, 'breakdown') < pBreak) {
      return { type: 'breakdown', forced: false, carAge, maint };
    }
    const r = rand01(seed, 'event');
    const pTraffic = 0.12;
    const pLost = 0.08;
    const pRain = o.rain ? 0 : 0.10; // mid-trip rain only if weather was not already rain
    if (r < pTraffic) return { type: 'traffic', forced: false };
    if (r < pTraffic + pLost) return { type: 'lost', forced: false };
    if (r < pTraffic + pLost + pRain) return { type: 'rain', forced: false };
    return { type: 'none', forced: false };
  }

  // Hold car age fixed (one band) and run years * TRIPS_PER_YEAR trips for each seed.
  function simulateBreakdowns(opts) {
    const o = opts || {};
    const years = o.years == null ? 10 : o.years;
    const seeds = o.seeds == null ? 2000 : o.seeds;
    const tripsPerYear = o.tripsPerYear == null ? TRIPS_PER_YEAR : o.tripsPerYear;
    const carAge = o.carAge;
    const maint = !!o.maint;
    const mode = o.mode || 'car';
    const prefix = o.seedPrefix == null ? 'sim' : String(o.seedPrefix);
    let breakdowns = 0, plays = 0, breakdownPlays = 0;
    const tripsEach = years * tripsPerYear;
    for (let s = 0; s < seeds; s++) {
      for (let t = 0; t < tripsEach; t++) {
        const seed = prefix + ':' + s + ':' + t;
        const event = pickRoadEvent({ seed, carAge, maint, mode });
        const play = shouldPlayTrip({ seed, event });
        if (event.type === 'breakdown') breakdowns++;
        if (play) plays++;
        if (play && event.type === 'breakdown') breakdownPlays++;
      }
    }
    const totalYears = seeds * years;
    const totalTrips = totalYears * tripsPerYear;
    return {
      carAge, maint, mode, years, seeds, tripsPerYear,
      targetAnnual: annualBreakdownRate(carAge, maint),
      meanBreakdownsPerYear: breakdowns / totalYears,
      meanBreakdownAnimsPerYear: breakdownPlays / totalYears,
      shareOfPlaysThatAreBreakdowns: plays ? breakdownPlays / plays : 0,
      playRate: totalTrips ? plays / totalTrips : 0,
      breakdowns, plays, breakdownPlays, totalYears, totalTrips,
    };
  }

  function resolveRiders(riders, passengersQ) {
    if (riders && RIDERS.includes(riders)) {
      if (riders === 'solo') return { riders: 'solo', passengers: 0, kidSeat: false };
      if (riders === 'partner') return { riders: 'partner', passengers: 1, kidSeat: false };
      if (riders === 'kid_seat') return { riders: 'kid_seat', passengers: 1, kidSeat: true };
      if (riders === 'family') return { riders: 'family', passengers: 1, kidSeat: false };
      return { riders: 'parents', passengers: 2, kidSeat: false };
    }
    if (passengersQ != null && passengersQ !== '') {
      const n = Math.max(0, Math.min(3, Number(passengersQ) | 0));
      const map = { 0: 'solo', 1: 'partner', 2: 'parents', 3: 'parents' };
      return { riders: map[n], passengers: n, kidSeat: false };
    }
    return { riders: 'solo', passengers: 0, kidSeat: false };
  }

  function tripDurationMs(opts) {
    const o = opts || {};
    let ms = 3000;
    if (o.trip === 'weekend') ms = 3500;
    if (o.newCar) ms = Math.max(ms, 5000);
    const ev = (o.event && o.event.type) || o.eventType || 'none';
    if (ev === 'traffic') ms += 800;
    if (ev === 'lost') ms += 1000;
    if (ev === 'breakdown') ms += 1200;
    if (ev === 'rain' && !o.rain) ms += 400;
    return ms;
  }

  function param(src, key, fallback) {
    if (!src) return fallback;
    if (typeof src.get === 'function') {
      const v = src.get(key);
      return v == null || v === '' ? fallback : v;
    }
    if (Object.prototype.hasOwnProperty.call(src, key) && src[key] != null && src[key] !== '') return String(src[key]);
    return fallback;
  }
  function hasParam(src, key) {
    if (!src) return false;
    if (typeof src.has === 'function') return src.has(key) && src.get(key) !== '';
    return Object.prototype.hasOwnProperty.call(src, key) && src[key] != null && src[key] !== '';
  }


  // Player age is never taken from the vehicle object (g.age is often the person).
  // Car age = player age − car.boughtAge when that key is present; else null (wear alias / 0).
  function playerAgeFromGameState(gameState) {
    if (!gameState || typeof gameState !== 'object') return null;
    const slots = [gameState.player, gameState.person, gameState.you];
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i];
      if (p && p.age != null && p.age !== '') {
        const n = Number(p.age);
        if (Number.isFinite(n)) return n;
      }
    }
    if (gameState.age != null && gameState.age !== '') {
      const n = Number(gameState.age);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  function boughtAgeFromGameState(gameState, g) {
    const tryN = (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const fromG = tryN(g && g.boughtAge);
    if (fromG != null) return fromG;
    const fromCar = tryN(gameState && gameState.car && gameState.car.boughtAge);
    if (fromCar != null) return fromCar;
    const owned = gameState && gameState.vehicle && gameState.vehicle.owned;
    return tryN(owned && owned.boughtAge);
  }
  function carAgeFromGameState(gameState, g) {
    // Explicit vehicle.carAge only — never g.age.
    if (g && g.carAge != null && g.carAge !== '') {
      const n = Number(g.carAge);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    const bought = boughtAgeFromGameState(gameState, g);
    if (bought == null) return null;
    const playerAge = playerAgeFromGameState(gameState);
    if (playerAge == null || !Number.isFinite(playerAge)) return 0;
    const age = playerAge - bought;
    return Number.isFinite(age) && age >= 0 ? age : 0;
  }

  // Small adapter: read has-car / tier / colour / durability from game state,
  // with dev query overrides. Real car code is being ported separately.
  function readCarState(qs, gameState) {
    const g = (gameState && (gameState.vehicle && gameState.vehicle.owned)) || (gameState && gameState.car) || null;
    const force = param(qs, 'force') === '1';
    const seed = param(qs, 'seed', (gameState && gameState.seed) || 'dev');
    const rainQ = param(qs, 'rain') === '1';
    const wearQ = param(qs, 'wear'); // new|old
    let durability = hasParam(qs, 'durability') ? Number(param(qs, 'durability')) : (g && g.durability != null ? Number(g.durability) : 100);
    if (!Number.isFinite(durability)) durability = 100;
    durability = Math.max(0, Math.min(100, durability));
    let wear = wearQ === 'old' || wearQ === 'new' ? wearQ : (durability < 50 ? 'old' : 'new');
    if (wear === 'old' && !hasParam(qs, 'durability') && !(g && g.durability != null)) durability = 35;

    const carAgeRaw = hasParam(qs, 'carage')
      ? param(qs, 'carage')
      : carAgeFromGameState(gameState, g);
    const carAge = resolveCarAge({
      carAge: carAgeRaw,
      wear: (carAgeRaw == null || carAgeRaw === '') ? wear : null,
    });
    const maint = param(qs, 'maint') === '1' || !!(g && (g.maint || g.maintenance || g.insured));
    // carage=12 with no wear=/durability still previews as a worn car.
    if (!wearQ && carAge >= 10 && !hasParam(qs, 'durability') && !(g && g.durability != null)) {
      wear = 'old';
      if (durability >= 50) durability = 35;
    }

    let color = hasParam(qs, 'color') ? Number(param(qs, 'color')) : (g && g.color != null ? Number(g.color) : 0);
    if (!Number.isInteger(color) || color < 0 || color > 5) color = 0;
    let model = hasParam(qs, 'model') ? Number(param(qs, 'model')) : (g && g.model != null ? Number(g.model) : 0);
    if (!Number.isInteger(model) || model < 0 || model > 2) model = 0;

    const vehicleQ = param(qs, 'vehicle'); // none|bike|scooter|car|bus or a stock type
    const hasCarFromGame = !!(g && AUTO_TYPES.has(g.type || g.kind));
    let mode, hasCar, stockType;
    if (vehicleQ === 'none') {
      hasCar = false;
      mode = pickNoCarMode({ seed, rain: rainQ });
      stockType = null;
    } else if (vehicleQ) {
      mode = TYPE_TO_MODE[vehicleQ] || (vehicleQ === 'none' ? null : vehicleQ);
      if (!['bike', 'scooter', 'car', 'bus'].includes(mode)) mode = 'car';
      hasCar = mode === 'car';
      stockType = vehicleQ === 'car' ? 'compact' : (AUTO_TYPES.has(vehicleQ) || vehicleQ === 'bicycle' || vehicleQ === 'scooter' ? vehicleQ : (mode === 'bike' ? 'bicycle' : mode));
    } else if (g && (g.type || g.kind)) {
      const t = g.type || g.kind;
      mode = TYPE_TO_MODE[t] || 'car';
      hasCar = AUTO_TYPES.has(t);
      stockType = t;
    } else {
      hasCar = false;
      mode = pickNoCarMode({ seed, rain: rainQ });
      stockType = null;
    }

    const riders = resolveRiders(param(qs, 'riders'), hasParam(qs, 'passengers') ? param(qs, 'passengers') : null);
    // bike: no passengers. scooter: at most 1 (partner or family). bus: waiting, no in-vehicle riders.
    // riders=family is a scooter-only baked variant (child in front, adult behind).
    let passengers = riders.passengers;
    let kidSeat = riders.kidSeat;
    let ridersKind = riders.riders;
    if (mode !== 'scooter' && ridersKind === 'family') {
      if (mode === 'car') { ridersKind = 'kid_seat'; passengers = 1; kidSeat = true; }
      else { ridersKind = 'solo'; passengers = 0; kidSeat = false; }
    }
    if (mode === 'bike' || mode === 'bus') { passengers = 0; kidSeat = false; ridersKind = 'solo'; }
    if (mode === 'scooter') { passengers = Math.min(passengers, 1); kidSeat = false; }

    let driver = param(qs, 'driver', 'dad');
    if (driver !== 'mom') driver = 'dad';
    let art = param(qs, 'art', '');
    if (art !== 'a' && art !== 'old') art = '';

    const lit = param(qs, 'lit') === 'evening' || param(qs, 'lit') === 'night' ? 'evening' : 'daylight';
    let trip = param(qs, 'trip', 'work');
    if (!['work', 'home', 'weekend'].includes(trip)) trip = 'work';
    let dest = param(qs, 'dest');
    if (dest === 'friend_home') dest = 'friend';
    if (trip !== 'weekend') dest = dest || null;
    else if (!WEEKEND_DESTS.includes(dest)) dest = dest || 'beach';

    const newCar = param(qs, 'newcar') === '1' || !!(gameState && gameState.isNewCar);
    const isFirstWorkday = param(qs, 'firstworkday') === '1' || !!(gameState && gameState.isFirstWorkday);
    const isNewJob = param(qs, 'newjob') === '1' || !!(gameState && gameState.isNewJob);
    const eventForced = param(qs, 'event');
    const rain = rainQ || eventForced === 'rain';
    const event = pickRoadEvent({
      seed, wear, durability, rain: rainQ, mode, hasCar, carAge, maint,
      forced: eventForced && ROAD_EVENTS.includes(eventForced) ? eventForced : null,
    });
    const play = shouldPlayTrip({ force, isFirstWorkday, isNewCar: newCar, isNewJob, seed, event });
    const durationMs = tripDurationMs({ trip, newCar, event, rain: rainQ });

    return {
      hasCar,
      stockType,
      mode,
      model,
      color,
      colourName: COLORS[color],
      colourZh: COLOR_ZH[color],
      durability,
      wear,
      carAge,
      maint,
      breakdownAnnual: tripBreakdownProbability({ mode, hasCar, carAge, maint }) * TRIPS_PER_YEAR,
      breakdownP: tripBreakdownProbability({ mode, hasCar, carAge, maint }),
      tier: param(qs, 'tier', (g && g.tier) || 'middle'),
      riders: (mode === 'bike' || mode === 'bus') ? 'solo' : (mode === 'scooter' && ridersKind === 'kid_seat' ? (passengers ? 'partner' : 'solo') : ridersKind),
      passengers,
      kidSeat,
      driver,
      art,
      lighting: lit,
      headlights: hasParam(qs, 'headlights')
        ? param(qs, 'headlights') !== '0'
        : lit === 'evening' && (mode === 'car' || mode === 'scooter'),
      trip,
      dest: trip === 'weekend' ? dest : null,
      dir: trip === 'home' ? 'home' : 'out',
      rain,
      newCar,
      force,
      seed,
      isFirstWorkday,
      isNewJob,
      event,
      play,
      durationMs,
    };
  }


  const MODE_TO_KIND = { bike: 'bicycle', scooter: 'scooter', car: 'smallcar', bus: 'bus' };
  const SMALLCAR_LAYER_ORDER = ['body', 'child_seat', 'passengers', 'driver'];
  const BREAKDOWN_FALLBACK_CARD = { source: 'breakdown_fallback', title: '卡片（占位）', text: '文案待公主', id: null };
  const PLACEHOLDER = {
    work: '到公司的句子待公主補',
    home: '到家的句子待公主補',
    weekend: '週末到達句待公主補',
  };

  function vehicleKind(mode) {
    return MODE_TO_KIND[mode] || mode;
  }

  function metricsFor(cfg, mode, model, extra) {
    const kind = vehicleKind(mode);
    const m = String(model == null ? 0 : model);
    const over = (extra && extra.overlayManifests) || (cfg && cfg.overlayManifests) || {};
    if (kind === 'smallcar' && over[m] && over[m].px_per_frame != null) {
      const man = over[m];
      return {
        source: 'overlay_manifest',
        canvas: man.canvas,
        origin: man.origin,
        ground_row: man.ground_row,
        px_per_frame: Number(man.px_per_frame),
        frames: man.frames || 8,
      };
    }
    const baked = cfg && cfg.bakedMetrics;
    const bakedKey = (kind === 'bicycle' && m === '2') ? 'bicycle_m2_v2'
      : (kind === 'scooter' && extra && extra.familyDir) ? 'scooter_m0_family'
      : (kind + '_m' + m);
    const bm = baked && (baked[bakedKey] || baked[kind + '_m' + m]);
    if (bm && bm.px_per_frame != null) {
      return {
        source: bm.source || 'baked_anchors',
        canvas: bm.canvas,
        origin: bm.origin || [0, 0],
        ground_row: bm.ground_row,
        px_per_frame: Number(bm.px_per_frame),
        frames: 8,
      };
    }
    const models = cfg && cfg.vehicles && cfg.vehicles[kind] && cfg.vehicles[kind].models;
    const entry = models && models[m];
    if (entry && Number.isFinite(Number(entry.px_per_frame))) {
      return {
        source: 'config',
        canvas: entry.canvas,
        origin: entry.origin && (entry.origin.x != null ? [entry.origin.x, entry.origin.y] : entry.origin),
        ground_row: entry.ground_row,
        px_per_frame: Number(entry.px_per_frame),
        frames: entry.frames || 8,
      };
    }
    return { source: 'none', canvas: null, origin: [0, 0], ground_row: null, px_per_frame: 0, frames: 8 };
  }
  function pxPerFrameFor(cfg, mode, model, extra) {
    return metricsFor(cfg, mode, model, extra).px_per_frame;
  }

  // x movement in 480-space scene pixels. One animation frame ↔ px_per_frame of travel.
  function travelPixels(elapsedMs, pxPerFrame, fps) {
    const t = Number(elapsedMs);
    const px = Number(pxPerFrame);
    const f = Number(fps);
    if (!Number.isFinite(t) || !Number.isFinite(px) || !Number.isFinite(f) || f <= 0) return 0;
    return Math.max(0, t) / 1000 * f * px;
  }

  function bakedVariantChain(opts) {
    const o = opts || {};
    const time = o.headlights ? 'night' : 'day';
    const driver = o.driver === 'mom' ? 'mom' : 'dad';
    const names = [];
    if (o.riders === 'family') {
      names.push(time + '_' + driver + '_family');
      names.push(time + '_' + driver);
      return names;
    }
    const p = Math.max(0, Number(o.passengers) || 0);
    if (p >= 1) {
      const cap = o.mode === 'scooter' ? 1 : 3;
      for (let n = Math.min(p, cap); n >= 1; n--) names.push(time + '_' + driver + '_p' + n);
    }
    names.push(time + '_' + driver);
    return names;
  }

  function firstAvailable(names, available) {
    if (!available) return names[0] || null;
    for (let i = 0; i < names.length; i++) {
      if (available.has(names[i]) || (typeof available.contains === 'function' && available.contains(names[i]))) return names[i];
      if (Array.isArray(available) && available.indexOf(names[i]) >= 0) return names[i];
    }
    return null;
  }

  function hasAvail(available, name) {
    if (!available || !name) return false;
    if (typeof available.has === 'function') return available.has(name);
    if (Array.isArray(available)) return available.indexOf(name) >= 0;
    return !!available[name];
  }

  // pack=a plans (DEV screens only until gate 2). Bicycle/scooter: baked rider is final.
  // Small car: body strip + stackable overlays from overlays/manifest.json. Never mix with old composites (1 px taller).
  function resolveArtPlan(opts) {
    const o = opts || {};
    const pack = o.pack || 'a';
    const mode = o.mode;
    const model = String(o.model == null ? 0 : o.model);
    const kind = vehicleKind(mode);
    const fps = (o.cfg && o.cfg.fps) || 8;
    const duskTint = o.lighting === 'evening' && !o.headlights;
    const evePeople = o.lighting === 'evening';
    const pending = [];
    const labels = [];
    const met = metricsFor(o.cfg, mode, o.model, o);
    const px = met.px_per_frame;
    if (pack === 'old' || mode === 'bus') {
      return {
        pack: pack === 'old' ? 'old' : pack,
        compose: 'old_strip',
        kind, model: Number(model),
        layers: [], pending, labels,
        px_per_frame: pack === 'a' ? px : null,
        frames: pack === 'old' || mode === 'bus' ? 6 : 8,
        scale: pack === 'old' || mode === 'bus' ? 2 : 1,
        fps, duskTint: false, variant: null,
      };
    }
    const time = o.headlights ? 'night' : 'day';
    const driver = o.driver === 'mom' ? 'mom' : 'dad';
    const available = o.available;
    const over = ((o.overlayManifests || (o.cfg && o.cfg.overlayManifests) || {})[model]);

    if (kind === 'smallcar') {
      if (over) {
        const peopleTint = evePeople ? 'evening' : null;
        const layers = [];
        layers.push({
          role: 'body',
          folder: time === 'night' ? 'body_night' : 'body_day',
          tint: (time === 'day' && evePeople) ? 'evening' : null,
        });
        if (o.kidSeat) {
          layers.push({ role: 'child_seat', folder: 'child_seat', tint: peopleTint, headsOnly: true });
        }
        if (o.riders === 'parents') {
          layers.push({ role: 'passengers_parents', folder: 'passengers_parents', tint: peopleTint, headsOnly: true });
        } else if ((o.passengers >= 1) && o.riders !== 'kid_seat') {
          const spouse = driver === 'mom' ? 'passenger_spouse_dad' : 'passenger_spouse_mom';
          layers.push({ role: 'spouse', folder: spouse, tint: peopleTint, headsOnly: true });
        }
        layers.push({ role: 'driver', folder: 'driver_' + driver, tint: peopleTint, driver: driver });
        return {
          pack: 'a', compose: 'layered', kind, model: Number(model),
          layers, pending, labels,
          assetDir: 'assets/vehicles/a/smallcar_m' + model + '/overlays',
          canvas: over.canvas, origin: over.origin, ground_row: over.ground_row,
          px_per_frame: Number(over.px_per_frame), frames: over.frames || 8, scale: 1, fps,
          duskTint, variant: null, metricsSource: 'overlay_manifest',
        };
      }
      // Do not fall back to the old 1 px-shorter composites.
      pending.push('smallcar_overlay_manifest');
      labels.push('小型車分層 manifest 缺失');
      return {
        pack: 'a', compose: 'missing', kind, model: Number(model),
        layers: [], pending, labels, px_per_frame: px, frames: 8, scale: 1, fps,
        duskTint, variant: null,
      };
    }

    let assetDir = 'assets/vehicles/a/' + kind + '_m' + model;
    let canvas = met.canvas, origin = met.origin, ground_row = met.ground_row;
    let pxUse = px;
    const wantedFamily = o.riders === 'family' && kind === 'scooter';
    if (kind === 'bicycle' && model === '2') {
      assetDir = 'assets/vehicles/a/bicycle_m2_v2';
      const bm = o.cfg && o.cfg.bakedMetrics && o.cfg.bakedMetrics.bicycle_m2_v2;
      if (bm) { canvas = bm.canvas; ground_row = bm.ground_row; pxUse = Number(bm.px_per_frame); origin = bm.origin || [0, 0]; }
    }
    if (wantedFamily) {
      const famReady = model === '0' && o.familyAvailable !== false;
      if (famReady) {
        const chosenFam = time + '_' + driver;
        const bm = o.cfg && o.cfg.bakedMetrics && o.cfg.bakedMetrics.scooter_m0_family;
        if (bm) { canvas = bm.canvas; ground_row = bm.ground_row; pxUse = Number(bm.px_per_frame); origin = bm.origin || [0, 0]; }
        return {
          pack: 'a', compose: 'baked_rider', kind, model: Number(model),
          layers: [{
            role: 'combined', variant: chosenFam, baked: true,
            tint: duskTint ? 'evening' : null,
            pathPattern: 'assets/vehicles/a/scooter_m0_family/frames/' + chosenFam + '/f{frame}.png',
          }],
          pending, labels,
          assetDir: 'assets/vehicles/a/scooter_m0_family',
          canvas, origin, ground_row,
          px_per_frame: pxUse, frames: 8, scale: 1, fps,
          duskTint, variant: chosenFam, fallbackFrom: null, family: true,
        };
      }
      pending.push('scooter_family');
      labels.push('機車全家款待王子');
    }

    const chain = wantedFamily ? [time + '_' + driver] : bakedVariantChain(o);
    let chosen = firstAvailable(chain, available);
    if (!chosen) chosen = chain[chain.length - 1];
    const wanted = chain[0];
    if (wanted && chosen && wanted !== chosen) {
      pending.push('baked_passenger_variant');
      labels.push('夜間載客合成格待王子');
    }
    return {
      pack: 'a',
      compose: 'baked_rider',
      kind, model: Number(model),
      layers: [{
        role: 'combined',
        variant: chosen,
        baked: true,
        tint: duskTint ? 'evening' : null,
        pathPattern: assetDir + '/frames/' + chosen + '/f{frame}.png',
      }],
      pending, labels,
      assetDir,
      canvas, origin, ground_row,
      px_per_frame: pxUse, frames: 8, scale: 1, fps,
      duskTint, variant: chosen,
      fallbackFrom: wantedFamily ? 'family' : null,
    };
  }

  function fieldMatches(entryVal, want) {
    if (want == null || want === '') return true;
    if (entryVal == null || entryVal === '') return true;
    if (typeof entryVal === 'string' && entryVal.indexOf('|') >= 0) {
      return entryVal.split('|').indexOf(String(want)) >= 0;
    }
    return entryVal === want;
  }

  function cardMatches(entry, filters) {
    if (!entry) return false;
    const keys = Object.keys(filters || {});
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!fieldMatches(entry[k], filters[k])) return false;
    }
    return true;
  }

  function pickCard(list, filters, seed, salt) {
    if (!list || !list.length) return null;
    const hits = list.filter((e) => cardMatches(e, filters));
    if (!hits.length) return null;
    const i = hashSeed(String(seed == null ? 'dev' : seed) + ':' + (salt || 'card')) % hits.length;
    return hits[i];
  }

  function cardResult(source, entry, extra) {
    const out = {
      source,
      id: entry && entry.id || null,
      text: entry && entry.text || '',
      title: extra && extra.title || null,
      leads_to: entry && entry.leads_to || null,
      eventText: extra && extra.eventText || null,
      eventId: extra && extra.eventId || null,
    };
    if (extra) {
      if (extra.placeholder) out.placeholder = extra.placeholder;
      if (extra.fallback) out.fallback = extra.fallback;
    }
    return out;
  }

  function lookupArrivalCard(cards, state) {
    const st = state || {};
    const ev = (st.event && st.event.type) || st.eventType || 'none';
    const trip = st.trip || 'work';
    const mode = st.mode || 'car';
    const riders = st.riders || 'solo';
    const dest = st.dest || null;
    const seed = st.seed;
    if (ev === 'breakdown') return Object.assign({}, BREAKDOWN_FALLBACK_CARD);

    const baseFilters = { mode, riders };
    let eventEntry = null;
    if (ev !== 'none' && ev !== 'breakdown' && cards && cards.events && cards.events[ev]) {
      eventEntry = pickCard(cards.events[ev], { mode, riders, trip }, seed, 'event:' + ev)
        || pickCard(cards.events[ev], { mode, riders }, seed, 'event:' + ev)
        || pickCard(cards.events[ev], { riders }, seed, 'event:' + ev)
        || pickCard(cards.events[ev], { mode }, seed, 'event:' + ev);
    }

    if (trip === 'weekend') {
      const destList = cards && cards.weekend && dest ? cards.weekend[dest] : null;
      const arrive = pickCard(destList, { dest, riders, mode, trip: 'weekend' }, seed, 'arrive:' + dest)
        || null;
      // Do not silently use a car-only dest line for bike/scooter/bus.
      if (!arrive) {
        const text = PLACEHOLDER.weekend + '（' + (dest || '?') + '／' + mode + (riders !== 'solo' ? '／' + riders : '') + '）';
        return cardResult('placeholder', { text }, {
          placeholder: true,
          eventText: eventEntry && eventEntry.text,
          eventId: eventEntry && eventEntry.id,
        });
      }
      return cardResult('arrive', arrive, {
        eventText: eventEntry && eventEntry.text,
        eventId: eventEntry && eventEntry.id,
      });
    }

    const arriveList = trip === 'home'
      ? (cards && cards.home_arrive)
      : (cards && cards.work_arrive);
    const arrive = pickCard(arriveList, { mode, riders }, seed, 'arrive:' + trip);
    if (arrive) {
      return cardResult('arrive', arrive, {
        eventText: eventEntry && eventEntry.text,
        eventId: eventEntry && eventEntry.id,
      });
    }

    // No arrive-at-office/home line for this combo: use a matching road line if any.
    const roadList = cards && cards[trip];
    if (ev !== 'none' && ev !== 'breakdown') {
      const road = pickCard(roadList, { mode, riders, event: ev }, seed, 'road:' + trip)
        || pickCard(roadList, { mode, event: ev }, seed, 'road:' + trip)
        || eventEntry;
      if (road) return cardResult('road_line', road, { fallback: 'road_line' });
    }
    const text = (PLACEHOLDER[trip] || PLACEHOLDER.work);
    return cardResult('placeholder', { text }, { placeholder: true });
  }

  return {
    COLORS, COLOR_ZH, WEEKEND_DESTS, RIDERS, ROAD_EVENTS, TYPE_TO_MODE,
    hashSeed, rand01, shouldPlayCommute, shouldPlayTrip, pickNoCarMode, pickRoadEvent,
    wearIsOld, resolveCarAge, annualBreakdownRate, tripBreakdownProbability,
    simulateBreakdowns, resolveRiders, tripDurationMs, readCarState,
    TRIPS_PER_YEAR, MAINT_FACTOR, WEAR_OLD_AGE, WEAR_NEW_AGE,
    playerAgeFromGameState, boughtAgeFromGameState, carAgeFromGameState,
    MODE_TO_KIND, SMALLCAR_LAYER_ORDER, BREAKDOWN_FALLBACK_CARD,
    vehicleKind, metricsFor, pxPerFrameFor, travelPixels, bakedVariantChain, resolveArtPlan,
    cardMatches, pickCard, lookupArrivalCard,
  };
});
