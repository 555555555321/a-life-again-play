// Phone B DEV screen dining_r4d: 王子 parent-death b2 dining r4d.
// Four layers, back to front: plate → sprite frame → dining_fg → front_mask frame (data/dining_r4d.json layer_order).
// ?dev=1&screen=dining_r4d[&lit=evening][&frame=N]  frame=N holds each pose on frame N mod its frame count.
// Pure helpers are exported for node tests; drawing runs only in the browser.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DiningR4d = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function framePath(pose, kind, i) {
    return pose.dir + '/' + kind + '/f' + String(i).padStart(2, '0') + '.png';
  }
  // Scene-space top-left of a pose canvas: feet point (x, feet) sits on the anchor pixel.
  function placement(pose) {
    return { left: pose.x - pose.anchor[0], top: pose.feet - pose.anchor[1], w: pose.canvas[0], h: pose.canvas[1] };
  }
  function frameIndex(pose, fixed, elapsedMs, frameMs) {
    const n = pose.frames;
    if (fixed != null && Number.isFinite(fixed)) return ((fixed % n) + n) % n;
    return Math.floor(elapsedMs / frameMs) % n;
  }
  // Ordered draw list for one tick: every pose's sprite before dining_fg, every front_mask after it.
  function drawList(cfg, idx) {
    const list = [];
    for (const layer of cfg.layer_order) {
      if (layer === 'plate' || layer === 'dining_fg') list.push({ layer });
      else cfg.poses.forEach((p, i) => list.push({ layer, pose: p.id, frame: idx[i] }));
    }
    return list;
  }
  function applyStanding(pose, rows) {
    if (typeof StandingPoints === 'undefined' && typeof require === 'function') {
      try { return require('./standing_points.js').applyToVersion(pose, pose.standing_group, rows); } catch (_) { return pose; }
    }
    return StandingPoints.applyToVersion(pose, pose.standing_group, rows);
  }
  const api = { framePath, placement, frameIndex, drawList, applyStanding, state: null };

  api.init = async function (cfg, lighting, frameParam, rows, tint) {
    const lit = lighting === 'evening' ? 'evening' : 'daylight';
    const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); return im; };
    const [plateDay, plateEve, fgDay, fgEve] = await Promise.all([cfg.plate.daylight, cfg.plate.evening, cfg.dining_fg.daylight, cfg.dining_fg.evening].map(load));
    const poses = [];
    for (const raw of cfg.poses) {
      const p = applyStanding(raw, rows);
      const frames = [], fronts = [];
      for (let i = 0; i < p.frames; i++) {
        frames.push(await load(framePath(p, 'frames', i)));
        fronts.push(await load(framePath(p, 'front_mask', i)));
      }
      poses.push(Object.assign({}, p, { img: frames, front: fronts, imgEvening: frames.map(tint), frontEvening: fronts.map(tint) }));
    }
    const fixed = frameParam != null && frameParam !== '' ? Number(frameParam) : null;
    api.state = { cfg, lighting: lit, plate: { daylight: plateDay, evening: plateEve }, fg: { daylight: fgDay, evening: fgEve }, poses, fixed, t0: performance.now() };
    window.DINING_R4D = { lighting: lit, fixedFrame: fixed, layer_order: cfg.layer_order.slice(), poses: poses.map(p => ({ id: p.id, x: p.x, feet: p.feet, anchor: p.anchor, canvas: p.canvas, frames: p.frames, standing_group: p.standing_group })), frames: null };
    return api.state;
  };

  // g: 2D context; k: scale; ox: x offset (portrait 1/0, landscape 4/210).
  api.draw = function (g, now, k, ox, drawSprite) {
    const s = api.state;
    if (!s) return;
    const eve = s.lighting === 'evening';
    const idx = s.poses.map(p => frameIndex(p, s.fixed, now - s.t0, s.cfg.frame_ms));
    g.imageSmoothingEnabled = false;
    for (const item of drawList(s.cfg, idx)) {
      if (item.layer === 'plate' || item.layer === 'dining_fg') {
        const im = (item.layer === 'plate' ? s.plate : s.fg)[s.lighting];
        g.drawImage(im, 0, 0, 480, 270, ox, 0, 480 * k, 270 * k);
        continue;
      }
      const p = s.poses.find(q => q.id === item.pose);
      const pl = placement(p);
      const im = item.layer === 'sprite' ? (eve ? p.imgEvening : p.img)[item.frame] : (eve ? p.frontEvening : p.front)[item.frame];
      const args = [ox + pl.left * k, pl.top * k, pl.w * k, pl.h * k];
      if (item.layer === 'sprite' && drawSprite) drawSprite(g, im, ...args, false);
      else g.drawImage(im, 0, 0, pl.w, pl.h, ...args);
    }
    window.DINING_R4D.frames = idx;
  };
  return api;
});
