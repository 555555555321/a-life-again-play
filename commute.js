// Phone B DEV commute / weekend-drive scene. Old 240-art drawn at 2× nearest-neighbour.
// Paths live in assets/vehicles/config.json so 王子 can swap style A later.
(function (root) {
  const SCALE = 2;
  const FPS = 8;
  const W480 = 480, H270 = 270;
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = src; });
  const tryImg = src => loadImg(src).catch(() => null);

  let cfg = null;
  let commute = null;
  let goingOut = null;

  function qsNow() { return new URLSearchParams(location.search); }

  function artTime(state, role) {
    const eve = state.lighting === 'evening';
    if (role === 'bg') return eve ? 'evening' : 'noon';
    if (role === 'vehicle') return state.headlights ? 'night' : (eve ? 'evening' : 'noon');
    if (role === 'overlay') return state.headlights ? 'night' : (eve ? 'evening' : 'noon');
    return eve ? 'evening' : 'noon';
  }

  function stemFor(state) {
    const def = cfg.default_art[state.mode];
    if (!def || def.placeholder) return null;
    // Only c0/m0 were copied; color/model stay in the adapter for when more art is dropped in.
    return def.file_stem;
  }

  function pathRoad(stem, time) { return `assets/vehicles/road/${stem}_${time}_strip.png`; }
  function pathRoadJson(stem, time) { return `assets/vehicles/road/${stem}_${time}_strip.json`; }
  function pathParked(stem, time, lights) {
    if (lights) return `assets/vehicles/parked/${stem}_${time}_lights.png`;
    return `assets/vehicles/parked/${stem}_${time}.png`;
  }

  async function loadJson(src) {
    const r = await fetch(src);
    if (!r.ok) return null;
    return r.json();
  }

  function destBgName(dest) { return dest === 'friend' ? 'friend_home' : dest; }

  async function ensureCfg() {
    if (cfg) return cfg;
    cfg = await (await fetch('assets/vehicles/config.json')).json();
    return cfg;
  }

  async function gatherImages(state) {
    const timeV = artTime(state, 'vehicle');
    const timeB = artTime(state, 'bg');
    const timeO = artTime(state, 'overlay');
    const stem = stemFor(state);
    const imgs = {};
    const missing = [];
    async function take(key, src, optional) {
      if (!src) return;
      const im = await tryImg(src);
      if (im) imgs[key] = im;
      else if (!optional) missing.push(src);
    }
    await take('street', `assets/vehicles/bg/street_normal_${timeB}.png`);
    await take('home', `assets/vehicles/bg/menwai_normal_${timeB}.png`);
    await take('office', `assets/vehicles/bg/office_park_${timeB}.png`);
    if (state.trip === 'weekend' && state.dest) {
      const n = destBgName(state.dest);
      await take('dest', `assets/vehicles/bg/${n}_${timeB}.png`);
    }
    if (state.mode === 'bus') {
      await take('bus', 'assets/vehicles/placeholders/bus_strip.png');
      imgs.busMeta = await loadJson('assets/vehicles/placeholders/bus_strip.json');
    } else if (stem) {
      await take('strip', pathRoad(stem, timeV));
      imgs.meta = await loadJson(pathRoadJson(stem, timeV));
      await take('parked', pathParked(stem, timeV, false));
      if (state.headlights) await take('parkedLights', pathParked(stem, 'night', true), true);
      if (state.mode === 'car') {
        if (state.passengers >= 1) await take('p1', `assets/vehicles/overlay/smallcar_m0_passengers_p1_${timeO}.png`, true);
        if (state.passengers >= 2) await take('p2', `assets/vehicles/overlay/smallcar_m0_passengers_p2_${timeO}.png`, true);
        if (state.passengers >= 3) await take('p3', `assets/vehicles/overlay/smallcar_m0_passengers_p3_${timeO}.png`, true);
        if (state.wear === 'old') await take('wear', `assets/vehicles/overlay/smallcar_m0_wear_${timeO}.png`, true);
        if (state.wear === 'old') await take('dents', 'assets/vehicles/placeholders/dents.png', true);
      }
      if (state.mode === 'scooter' && state.passengers >= 1) {
        await take('p1', `assets/vehicles/overlay/scooter_m0_passengers_p1_${timeO}.png`, true);
      }
      if (state.mode === 'bike' && state.wear === 'old') {
        await take('wear', `assets/vehicles/overlay/bicycle_m0_wear_${timeO}.png`, true);
      }
    }
    await take('rain', 'assets/vehicles/placeholders/rain.png', true);
    await take('rider', 'assets/vehicles/placeholders/rider.png', true);
    if (state.kidSeat) await take('kidSeat', 'assets/vehicles/placeholders/kid_seat.png', true);
    imgs.missing = missing;
    return imgs;
  }

  function startBg(state) {
    if (state.trip === 'home') return 'office';
    return 'home';
  }
  function endBg(state) {
    if (state.trip === 'weekend') return 'dest';
    if (state.trip === 'home') return 'home';
    return 'office';
  }

  function phaseTimes(state) {
    const T = state.durationMs;
    const ev = state.event && state.event.type;
    const intro = state.newCar ? 900 : 350;
    const outro = 700;
    let road = T - intro - outro;
    let jamAt = null, jamMs = 0, lostAt = null, lostMs = 0, breakAt = null, breakMs = 0;
    if (ev === 'traffic') { jamMs = 800; jamAt = intro + road * 0.35; }
    if (ev === 'lost') { lostMs = 1000; lostAt = intro + road * 0.4; }
    if (ev === 'breakdown') { breakMs = 1200; breakAt = intro + Math.max(400, road * 0.55); }
    return { T, intro, outro, road, jamAt, jamMs, lostAt, lostMs, breakAt, breakMs };
  }

  // Progress along the trip 0..1 after accounting for pauses. Also flags for events.
  function motionAt(state, elapsed) {
    const p = phaseTimes(state);
    const t = Math.max(0, Math.min(p.T, elapsed));
    const ev = { traffic: false, lost: false, breakdown: false, rain: !!state.rain };
    let clock = t;
    // During event windows the clock for travel can freeze or wiggle.
    let travel = t;
    if (p.jamAt != null && t >= p.jamAt) {
      if (t < p.jamAt + p.jamMs) { ev.traffic = true; travel = p.jamAt; }
      else travel = t - p.jamMs;
    }
    if (p.lostAt != null && t >= p.lostAt) {
      if (t < p.lostAt + p.lostMs) { ev.lost = true; }
      else travel = travel - 0; // duration already includes lost time as extra; we spend it wandering
    }
    if (p.breakAt != null && t >= p.breakAt) {
      ev.breakdown = true;
      if (t < p.breakAt + p.breakMs) travel = p.breakAt;
      else travel = p.breakAt; // stay stopped; outro still plays as a tow-in hold at roadside then cut? keep stopped till end almost
    }
    const travelT = Math.max(0, Math.min(p.intro + p.road, travel));
    let phase, u;
    if (t >= p.T) { phase = 'done'; u = 1; }
    else if (travelT <= p.intro) { phase = 'depart'; u = p.intro ? travelT / p.intro : 1; }
    else if (travelT < p.intro + p.road) { phase = 'road'; u = (travelT - p.intro) / p.road; }
    else { phase = 'arrive'; u = (t - (p.intro + p.road)) / p.outro; }
    if (ev.breakdown && phase === 'arrive') { phase = 'road'; }
    const done = t >= p.T || phase === 'done';
    return { t, phase: done ? 'done' : phase, u: done ? 1 : u, ev, p, travelT };
  }

  function blit2x(g, img, x240, y240, fw, fh, sx, sy, flip) {
    if (!img) return;
    const w = (fw || img.width);
    const h = (fh || img.height);
    g.imageSmoothingEnabled = false;
    const dx = Math.round(x240 * SCALE);
    const dy = Math.round(y240 * SCALE);
    const dw = Math.round(w * SCALE);
    const dh = Math.round(h * SCALE);
    if (flip) {
      g.save();
      g.translate(dx + dw, dy);
      g.scale(-1, 1);
      g.drawImage(img, sx || 0, sy || 0, w, h, 0, 0, dw, dh);
      g.restore();
    } else {
      g.drawImage(img, sx || 0, sy || 0, w, h, dx, dy, dw, dh);
    }
  }

  function darkenBlit(g, img, x240, y240, fw, fh, sx, sy, flip, amount) {
    if (!img) return;
    const w = fw || img.width, h = fh || img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cg = c.getContext('2d');
    cg.imageSmoothingEnabled = false;
    cg.drawImage(img, sx || 0, sy || 0, w, h, 0, 0, w, h);
    cg.globalCompositeOperation = 'source-atop';
    const a = amount == null ? 0.32 : amount;
    cg.fillStyle = `rgba(0,0,0,${a})`;
    cg.fillRect(0, 0, w, h);
    blit2x(g, c, x240, y240, w, h, 0, 0, flip);
  }

  function frameIndex(elapsed, n, frozen) {
    if (frozen) return 0;
    return Math.floor((elapsed / 1000) * FPS) % n;
  }

  function bobPx(elapsed, frozen) {
    if (frozen) return 0;
    const f = Math.floor((elapsed / 1000) * FPS);
    return (f % 2) ? -1 : 0;
  }
  function swayPx(elapsed, frozen) {
    if (frozen) return 0;
    const f = Math.floor((elapsed / 1000) * FPS + 1);
    return (f % 2) ? 1 : 0;
  }

  function captionText(state, mot) {
    const bits = [];
    if (state.trip === 'weekend') bits.push('週末出遊・' + destLabel(state.dest));
    else if (state.trip === 'home') bits.push('下班回家');
    else bits.push('出門上班');
    bits.push(modeLabel(state));
    bits.push('舊畫風 2×');
    if (state.lighting === 'evening') bits.push(state.headlights ? '傍晚・頭燈' : '傍晚');
    if (state.wear === 'old') bits.push('舊車（占位：暗漆＋凹痕）');
    if (state.carAge != null) bits.push('車齡 ' + (Number.isInteger(state.carAge) ? state.carAge : Number(state.carAge).toFixed(1)) + ' 年');
    if (state.maint) bits.push('有保養（拋錨×0.7）');
    if (state.newCar) bits.push('新車日（較長）');
    if (state.kidSeat) bits.push('兒童座椅（占位）');
    if (state.riders === 'parents') bits.push('父母同行');
    if (state.riders === 'partner') bits.push('伴侶同行');
    if (state.rain || (mot && mot.ev.rain)) bits.push('雨（無雨刷格）');
    if (mot && mot.ev.traffic) bits.push('塞車');
    if (mot && mot.ev.lost) bits.push('迷路（占位）');
    if (mot && mot.ev.breakdown) bits.push('拋錨（占位）');
    if (state.mode === 'bus') bits.push('等公車（占位）');
    return bits.join('｜');
  }
  function modeLabel(state) {
    return { bike: '腳踏車', scooter: '機車', car: '小型車', bus: '公車' }[state.mode] || state.mode;
  }
  function destLabel(d) {
    return { beach: '海邊', mountain: '山上', night_market: '夜市', friend: '朋友家' }[d] || d;
  }

  function bgImage(imgs, key) {
    return imgs[key] || imgs.street;
  }

  function drawBg(g, imgs, key, scrollX, flipWorld) {
    const im = bgImage(imgs, key);
    if (!im) { g.fillStyle = '#4a6570'; g.fillRect(0, 0, W480, H270); return; }
    g.imageSmoothingEnabled = false;
    const w = im.width * SCALE, h = im.height * SCALE;
    let x = -Math.round((scrollX || 0) * SCALE);
    if (flipWorld) x = -x;
    // tile horizontally
    let start = x % w;
    if (start > 0) start -= w;
    for (let dx = start; dx < W480; dx += w) g.drawImage(im, dx, 0, w, h);
  }

  function vehicleSize(state, imgs, usingStrip) {
    if (state.mode === 'bus') {
      const m = imgs.busMeta || { frame_w: 56, frame_h: 20 };
      return { w: m.frame_w, h: m.frame_h, n: m.frames || 6 };
    }
    const m = imgs.meta;
    if (usingStrip && m) return { w: m.frame_w, h: m.frame_h, n: m.frames || 6 };
    const im = imgs.parkedLights || imgs.parked || imgs.strip;
    if (im && !usingStrip && imgs.parked) return { w: imgs.parked.width, h: imgs.parked.height, n: 1 };
    if (m) return { w: m.frame_w, h: m.frame_h, n: 1 };
    return { w: 48, h: 21, n: 1 };
  }

  function drawVehicle(g, state, imgs, x240, yBottom, elapsed, opts) {
    const frozen = opts.frozen, flip = opts.flip, parked = opts.parked;
    const bob = bobPx(elapsed, frozen || parked);
    const sway = swayPx(elapsed, frozen || parked);
    const size = vehicleSize(state, imgs, !parked && state.mode !== 'bus' ? true : (state.mode === 'bus' && !parked));
    const y = yBottom - size.h + bob;
    const dark = state.wear === 'old';
    const drawBody = (img, sx) => {
      if (!img) return;
      if (dark) darkenBlit(g, img, x240, y, size.w, size.h, sx, 0, flip, 0.30);
      else blit2x(g, img, x240, y, size.w, size.h, sx, 0, flip);
    };
    if (state.mode === 'bus') {
      const fi = frameIndex(elapsed, size.n, frozen || parked);
      if (imgs.bus) drawBody(imgs.bus, fi * size.w);
      return { x: x240, y, w: size.w, h: size.h };
    }
    if (parked) {
      const parkImg = (state.headlights && imgs.parkedLights) || imgs.parked || imgs.strip;
      drawBody(parkImg, parkImg === imgs.strip ? 0 : 0);
    } else if (imgs.strip) {
      const fi = frameIndex(elapsed, size.n, frozen);
      drawBody(imgs.strip, fi * size.w);
    } else if (imgs.parked) {
      drawBody(imgs.parked, 0);
    }
    // overlays (same footprint as parked/car)
    const ovX = x240 + (parked ? 0 : sway);
    const ovY = y;
    const passKey = state.passengers >= 3 && imgs.p3 ? 'p3' : (state.passengers >= 2 && imgs.p2 ? 'p2' : (state.passengers >= 1 && imgs.p1 ? 'p1' : null));
    if (passKey && imgs[passKey]) {
      if (dark) darkenBlit(g, imgs[passKey], ovX, ovY, imgs[passKey].width, imgs[passKey].height, 0, 0, flip, 0.22);
      else blit2x(g, imgs[passKey], ovX, ovY, imgs[passKey].width, imgs[passKey].height, 0, 0, flip);
    }
    if (state.kidSeat && imgs.kidSeat) blit2x(g, imgs.kidSeat, ovX, ovY, imgs.kidSeat.width, imgs.kidSeat.height, 0, 0, flip);
    if (state.wear === 'old' && imgs.wear) blit2x(g, imgs.wear, x240, y, imgs.wear.width, imgs.wear.height, 0, 0, flip);
    if (state.wear === 'old' && imgs.dents) blit2x(g, imgs.dents, x240, y, imgs.dents.width, imgs.dents.height, 0, 0, flip);
    // rider for bike/scooter (placeholder)
    if ((state.mode === 'bike' || state.mode === 'scooter') && imgs.rider) {
      const meta = imgs.meta;
      let sx = 8, sy = 1;
      if (meta && meta.riding_anchor && meta.riding_anchor[0]) {
        sx = meta.riding_anchor[0].seat_x;
        sy = meta.riding_anchor[0].seat_y;
      }
      const rw = imgs.rider.width, rh = imgs.rider.height;
      blit2x(g, imgs.rider, x240 + sx - Math.floor(rw / 3), y + sy - rh + 8, rw, rh, 0, 0, flip);
    }
    // occasional smoke (labelled only in caption)
    if (opts.smoke && state.mode === 'car') {
      drawSmoke(g, x240, y, size, elapsed, flip);
    }
    return { x: x240, y, w: size.w, h: size.h, bob };
  }

  function drawSmoke(g, x240, y, size, elapsed, flip) {
    const gx = document.createElement('canvas');
    // draw a few rising puffs in 480 space, labelled once above
    const cx = Math.round((flip ? x240 + 6 : x240 + size.w - 10) * SCALE);
    const cy = Math.round((y + 4) * SCALE);
    const t = elapsed / 180;
    g.fillStyle = 'rgba(80,80,80,0.55)';
    for (let i = 0; i < 3; i++) {
      const ph = (t + i * 1.3) % 8;
      const px = cx + Math.sin((t + i) * 0.8) * 3;
      const py = cy - ph * 3;
      const r = 3 + (ph % 4);
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
  }

  function drawRain(g, imgs, elapsed) {
    if (!imgs.rain) return;
    g.imageSmoothingEnabled = false;
    const w = imgs.rain.width * SCALE, h = imgs.rain.height * SCALE;
    const ox = -Math.round(((elapsed / 30) % (imgs.rain.width)) * SCALE);
    const oy = Math.round(((elapsed / 18) % 20));
    for (let x = ox - w; x < W480; x += w) {
      g.drawImage(imgs.rain, x, oy - 8, w, h);
      g.drawImage(imgs.rain, x + 20, oy - 40, w, h);
    }
  }

  function drawCardSlot(g, state) {
    // Keep well inside the 480 scene and below the year tag; drawer 820 covers x>~327.
    const x = 36, y = 36, w = 128, h = 48;
    g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(18,15,20,0.82)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#d6c8ac';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#f0e8d6';
    g.font = '12px NotoTC,sans-serif';
    g.fillText('卡片（占位）', x + 10, y + 20);
    g.fillStyle = '#b0a492';
    g.font = '11px NotoTC,sans-serif';
    g.fillText('文案待公主', x + 10, y + 36);
    return { x, y, w, h };
  }

  function layout240(state, mot, imgs) {
    const flip = state.trip === 'home';
    const roadY = (cfg.road_bottom_y_240 || 102);
    const parkY = (cfg.parked_bottom_y_240 || 114);
    const parkXHome = 152;
    const parkXOffice = 150;
    const parkXDest = 140;
    const roadX = 88;
    const size = vehicleSize(state, imgs, true);
    let bgKey, scroll = 0, x, y, parked = false, frozen = false, smoke = false;
    const ev = mot.ev;
    frozen = ev.traffic || ev.breakdown;
    smoke = ev.breakdown || (state.wear === 'old' && mot.phase === 'road' && Math.floor(mot.t / 400) % 5 === 0);
    if (mot.phase === 'depart') {
      bgKey = startBg(state);
      const from = state.trip === 'home' ? parkXOffice : parkXHome;
      x = from + (roadX - from) * mot.u;
      y = parkY + (roadY - parkY) * mot.u;
      parked = mot.u < 0.15;
    } else if (mot.phase === 'road' || (mot.phase !== 'done' && mot.phase !== 'arrive')) {
      bgKey = 'street';
      x = roadX;
      y = roadY;
      let u = mot.u;
      if (ev.lost) {
        // wander: back-and-forth scroll
        const lt = (mot.t - (mot.p.lostAt || 0)) / (mot.p.lostMs || 1);
        scroll = (0.4 * (mot.p.road || 1) / 8) + Math.sin(lt * Math.PI * 2) * 40;
      } else {
        scroll = u * 220;
      }
      if (ev.breakdown) frozen = true;
    } else {
      bgKey = endBg(state);
      const to = state.trip === 'home' ? parkXHome : (state.trip === 'weekend' ? parkXDest : parkXOffice);
      const u = mot.phase === 'done' ? 1 : mot.u;
      x = roadX + (to - roadX) * u;
      y = roadY + (parkY - roadY) * u;
      parked = u > 0.7;
      scroll = 0;
    }
    if (state.mode === 'bus') {
      // waiting: person at the start, bus arrives; same 3s layout
      return layoutBus(state, mot, imgs, { flip, parkY, roadY, parkXHome, parkXOffice, parkXDest, ev });
    }
    return { bgKey, scroll, x, y, parked, frozen, smoke, flip, ev, size };
  }

  function layoutBus(state, mot, imgs, base) {
    const waitX = 70;
    const busW = (imgs.busMeta && imgs.busMeta.frame_w) || 56;
    let busX, parked = false, frozen = false, bgKey, scroll = 0;
    if (mot.phase === 'depart') {
      bgKey = startBg(state);
      busX = -busW + (waitX - 10 + busW) * mot.u;
    } else if (mot.phase === 'road') {
      bgKey = 'street';
      busX = 80;
      scroll = mot.u * 220;
    } else {
      bgKey = endBg(state);
      const to = state.trip === 'home' ? 40 : 150;
      const u = mot.phase === 'done' ? 1 : mot.u;
      busX = 80 + (to - 80) * u;
      parked = u > 0.7;
    }
    return {
      bgKey, scroll, x: busX, y: (cfg.road_bottom_y_240 || 102), parked, frozen, smoke: false,
      flip: state.trip === 'home', ev: mot.ev, size: vehicleSize(state, imgs, true),
      riderAt: { x: waitX, y: (cfg.parked_bottom_y_240 || 114), show: mot.phase === 'depart' },
    };
  }

  function applyCaption(state, mot) {
    const cap = captionText(state, mot);
    const el = document.getElementById('caption');
    if (el) el.textContent = cap;
    const tag = document.getElementById('tag');
    if (tag && state._corner) tag.textContent = state._corner;
    const st = document.getElementById('status');
    if (st) st.textContent = cap;
    const ls = document.getElementById('lstatus');
    if (ls) ls.textContent = cap;
    const box = document.getElementById('ltext');
    if (box) {
      const menu = commute && commute.goingOut;
      const arrived = !menu && mot && (mot.phase === 'arrive' || mot.phase === 'done' || (commute && commute.cut));
      if (arrived) {
        box.innerHTML = '<div style="border:3px solid #d6c8ac;outline:3px solid #0a080c;background:#1a161e;color:#f0e8d6;padding:14px 18px;margin:0 0 20px;font-size:28px;line-height:1.45">卡片（占位）<div style="color:#b0a492;font-size:24px;margin-top:6px">文案待公主</div></div>';
      } else if (box.dataset.commuteCard === '1' || box.innerHTML.indexOf('卡片（占位）') >= 0) {
        box.innerHTML = '';
      }
      box.dataset.commuteCard = arrived ? '1' : '0';
    }
  }

  function drawCommuteNative(g, now) {
    if (!commute) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const { state, imgs } = commute;
    const elapsed = commute.cut ? state.durationMs : Math.max(0, now - commute.t0);
    const mot = motionAt(state, elapsed);
    if (mot.phase === 'done') commute.finished = true;
    const lay = layout240(state, mot, imgs);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#121014';
    g.fillRect(0, 0, W480, H270);
    drawBg(g, imgs, lay.bgKey, lay.scroll, false);
    const boxes = [];
    if (lay.riderAt && lay.riderAt.show && imgs.rider) {
      const rh = imgs.rider.height, rw = imgs.rider.width;
      blit2x(g, imgs.rider, lay.riderAt.x, lay.riderAt.y - rh, rw, rh, 0, 0, false);
      boxes.push({ name: 'character', x: lay.riderAt.x * SCALE, y: (lay.riderAt.y - rh) * SCALE, w: rw * SCALE, h: rh * SCALE });
    }
    const vb = drawVehicle(g, state, imgs, lay.x, lay.y, elapsed, {
      frozen: lay.frozen, flip: lay.flip, parked: lay.parked, smoke: lay.smoke || lay.ev.breakdown,
    });
    if (vb) boxes.push({ name: 'vehicle', x: vb.x * SCALE, y: vb.y * SCALE, w: vb.w * SCALE, h: vb.h * SCALE });
    if (state.rain || lay.ev.rain) drawRain(g, imgs, elapsed);
    // Card slot is drawn in the text drawer (applyCaption), not on the canvas, so it cannot overlap the vehicle or the year tag.
    commute.boxes = boxes;
    applyCaption(state, mot);
  }

  function skipCommute() {
    if (!commute) return;
    commute.cut = true;
    commute.finished = true;
  }
  function replayCommute() {
    if (!commute) return;
    commute.cut = false;
    commute.finished = false;
    commute.t0 = performance.now();
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function overlapReport() {
    if (!commute || !commute.boxes) return [];
    const hits = [];
    const b = commute.boxes;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      // rain/smoke not boxed; card vs vehicle / label vs vehicle matter
      if ((b[i].name === 'vehicle' && b[j].name === 'label') || (b[j].name === 'vehicle' && b[i].name === 'label') ||
          (b[i].name === 'vehicle' && b[j].name === 'card') || (b[j].name === 'vehicle' && b[i].name === 'card') ||
          (b[i].name === 'character' && b[j].name === 'label') || (b[j].name === 'character' && b[i].name === 'label') ||
          (b[i].name === 'character' && b[j].name === 'card') || (b[j].name === 'character' && b[i].name === 'card')) {
        if (boxesOverlap(b[i], b[j])) hits.push([b[i], b[j]]);
      }
    }
    return hits;
  }

  function wireSkip() {
    const on = ev => { skipCommute(); ev.preventDefault(); };
    for (const id of ['sceneL', 'sceneP']) {
      const c = document.getElementById(id);
      if (c) { c.style.cursor = 'pointer'; c.addEventListener('click', on); }
    }
  }

  function wireReplayButtons() {
    const wire = sel => {
      const box = document.getElementById(sel);
      if (!box) return;
      box.innerHTML = '';
      const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
      mk('重播', () => replayCommute());
      mk('跳過', () => skipCommute());
    };
    wire('btns'); wire('lbtns');
  }

  async function initCommute(lighting, corner) {
    await ensureCfg();
    const qs = qsNow();
    const Logic = root.CommuteLogic;
    // Dev default: if no vehicle query and no ported car state, show an owned compact car so the screen is watchable.
    // Use &vehicle=none for the no-car path (scooter / bike / bus).
    if (!qs.get('vehicle') && !root.COMMUTE_GAME_STATE) qs.set('vehicle', 'car');
    const state = Logic.readCarState(qs, root.COMMUTE_GAME_STATE || null);
    if (lighting === 'evening') { state.lighting = 'evening'; state.headlights = state.mode === 'car' || state.mode === 'scooter'; }
    // Dev screen always plays the sequence unless &cut=1. shouldPlayCommute() is still computed (see state.play, &force=1).
    const startCut = qs.get('cut') === '1';
    state._corner = corner || '';
    const imgs = await gatherImages(state);
    commute = { state, imgs, t0: performance.now(), cut: startCut, finished: false, boxes: [], cfg };
    goingOut = null;
    wireSkip();
    wireReplayButtons();
    root.COMMUTE = commute;
    return commute;
  }

  function goingOutHref(extra) {
    const u = new URL(location.href);
    u.searchParams.set('dev', '1');
    u.searchParams.set('screen', 'commute');
    u.searchParams.set('force', '1');
    if (!u.searchParams.get('vehicle')) u.searchParams.set('vehicle', 'car');
    for (const [k, v] of Object.entries(extra)) {
      if (v == null || v === '') u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    return u.toString();
  }

  function wireGoingOutButtons() {
    const dests = [
      ['beach', '海邊'],
      ['mountain', '山上'],
      ['night_market', '夜市'],
      ['friend', '朋友家'],
    ];
    const wire = sel => {
      const box = document.getElementById(sel);
      if (!box) return;
      box.innerHTML = '';
      const row = (label, href) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => { location.href = href; };
        box.appendChild(b);
      };
      row('上班', goingOutHref({ trip: 'work' }));
      row('下班', goingOutHref({ trip: 'home' }));
      // weekend dest picker
      dests.forEach(([id, zh]) => row('週末出遊・' + zh, goingOutHref({ trip: 'weekend', dest: id })));
    };
    wire('btns'); wire('lbtns');
  }

  async function initGoingOut(lighting, corner) {
    await ensureCfg();
    const qs = qsNow();
    const Logic = root.CommuteLogic;
    if (!qs.get('vehicle') && !root.COMMUTE_GAME_STATE) qs.set('vehicle', 'car');
    const state = Logic.readCarState(qs, root.COMMUTE_GAME_STATE || null);
    if (lighting === 'evening') { state.lighting = 'evening'; state.headlights = false; }
    state._corner = corner || '';
    const timeB = artTime(state, 'bg');
    const home = await tryImg(`assets/vehicles/bg/menwai_normal_${timeB}.png`);
    goingOut = { state, home, lighting: state.lighting };
    commute = { state, imgs: { home, street: home, office: home }, t0: performance.now(), cut: true, finished: true, boxes: [], goingOut: true, cfg };
    // show parked vehicle at the gate as a still, plus the picker
    const imgs = await gatherImages(state);
    commute.imgs = imgs;
    if (home) commute.imgs.home = home;
    wireGoingOutButtons();
    root.COMMUTE = commute;
    root.GOING_OUT = goingOut;
    return goingOut;
  }

  function drawGoingOutNative(g) {
    if (!commute) return;
    const { state, imgs } = commute;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#121014';
    g.fillRect(0, 0, W480, H270);
    drawBg(g, imgs, 'home', 0, false);
    const parkY = cfg.parked_bottom_y_240 || 114;
    if (state.mode !== 'bus') {
      drawVehicle(g, state, imgs, 152, parkY, 0, { frozen: true, flip: false, parked: true, smoke: false });
    } else if (imgs.rider) {
      blit2x(g, imgs.rider, 70, parkY - imgs.rider.height, imgs.rider.width, imgs.rider.height, 0, 0, false);
    }
    const msg = '要出門嗎？選上班、下班，或週末出遊的目的地。';
    for (const id of ['caption', 'status', 'lstatus']) {
      const el = document.getElementById(id);
      if (el) el.textContent = msg;
    }
  }

  root.initCommute = initCommute;
  root.initGoingOut = initGoingOut;
  root.drawCommuteNative = function (g, now) {
    if (goingOut && commute && commute.goingOut) drawGoingOutNative(g);
    else drawCommuteNative(g, now);
  };
  root.skipCommute = skipCommute;
  root.replayCommute = replayCommute;
  root.commuteOverlapReport = overlapReport;
  root.COMMUTE_URL_PARAMS = [
    'screen=commute|going_out',
    'dev=1',
    'orient=landscape',
    'lit=evening',
    'vehicle=none|bike|scooter|car|bus',
    'passengers=0..3',
    'riders=solo|partner|kid_seat|parents',
    'wear=new|old (alias: old→carage=12, new→carage=0)',
    'carage=<years> (0–3 / 4–9 / 10+ breakdown bands)',
    'maint=1 (insurance/maintenance, breakdown rate × 0.7)',
    'durability=0..100',
    'color=0..5 (art currently ships c0 only)',
    'model=0..2 (art currently ships m0 only)',
    'trip=work|home|weekend',
    'dest=beach|mountain|night_market|friend',
    'rain=1',
    'event=none|traffic|rain|lost|breakdown',
    'force=1 (always play the commute instead of cutting to the next scene)',
    'seed=… (playback + events + no-car pick)',
    'newcar=1 (longer new-car-day version)',
    'firstworkday=1',
    'newjob=1',
    'cut=1 (jump to arrival)',
  ];
})(typeof window !== 'undefined' ? window : globalThis);
