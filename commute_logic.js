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
  const RIDERS = ['solo', 'partner', 'kid_seat', 'parents'];
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
      : (g && (g.carAge != null ? g.carAge : (g.age != null ? g.age : null)));
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
    // bike: no passengers. scooter: at most 1 (partner). bus: waiting, no in-vehicle riders.
    let passengers = riders.passengers;
    let kidSeat = riders.kidSeat;
    if (mode === 'bike' || mode === 'bus') { passengers = 0; kidSeat = false; }
    if (mode === 'scooter') { passengers = Math.min(passengers, 1); kidSeat = false; }

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
      riders: (mode === 'bike' || mode === 'bus') ? 'solo' : (mode === 'scooter' && riders.riders === 'kid_seat' ? (passengers ? 'partner' : 'solo') : riders.riders),
      passengers,
      kidSeat,
      lighting: lit,
      headlights: lit === 'evening' && (mode === 'car' || mode === 'scooter'),
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

  return {
    COLORS, COLOR_ZH, WEEKEND_DESTS, RIDERS, ROAD_EVENTS, TYPE_TO_MODE,
    hashSeed, rand01, shouldPlayCommute, shouldPlayTrip, pickNoCarMode, pickRoadEvent,
    wearIsOld, resolveCarAge, annualBreakdownRate, tripBreakdownProbability,
    simulateBreakdowns, resolveRiders, tripDurationMs, readCarState,
    TRIPS_PER_YEAR, MAINT_FACTOR, WEAR_OLD_AGE, WEAR_NEW_AGE,
  };
});
