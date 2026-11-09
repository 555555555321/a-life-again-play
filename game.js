// 再活一次 手機 B：直式＋橫式抽屜、‖ 分段換頁、動作表缺圖清單。
const W = 480, H = 270, PINK = '#ff2ea6';
const STOPS = [0, 820, 1300], DEF_W = 820;
const NO_START = new Set('。，、！？」』）；：');
const NO_END = new Set('「『（');
const SENT_END = /([。！？])([」』])?/g;
const qs = new URLSearchParams(location.search);
const SHOT = qs.has('shot');
const ORIENT = (qs.get('orient') === 'landscape') ? 'landscape' : 'portrait';
let drawerW = STOPS.includes(+qs.get('drawer')) ? +qs.get('drawer') : 0;
let lockDrawer = false; // 有選項時不能收到 0
let sceneFrozen = false;       // drawer 1300: freeze scene (idle only)
let heldCueKey = null;         // newest section cue held while frozen
let pendingResumeCue = false;  // apply held cue when leaving 1300


let manifest, data, actionIds, missing = new Map(), writerWarns = [];
let imgs = {}, luts = {}, entryById = {}, aliasToId = {};
let cur = 0, pageIdx = 0, pages = [], sections = [], prepared = null;
let activeKey = null, t0 = performance.now();
let transition = null; // {fromCast,toCast,start,ms}
const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d');

function miss(id, kind, where, note) {
  if (!missing.has(id)) missing.set(id, {id, kind, where: [], note: note || null});
  const m = missing.get(id); if (!m.where.includes(where)) m.where.push(where);
}
const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

function resolveActionId(name) {
  if (!name) return null;
  if (entryById[name]) return name;
  if (aliasToId[name]) return aliasToId[name];
  return name;
}

function parseFallback(fb) {
  // Support structured {base, overlay, transform} or prose "媽媽_站＋道具_傳單" / "爸爸_站（水平翻轉）"
  if (!fb) return {base: null, overlay: null, transform: null, unparsed: null};
  if (typeof fb === 'object') {
    return {base: fb.base || null, overlay: fb.overlay || null, transform: fb.transform || null, unparsed: null};
  }
  const s = String(fb);
  let base = null, overlay = null, transform = null;
  const mPlus = s.match(/^([^\s＋+（(]+)(?:\s*[＋+]\s*([^\s（(]+))?/);
  if (mPlus) {
    base = mPlus[1];
    if (mPlus[2] && mPlus[2].startsWith('道具_')) overlay = mPlus[2];
  }
  if (/水平翻轉|flip_x/.test(s)) transform = 'flip_x';
  else if (/下沉\s*1\s*px|breathe|腰以上下移\s*1/.test(s)) transform = 'breathe_1px';
  // arrow fallbacks like "媽媽_拿傳單 → 媽媽_站＋道具_傳單" — take left then right base
  if (s.includes('→')) {
    const parts = s.split('→').map(x => x.trim());
    const last = parseFallback(parts[parts.length - 1]);
    return last;
  }
  if (!base || !entryById[base]) return {base: null, overlay: null, transform: null, unparsed: s};
  return {base, overlay, transform, unparsed: null};
}

async function applyLutToImage(im, lut, charKey, lighting) {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const o = (y * c.width + x) * 4; if (!px[o + 3]) continue;
    if (lut) {
      const v = lut[px[o] + ',' + px[o + 1] + ',' + px[o + 2]];
      if (v) { const [r, gg, b] = v.split(',').map(Number); px[o] = r; px[o + 1] = gg; px[o + 2] = b; }
      else miss(charKey + '@' + lighting, 'lut 色號缺', charKey);
    }
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  g.putImageData(d, 0, 0);
  c.bb = {x0: x0 === 1e9 ? 0 : x0, x1: x1 < 0 ? 0 : x1, y0: y0 === 1e9 ? 0 : y0, y1: y1 < 0 ? 0 : y1};
  return c;
}

async function loadLut(m, lighting, charKey) {
  if (lighting === 'daylight') return null;
  const p = m['lut_' + lighting];
  if (!p) { miss(charKey + '@' + lighting, 'lut', charKey); return null; }
  return luts[p] || (luts[p] = await (await fetch(p)).json());
}

async function sprite(charKey, lighting) {
  const key = charKey + '|' + lighting; if (imgs[key]) return imgs[key];
  const m = manifest[charKey]; if (!m) return null;
  const lut = await loadLut(m, lighting, charKey);

  // Foot-anchored base-body characters (dad/mom/kid): idle + blink + walk + sit
  if (m.anchor === 'foot') {
    const pack = {
      anchor: true,
      ax: (m.anchor_w && m.anchor_w[0]) || 27,
      ay: (m.anchor_w && m.anchor_w[1]) || 115,
      canvasW: (m.canvas && m.canvas[0]) || 56,
      canvasH: (m.canvas && m.canvas[1]) || 116,
      stride: m.stride != null ? m.stride : 8,
      idle: [], walk: [], sit: [], blink: null, sitBlink: null, chair: null,
    };
    const nIdle = m.idle_n || m.n || 4;
    const idlePat = m.idle_frames || m.frames;
    for (let i = 0; i < nIdle; i++) {
      const im = await load(idlePat.replace('{i}', i));
      pack.idle.push(await applyLutToImage(im, lut, charKey, lighting));
    }
    if (m.idle_blink) {
      try { pack.blink = await applyLutToImage(await load(m.idle_blink), lut, charKey, lighting); }
      catch (_) { pack.blink = pack.idle[0]; }
    } else pack.blink = pack.idle[0];
    const nWalk = m.walk_n || 0;
    if (nWalk && m.walk_frames) {
      for (let i = 0; i < nWalk; i++) {
        const im = await load(m.walk_frames.replace('{i}', i));
        pack.walk.push(await applyLutToImage(im, lut, charKey, lighting));
      }
    }
    const nSit = m.sit_n || 0;
    if (nSit && m.sit_frames) {
      for (let i = 0; i < nSit; i++) {
        try {
          const im = await load(m.sit_frames.replace('{i}', i));
          pack.sit.push(await applyLutToImage(im, lut, charKey, lighting));
        } catch (_) {}
      }
      if (m.sit_blink) {
        try { pack.sitBlink = await applyLutToImage(await load(m.sit_blink), lut, charKey, lighting); }
        catch (_) {}
      }
    }
    if (m.chair && manifest[m.chair]) {
      const src = manifest[m.chair].src;
      if (src) {
        try {
          // chairs share the 56×116 canvas; evening tint via nearest skin-less identity (no LUT — keep daylight chair)
          const im = await load(src);
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          c.getContext('2d').drawImage(im, 0, 0);
          pack.chair = c;
        } catch (_) {}
      }
    }
    // Side-view idle bridge (walk stop → idle_34v): ~200ms of side idle f00
    if (m.idle_side) {
      try { pack.idleSide = await applyLutToImage(await load(m.idle_side), lut, charKey, lighting); }
      catch (_) { pack.idleSide = null; }
    }
    return imgs[key] = pack;
  }

  // Legacy bbox-centred sprites (cat, etc.)
  if (!m.frames) return null;
  const out = [];
  for (let i = 0; i < m.n; i++) {
    const im = await load(m.frames.replace('{i}', i));
    out.push(await applyLutToImage(im, lut, charKey, lighting));
  }
  return imgs[key] = out;
}

function strideAt(stride, step) {
  if (Array.isArray(stride)) return stride[step % stride.length];
  return stride || 8;
}

function isSitAnim(anim) { return /坐/.test(String(anim || '')); }

function pinkBox(g, x, y, w, h) {
  g.fillStyle = PINK; g.fillRect(x, y, w, h);
  g.fillStyle = '#000'; if (w > 3 && h > 3) { g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); }
}

// Unknown characters: labelled pink silhouette (not a real sprite)
const standinCache = {};
function standinFrames(label) {
  if (standinCache[label]) return standinCache[label];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const c = document.createElement('canvas'); c.width = 40; c.height = 70;
    const g = c.getContext('2d');
    g.fillStyle = PINK; g.fillRect(12, 8, 16, 16); // head
    g.fillRect(10, 24, 20, 28); // torso
    g.fillRect(10, 52, 8, 16); g.fillRect(22, 52, 8, 16); // legs
    g.fillStyle = '#fff'; g.font = '10px NotoTC,sans-serif';
    const t = (label || '?').slice(0, 2);
    g.fillText(t, 10, 7);
    // slight breath on frame 3
    if (i === 3) { g.fillStyle = PINK; g.fillRect(12, 7, 16, 16); }
    c.bb = {x0: 10, x1: 29, y1: 67};
    out.push(c);
  }
  return standinCache[label] = out;
}

function isStandin(id) { return !manifest[id] || String(id).startsWith('standin_'); }


async function propImg(id, lighting, where) {
  // Resolve via action table id; prefer local manifest temporary path
  const tid = resolveActionId(id) || id;
  let m = manifest[tid] || manifest[id];
  // also allow old alias keys in manifest
  if (!m) {
    for (const [k, v] of Object.entries(manifest)) {
      if (v && v.aliases && v.aliases.includes(id)) { m = v; break; }
    }
  }
  const src = m && (m['src_' + lighting] || m.src);
  if (src) {
    try { return await load(src); } catch (e) { miss(tid, '道具檔讀取失敗', where); return null; }
  }
  // Table entry: temporary path or official pattern under assets/props/
  const ent = entryById[tid];
  if (ent) {
    const tmp = ent.temporary_path || ent.temp_path || ent.temporary || (ent.file_pattern && ent.file_pattern.temporary);
    if (typeof tmp === 'string') {
      const local = tmp.startsWith('assets/') ? tmp : null;
      if (local) { try { return await load(local); } catch (_) {} }
    }
    // try official pattern as local props file f0
    const fp = typeof ent.file_pattern === 'string' ? ent.file_pattern : null;
    if (fp) {
      const f0 = 'assets/props/' + fp.replace('{n}', '0');
      try { return await load(f0); } catch (_) {}
    }
    if (ent.status === 'missing') miss(tid, '道具（缺）', where, ent.fallback || null);
  } else {
    miss(tid, '道具', where);
  }
  return null;
}

function isRunAnim(anim) { return /跑/.test(String(anim || '')); }

function checkAnim(anim, where) {
  if (!anim) return;
  const tid = resolveActionId(anim);
  const ent = entryById[tid];
  if (!ent) { miss(anim, '動作（表無此 id）', where); return; }
  if (ent.status === 'missing') {
    const fb = parseFallback(ent.fallback);
    miss(tid, '動作（退回 ' + (fb.base || 'idle') + '）', where, ent.fallback || null);
    if (fb.unparsed) writerWarns.push({type: 'fallback_unparsed', id: tid, text: fb.unparsed});
  }
}

async function prepareCue(cue, key) {
  const lighting = cue.lighting || 'daylight';
  const p = {key, lighting, cast: [], layers: [], cue};
  const roomId = 'room_' + lighting;
  p.room = manifest[roomId] ? await load(manifest[roomId].src) : (miss(roomId, '背景', key), null);
  for (const m of cue.cast || []) {
    checkAnim(m.anim, key);
    let fr;
    if (isStandin(m.id)) {
      const label = m.label || String(m.id).replace(/^standin_/, '');
      miss(m.anim || label, '人物（缺；粉紅剪影暫代）', key, '表無此角色／動作，粉紅剪影暫代');
      fr = standinFrames(label);
    } else {
      fr = await sprite(m.id, lighting);
      if (!fr) miss(m.id, '人物', key);
    }
    const props = [];
    for (const pr of m.props || []) {
      const im0 = await propImg(pr.id, lighting, key);
      let im = im0;
      if (im0 && !im0.bb) {
        // compute opaque bbox once for attach-prop cropping
        const cnv = document.createElement('canvas'); cnv.width = im0.width; cnv.height = im0.height;
        const gg = cnv.getContext('2d'); gg.drawImage(im0, 0, 0);
        const d = gg.getImageData(0, 0, cnv.width, cnv.height), px = d.data;
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
        for (let y = 0; y < cnv.height; y++) for (let x = 0; x < cnv.width; x++) {
          const o = (y * cnv.width + x) * 4; if (!px[o + 3]) continue;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        cnv.bb = {x0: x0 === 1e9 ? 0 : x0, x1: x1 < 0 ? 0 : x1, y0: y0 === 1e9 ? 0 : y0, y1: y1 < 0 ? 0 : y1};
        im = cnv;
      }
      props.push({pr, im, alpha: 1});
    }
    p.cast.push({m, fr, props, alpha: 1});
  }
  for (const pr of cue.scene_props || []) p.layers.push({pr, im: await propImg(pr.id, lighting, key), alpha: 1});
  return p;
}

function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }


// offscreen native scene
const off = document.createElement('canvas'); off.width = W; off.height = H;
const landBuf = document.createElement('canvas'); landBuf.width = 2340; landBuf.height = 1080;

function drawSceneNative(g, now) {
  const p = prepared; if (!p) return;
  const t = Math.floor((now - t0) / 100);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (p.room) g.drawImage(p.room, 0, 0); else pinkBox(g, 0, 0, W, H);

  let castList = p.cast;
  let transK = 1;
  // 1300: freeze — no enter/leave/walk transitions; idle blink/breathe only
  if (sceneFrozen) transition = null;
  if (transition) {
    const u = Math.min(1, (now - transition.start) / transition.ms);
    transK = ease(u);
    if (u >= 1) transition = null;
  }

  for (const L of p.layers) {
    const a = L.alpha * (transition ? transK : 1);
    g.globalAlpha = a;
    if (L.im) {
      // full-canvas prop sheets (480×270) are authored in place → draw at 0,0; small crops use pr.x/y
      if (L.im.width >= W && L.im.height >= H) g.drawImage(L.im, 0, 0);
      else g.drawImage(L.im, L.pr.x || 0, L.pr.y || 0);
    } else pinkBox(g, L.pr.x, L.pr.y, L.pr.w, L.pr.h);
    g.globalAlpha = 1;
  }

  const prevMap = transition ? Object.fromEntries(transition.fromCast.map(c => [c.m.id + '|' + (c.m.label||''), c])) : {};
  const list = castList.map((c, i) => {
    let {x, flip} = c.m;
    const prev = prevMap[c.m.id + '|' + (c.m.label||'')];
    if (prev && transition) {
      const x0 = prev.xDraw != null ? prev.xDraw : prev.m.x;
      x = Math.round(x0 + (c.m.x - x0) * transK);
    } else if (c.m.walk_to !== undefined && !transition && !sceneFrozen) {
      // Stride-based walk/run. Walk 8 fps, run = same walk frames at 16 fps (2×).
      // Per-frame stride from manifest (dad/mom 8, kid [5,6]).
      const run = isRunAnim(c.m.anim);
      const period = run ? 62.5 : 125; // ms per walk frame
      const pack = c.fr && c.fr.anchor ? c.fr : null;
      const strideSpec = pack ? pack.stride : 8;
      const dist = c.m.walk_to - c.m.x;
      const dir = dist >= 0 ? 1 : -1;
      const absDist = Math.abs(dist);
      // frames needed one way
      let acc = 0, need = 0;
      while (acc < absDist && need < 200) { acc += strideAt(strideSpec, need); need++; }
      const pauseFrames = 8; // ~1s walk / ~0.5s run idle at target
      const cycleFrames = need + pauseFrames + need + pauseFrames;
      const step = Math.floor((now - t0) / period) % Math.max(1, cycleFrames);
      if (step < need) {
        let traveled = 0;
        for (let i = 0; i < step; i++) traveled += strideAt(strideSpec, i);
        // add partial? stay on frame grid
        x = c.m.x + dir * Math.min(absDist, traveled);
      } else if (step < need + pauseFrames) {
        x = c.m.walk_to;
      } else if (step < need + pauseFrames + need) {
        const s2 = step - need - pauseFrames;
        let traveled = 0;
        for (let i = 0; i < s2; i++) traveled += strideAt(strideSpec, i);
        x = c.m.walk_to - dir * Math.min(absDist, traveled);
        flip = !flip;
      } else {
        x = c.m.x;
      }
      x = Math.round(x);
      const moving = (step < need) || (step >= need + pauseFrames && step < need + pauseFrames + need);
      if (c._walkMoving && !moving) c._walkStopAt = now; // just stopped this frame
      c._walkMoving = moving;
      if (moving) c._walkStopAt = null;
    }
    if (transition && !prev) {
      const edge = c.m.x < W / 2 ? -40 : W + 40;
      x = Math.round(edge + (c.m.x - edge) * transK);
      c._enter = true;
    }
    c.xDraw = x;
    return {...c, x, flip, i, alpha: c._enter && transition ? transK : (c.alpha || 1)};
  }).sort((a, b) => a.m.feet - b.m.feet);

  if (transition) {
    for (const prev of transition.fromCast) {
      const key = prev.m.id + '|' + (prev.m.label||'');
      if (!castList.find(c => (c.m.id + '|' + (c.m.label||'')) === key)) {
        const edge = prev.m.x < W / 2 ? -40 : W + 40;
        const x = Math.round(prev.m.x + (edge - prev.m.x) * transK);
        list.push({...prev, x, flip: prev.m.flip, i: -1, alpha: 1 - transK, leaving: true});
      }
    }
    list.sort((a, b) => a.m.feet - b.m.feet);
  }

  for (const c of list) {
    const {m, fr} = c;
    g.globalAlpha = c.alpha;
    if (!fr) { pinkBox(g, c.x - 12, m.feet - 60, 24, 60); g.globalAlpha = 1; continue; }

    // Foot-anchored base body
    if (fr.anchor) {
      const sitting = isSitAnim(m.anim);
      const walking = !!(c._walkMoving && fr.walk.length && !sitting);
      const bridging = !!(fr.idleSide && c._walkStopAt && (now - c._walkStopAt) < 200 && !sitting && !walking);
      let f;
      if (sitting) {
        const blinkOn = ((t + Math.max(0, c.i) * 7) % 20) >= 17;
        f = (blinkOn && fr.sitBlink) ? fr.sitBlink : (fr.sit[0] || fr.idle[0]);
      } else if (walking) {
        const run = isRunAnim(c.m.anim);
        const period = run ? 62.5 : 125;
        const wf = Math.floor(((now - t0) / period)) % fr.walk.length;
        f = fr.walk[wf];
      } else if (bridging) {
        f = fr.idleSide; // side idle f00, same facing, ~200ms then idle_34v
      } else {
        const phase = (t + Math.max(0, c.i) * 7) % 24;
        if (phase >= 20 && fr.blink) f = fr.blink;
        else f = fr.idle[Math.min(fr.idle.length - 1, Math.floor(phase / 6))];
      }
      const ax = fr.ax, ay = fr.ay;
      const oy = m.feet - ay;
      // chair behind body (unflipped draw with matching flip)
      g.save();
      if (c.flip) { g.translate(c.x, 0); g.scale(-1, 1); }
      const ox = c.flip ? -ax : Math.round(c.x - ax);
      if (sitting && fr.chair) g.drawImage(fr.chair, ox, oy);
      g.drawImage(f, ox, oy);
      g.restore();
      // attach props: cue dx/dy/w/h is the intended on-screen box (from feet).
      // Old prop PNGs are full character-canvas sheets; draw only the opaque crop into that box.
      for (const P of c.props || []) if (P.im) {
        g.globalAlpha = c.alpha * (P.alpha || 1) * (transition && !c.leaving ? transK : 1);
        if (P.pr && (P.pr.dx != null || P.pr.dy != null)) {
          const pdx = P.pr.dx || 0, pdy = P.pr.dy || 0;
          const pw = P.pr.w || 8, ph = P.pr.h || 8;
          const bb = P.im.bb;
          const sx = c.flip ? c.x - pdx - pw : c.x + pdx;
          const sy = m.feet + pdy;
          if (bb && bb.x1 >= bb.x0) {
            const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - (bb.y0 || 0) + 1;
            g.imageSmoothingEnabled = false;
            g.drawImage(P.im, bb.x0, bb.y0 || 0, sw, sh, sx, sy, pw, ph);
          } else {
            g.drawImage(P.im, sx, sy);
          }
        } else {
          g.drawImage(P.im, Math.round(c.x - ax), oy);
        }
        g.globalAlpha = c.alpha;
      }
      for (const P of c.props || []) if (!P.im) {
        const dx = c.flip ? -(P.pr.dx || 0) - (P.pr.w || 8) : (P.pr.dx || 0);
        pinkBox(g, c.x + dx, m.feet + (P.pr.dy || -20), P.pr.w || 8, P.pr.h || 8);
      }
      g.globalAlpha = 1;
      continue;
    }

    // Legacy bbox-centred
    let f;
    if (m.id === 'cat') f = fr[Math.floor(t / 3) % fr.length];
    else f = ((t + Math.max(0, c.i) * 7) % 16 >= 12) ? fr[3] : fr[0];
    const bb = f.bb, cx = (bb.x0 + bb.x1 + 1) / 2;
    g.save();
    const ox = c.flip ? Math.round(-cx) : Math.round(c.x - cx), oy = m.feet - bb.y1 - 1;
    if (c.flip) { g.translate(c.x, 0); g.scale(-1, 1); }
    g.drawImage(f, ox, oy);
    for (const P of c.props || []) if (P.im) {
      g.globalAlpha = c.alpha * (P.alpha || 1) * (transition && !c.leaving ? transK : 1);
      g.drawImage(P.im, ox, oy);
      g.globalAlpha = c.alpha;
    }
    g.restore();
    for (const P of c.props || []) if (!P.im) {
      const dx = c.flip ? -(P.pr.dx || 0) - (P.pr.w || 8) : (P.pr.dx || 0);
      pinkBox(g, c.x + dx, m.feet + (P.pr.dy || -20), P.pr.w || 8, P.pr.h || 8);
    }
    g.globalAlpha = 1;
  }
}

function compositeLandscape(dest, now) {
  // draw native 480x270
  const og = off.getContext('2d');
  drawSceneNative(og, now);
  const dg = dest.getContext('2d');
  dg.imageSmoothingEnabled = false;
  // x4 into center: 1920x1080 at x=210
  const SX = 210, SW = 1920, SH = 1080;
  dg.clearRect(0, 0, 2340, 1080);
  // upscale via drawImage nearest
  dg.drawImage(off, 0, 0, W, H, SX, 0, SW, SH);
  // extend edge columns by stretching the leftmost/rightmost scene column (integer, no filter)
  dg.drawImage(dest, SX, 0, 1, SH, 0, 0, SX, SH);
  dg.drawImage(dest, SX + SW - 1, 0, 1, SH, SX + SW, 0, 2340 - (SX + SW), SH);
}

function loop(now) {
  if (!prepared) { requestAnimationFrame(loop); return; }
  if (ORIENT === 'portrait') {
    const c = document.getElementById('sceneP');
    if (c) { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; drawSceneNative(g, now); }
  } else {
    const c = document.getElementById('sceneL');
    if (c) compositeLandscape(c, now);
  }
  requestAnimationFrame(loop);
}

// ——— text / pagination ———
function splitSections(text) {
  if (!text) return [];
  if (text.includes('‖')) return text.split('‖').map(s => s.trim()).filter(Boolean);
  // no ‖: auto-split at sentence ends
  const out = []; let buf = '';
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    if ('。！？'.includes(text[i])) {
      // include closing quote if next
      if (i + 1 < text.length && '」』'.includes(text[i + 1])) { buf += text[++i]; }
      out.push(buf.trim()); buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : (text.trim() ? [text.trim()] : []);
}

function measureFont(px) { return px + 'px NotoTC'; }

function wrapLine(str, maxW, font) {
  measureCtx.font = font;
  // Match CSS: no letter-spacing on landscape; keep portrait's 1px if font string asks — width already in maxW.
  const lines = [];
  let i = 0;
  const widthOf = (s) => measureCtx.measureText(s).width;
  while (i < str.length) {
    let lo = 1, hi = str.length - i, fit = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (widthOf(str.slice(i, i + mid)) <= maxW) { fit = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    let n = Math.max(1, fit);
    // Prefer breaking after clause punctuation near the end of the fitted run
    // (keeps compounds like 跳舞 together when a comma sits a few chars earlier).
    if (n >= 4 && i + n < str.length) {
      const SOFT = new Set('，、；：');
      for (let k = n; k >= n - 4 && k > 1; k--) {
        if (SOFT.has(str[i + k - 1])) { n = k; break; }
      }
    }
    // kinsoku: don't start next line with NO_START — pull punct onto this line
    if (i + n < str.length && NO_START.has(str[i + n])) {
      let k = n;
      while (k > 1 && NO_START.has(str[i + k])) k--;
      if (k > 1) n = k;
      // if punct still won't fit alone on this line, push one char to next only if next isn't NO_START-only orphan handled below
      while (n < str.length - i && NO_START.has(str[i + n]) && widthOf(str.slice(i, i + n + 1)) <= maxW) n++;
    }
    // don't end line with NO_END if possible
    if (n > 1 && NO_END.has(str[i + n - 1]) && i + n < str.length) {
      if (widthOf(str.slice(i, i + n + 1)) <= maxW) n += 1;
      else n -= 1;
    }
    // Avoid leaving a tiny remainder (<2 chars) on the next line when we can keep it
    const remain = str.length - (i + n);
    if (remain > 0 && remain < 2 && n > remain) {
      // try to pull remainder onto this line
      if (widthOf(str.slice(i, str.length)) <= maxW) n = str.length - i;
      else {
        // else push 1–2 chars down so next line isn't a single orphan mid-clause if possible
        // (CJK has no spaces; prefer not ending with a single leftover like 「跳」alone when 「跳舞…」fits next)
      }
    }
    // Safety: never emit empty
    n = Math.max(1, Math.min(n, str.length - i));
    lines.push(str.slice(i, i + n));
    i += n;
  }
  // Post-pass: merge a non-final 1-char line into previous if previous+it still fits (fixes orphan 跳)
  for (let li = 1; li < lines.length; li++) {
    if (lines[li].length === 1 && li < lines.length) {
      const merged = lines[li - 1] + lines[li];
      if (widthOf(merged) <= maxW) {
        lines[li - 1] = merged;
        lines.splice(li, 1);
        li--;
      }
    }
  }
  return lines;
}

function splitOversizedSection(sec, maxLines, maxW, font) {
  // split at sentence ends first; if one sentence still too long, at ， then hard wrap
  const chunks = [];
  let buf = '';
  const pushBuf = () => { if (buf) { chunks.push(buf); buf = ''; } };
  for (let i = 0; i < sec.length; i++) {
    buf += sec[i];
    const end = '。！？'.includes(sec[i]) || (sec[i] === '，' && wrapLine(buf, maxW, font).length >= maxLines);
    if ('。！？'.includes(sec[i])) {
      if (i + 1 < sec.length && '」』'.includes(sec[i + 1])) buf += sec[++i];
      pushBuf();
    }
  }
  pushBuf();
  // pack sentence chunks into pages of maxLines
  const pages = [];
  let cur = [];
  let curLines = 0;
  for (const ch of chunks) {
    let lines = wrapLine(ch, maxW, font);
    if (lines.length > maxLines) {
      // hard-split by lines
      if (cur.length) { pages.push(cur); cur = []; curLines = 0; }
      for (let i = 0; i < lines.length; i += maxLines) pages.push([lines.slice(i, i + maxLines).join('')]);
      continue;
    }
    const need = lines.length + (cur.length ? 1 : 0);
    if (cur.length && curLines + need > maxLines) { pages.push(cur); cur = [ch]; curLines = lines.length; }
    else { cur.push(ch); curLines += need; }
  }
  if (cur.length) pages.push(cur);
  return pages; // each is array of sub-sections (strings)
}

function buildPages(sectionList, maxLines, maxW, fontPx) {
  const font = measureFont(fontPx);
  const warns = [];
  const pages = [];
  let cur = []; // {text, lines, globalIdx}
  let curLines = 0;

  function emit() {
    if (cur.length) pages.push(cur);
    cur = []; curLines = 0;
  }

  sectionList.forEach((sec, gi) => {
    if (sec.length > 80) warns.push({type: 'over80', index: gi, len: sec.length, text: sec.slice(0, 40) + '…'});
    let lines = wrapLine(sec, maxW, font);
    if (lines.length > maxLines) {
      // section alone doesn't fit → split at sentence ends across pages
      emit();
      const subPages = splitOversizedSection(sec, maxLines, maxW, font);
      for (const subs of subPages) {
        const items = subs.map((t, j) => ({text: t, lines: wrapLine(t, maxW, font), globalIdx: gi, part: j}));
        pages.push(items);
      }
      return;
    }
    const need = lines.length + (cur.length ? 1 : 0); // blank line between
    if (cur.length && curLines + need > maxLines) emit();
    cur.push({text: sec, lines, globalIdx: gi});
    curLines += (cur.length === 1 ? lines.length : lines.length + 1);
  });
  emit();
  return {pages, warns};
}

function layoutMetrics() {
  if (ORIENT === 'portrait') {
    const s = data.screens[activeKey] || {};
    const btns = isLastPage() ? Math.max(1, (s.buttons || []).length) : 1;
    const btnH = btns * 144 + (btns - 1) * 24 + 100;
    const lineH = 76, maxW = 960;
    if (s.reader) {
      const textTop = 120, textBot = 2340 - btnH;
      const maxLines = Math.max(8, Math.floor((textBot - textTop) / lineH));
      return {maxLines, maxW, fontPx: 48, lineH};
    }
    const textTop = 810, textBot = 2340 - btnH;
    const maxLines = Math.max(3, Math.min(8, Math.floor((textBot - textTop) / lineH)));
    return {maxLines, maxW, fontPx: 48, lineH};
  } else {
    // landscape drawer
    const w = Math.max(drawerW, DEF_W); // measure against open width when collapsed for page counts? use actual if open else DEF
    const useW = drawerW > 0 ? drawerW : DEF_W;
    let innerW = useW - 56 - 60;
    const live = document.getElementById('ltext');
    if (live && live.clientWidth > 40) innerW = live.clientWidth;
    const fontPx = 40, lineH = Math.round(fontPx * 1.6); // 64
    // status ~34+margin, buttons
    const nBtn = isLastPage() ? Math.max(1, (data.screens[activeKey].buttons || []).length) : 1;
    const cols = nBtn === 4 ? 2 : 1;
    const rows = Math.ceil(nBtn / cols);
    const btnBlock = rows * 130 + (rows - 1) * 24 + 40;
    const statusBlock = 44 + 34 * 1.5 + 26 + 28;
    const avail = 1080 - statusBlock - btnBlock;
    const maxLines = Math.max(3, Math.floor(avail / (lineH + 8)));
    return {maxLines, maxW: innerW, fontPx, lineH, useW};
  }
}

function isLastPage() { if (!pages.length) return false; return pageIdx >= pages.length - 1; }

function newestSectionIdx() {
  const p = pages[pageIdx]; if (!p || !p.length) return 0;
  return p[p.length - 1].globalIdx;
}

async function applyCueForNewest() {
  const s = data.screens[activeKey];
  const gi = newestSectionIdx();
  heldCueKey = gi;
  if (sceneFrozen) return; // keep current prepared; resume later
  let cue = null;
  if (s.cues && s.cues.length) {
    for (let i = Math.min(gi, s.cues.length - 1); i >= 0; i--) {
      if (s.cues[i]) { cue = s.cues[i]; break; }
    }
  }
  if (!cue) cue = {lighting: s.lighting, cast: s.cast || [], scene_props: s.scene_props || []};
  const prev = prepared;
  const next = await prepareCue(cue, activeKey);
  if (prev && prev.cast.length) {
    transition = {fromCast: prev.cast.map(c => ({...c, xDraw: c.xDraw != null ? c.xDraw : c.m.x})), start: performance.now(), ms: 800};
  }
  prepared = next;
}

function renderTextPortrait() {
  const phone = document.getElementById('phone');
  const s = data.screens[activeKey];
  phone.classList.toggle('reader', !!s.reader);
  document.getElementById('corner').textContent = data.corner;
  document.getElementById('status').textContent = s.status || '';
  document.getElementById('pageind').textContent = pages.length > 1 ? `${pageIdx + 1}/${pages.length}` : '';
  const box = document.getElementById('text'); box.innerHTML = '';
  const page = pages[pageIdx] || [];
  page.forEach((sec, i) => {
    const d = document.createElement('div');
    d.className = 'sec' + (i < page.length - 1 ? ' dim' : '');
    d.textContent = sec.lines.join('\n');
    d.style.whiteSpace = 'pre-wrap';
    box.appendChild(d);
  });
  const b = document.getElementById('btns'); b.innerHTML = '';
  const labels = isLastPage() ? (s.buttons || ['繼續']) : ['繼續'];
  labels.forEach((label, i) => {
    const e = document.createElement('button'); e.textContent = label;
    e.onclick = () => onChoice(e, isLastPage(), i);
    b.appendChild(e);
  });
}

function renderTextLandscape() {
  const stage = document.getElementById('stage');
  const s = data.screens[activeKey];
  stage.classList.toggle('reader', !!s.reader);
  document.getElementById('tag').textContent = data.corner;
  document.getElementById('caption').textContent = s.status || '';
  document.getElementById('lstatus').textContent = s.status || '';
  document.getElementById('lpageind').textContent = pages.length > 1 ? `${pageIdx + 1}/${pages.length}` : '';
  const box = document.getElementById('ltext'); box.innerHTML = '';
  const page = pages[pageIdx] || [];
  page.forEach((sec, i) => {
    const d = document.createElement('div');
    d.className = 'sec' + (i < page.length - 1 ? ' dim' : '');
    d.textContent = sec.lines.join('\n');
    box.appendChild(d);
  });
  const b = document.getElementById('lbtns'); b.innerHTML = '';
  const labels = isLastPage() ? (s.buttons || ['繼續']) : ['繼續'];
  b.style.gridTemplateColumns = labels.length === 4 ? '1fr 1fr' : '1fr';
  labels.forEach((label, i) => {
    const e = document.createElement('button'); e.textContent = label;
    e.onclick = () => onChoice(e, isLastPage(), i);
    b.appendChild(e);
  });
  // auto-open drawer when event text or choices appear
  const hasBody = !!(s.text && s.text.length) || page.length > 0;
  const hasChoices = isLastPage() && (s.buttons || []).length > 0;
  lockDrawer = hasChoices && isLastPage() && (s.buttons || []).length > 0 && pageIdx === pages.length - 1 && (s.buttons || []).some(x => x !== '繼續' || (s.buttons || []).length > 1);
  // lock when real choices (more than just continue-as-paging). Spec: while choices showing cannot close
  lockDrawer = isLastPage() && (s.buttons || []).length > 0;
  // status-only (no body): do not auto-open
  if (!s.text && !s.reader && pages.length <= 1 && page.length === 0) {
    lockDrawer = false;
  } else if ((hasBody || hasChoices) && drawerW === 0 && !SHOT) {
    drawerW = DEF_W;
  } else if ((hasBody || hasChoices) && drawerW === 0 && SHOT && qs.has('autoopen')) {
    drawerW = DEF_W;
  }
  applyDrawerDOM();
}

function visibleSceneRange480(w) {
  // Scene bitmap: 1920×1080 at canvas x=210, then whole stage shifts left by w/2.
  // Visible uncovered canvas: [0, 2340-w). Map intersection back to 480-space.
  const shift = w / 2;
  const contentL = 210 - shift, contentR = 210 + 1920 - shift;
  const visL = 0, visR = 2340 - w;
  const iL = Math.max(contentL, visL), iR = Math.min(contentR, visR);
  const origin = contentL; // canvas x of scene pixel 0
  return {
    drawer: w, shift,
    canvasIntersect: [iL, iR],
    scenePx: [iL - origin, iR - origin],
    native480: [(iL - origin) / 4, (iR - origin) / 4],
  };
}

function applyDrawerDOM() {
  const panel = document.getElementById('panel');
  const sceneBox = document.getElementById('sceneBoxL');
  const caption = document.getElementById('caption');
  const dot = document.getElementById('dot');
  if (!panel) return;
  let v = drawerW;
  if (lockDrawer && v === 0) v = DEF_W;
  drawerW = v;
  panel.style.width = v + 'px';
  // 王：抽屜打開時場景左移抽屜寬的一半，與抽屜同轉場
  if (sceneBox) sceneBox.style.left = (-v / 2) + 'px';
  if (caption) { caption.style.opacity = v > 0 ? '0' : '1'; caption.style.visibility = v > 0 ? 'hidden' : 'visible'; }
  const s = data && data.screens[activeKey];
  const multi = s && (s.buttons || []).length > 1;
  if (dot) dot.style.display = (v === 0 && multi) ? 'block' : 'none';
  document.body.dataset.drawer = String(v);
  window.VISIBLE_RANGE = visibleSceneRange480(v);
}

function onChoice(btn, last, i) {
  btn.classList.add('sel');
  setTimeout(async () => {
    if (!last) {
      pageIdx++;
      if (sceneFrozen) { heldCueKey = newestSectionIdx(); renderAll(); }
      else { await applyCueForNewest(); renderAll(); }
      return;
    }
    // choice made → auto-close drawer in landscape
    if (ORIENT === 'landscape') { lockDrawer = false; setDrawer(0); }
    await go(cur + 1);
  }, 280);
}

function renderSide() {
  const ul = document.getElementById('miss'); ul.innerHTML = '';
  for (const m of missing.values()) {
    const li = document.createElement('li');
    li.textContent = `${m.id}（${m.kind}）：${m.where.join('、')}`;
    ul.appendChild(li);
  }
  const wu = document.getElementById('warns'); wu.innerHTML = '';
  for (const w of writerWarns) {
    const li = document.createElement('li'); li.className = 'warn';
    if (w.type === 'over80') li.textContent = `段落 ${w.index + 1} 超過 80 字（${w.len}）：${w.text}`;
    else li.textContent = `${w.type}: ${w.id || ''} ${w.text || ''}`;
    wu.appendChild(li);
  }
  window.MISSING = [...missing.values()];
  window.WRITER_WARNS = writerWarns.slice();
  window.PAGE_INFO = {pages: pages.length, pageIdx, orient: ORIENT, drawerW, sections: sections.length};
}

function renderAll() {
  if (ORIENT === 'portrait') renderTextPortrait();
  else renderTextLandscape();
  renderSide();
  document.body.dataset.ready = activeKey;
  document.body.dataset.page = String(pageIdx);
  document.body.dataset.pages = String(pages.length);
  document.body.dataset.drawer = String(drawerW);
}

function reflow() {
  const s = data.screens[activeKey];
  sections = splitSections(s.text || '');
  if (pages.length) pageIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
  else pageIdx = 0;
  // first pass assuming not-last (paging 繼續 only) so empty pages[] does not steal choice space
  let m = layoutMetrics();
  let r = buildPages(sections, m.maxLines, m.maxW, m.fontPx);
  pages = r.pages.length ? r.pages : [[]];
  if (pageIdx >= pages.length) pageIdx = pages.length - 1;
  // second pass if this is actually the last page with real choice buttons
  if (isLastPage() && (s.buttons || []).length > 1) {
    m = layoutMetrics();
    r = buildPages(sections, m.maxLines, m.maxW, m.fontPx);
    pages = r.pages.length ? r.pages : [[]];
    if (pageIdx >= pages.length) pageIdx = pages.length - 1;
  }
  writerWarns = writerWarns.filter(w => w.type !== 'over80');
  writerWarns.push(...r.warns);
  window.LAYOUT = m;
}

async function go(i, keepPage) {
  const order = data.order;
  cur = (i + order.length) % order.length;
  // allow jumping to test screens via ?screen=
  let key = order[cur];
  if (!keepPage) pageIdx = 0;
  activeKey = key;
  reflow();
  await applyCueForNewest();
  // landscape: auto-open when body/choices
  const s = data.screens[key];
  if (ORIENT === 'landscape') {
    const hasBody = !!(s.text && s.text.length);
    if (hasBody || s.reader) { if (drawerW === 0) drawerW = DEF_W; }
    else drawerW = 0;
  }
  renderAll();
}

async function goKey(key, page) {
  activeKey = key;
  const idx = data.order.indexOf(key);
  cur = idx >= 0 ? idx : cur;
  pageIdx = page || 0;
  reflow();
  await applyCueForNewest();
  if (ORIENT === 'landscape') {
    const s = data.screens[key];
    if ((s.text && s.text.length) || s.reader) { if (drawerW === 0 && !qs.has('drawer')) drawerW = DEF_W; }
  }
  renderAll();
}

let _drawerRepaint = false;
async function setDrawer(v, {reflow: doReflow = true} = {}) {
  if (lockDrawer && v === 0) v = DEF_W;
  if (!STOPS.includes(v)) v = STOPS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  const prev = drawerW;
  const changed = v !== drawerW;
  drawerW = v;
  // 1300 freeze / leave-1300 resume
  if (v === 1300) {
    sceneFrozen = true;
    pendingResumeCue = false;
  } else if (prev === 1300 && v !== 1300) {
    sceneFrozen = false;
    pendingResumeCue = true;
  } else if (v !== 1300) {
    sceneFrozen = false;
  }
  applyDrawerDOM();
  if (pendingResumeCue && activeKey) {
    pendingResumeCue = false;
    await applyCueForNewest(); // animate to newest section cue
  }
  if (doReflow && changed && ORIENT === 'landscape' && activeKey && !_drawerRepaint) {
    _drawerRepaint = true;
    try {
      const oldPage = pageIdx;
      reflow();
      pageIdx = Math.min(oldPage, pages.length - 1);
      renderAll();
    } finally { _drawerRepaint = false; }
  }
}

function fit() {
  const wrap = document.getElementById('wrap');
  const side = document.getElementById('side');
  const phone = document.getElementById('phone');
  const stage = document.getElementById('stage');
  if (ORIENT === 'portrait') {
    phone.style.display = 'block'; stage.style.display = 'none';
    if (SHOT) { side.style.display = 'none'; phone.style.transform = 'none'; wrap.style.width = '1080px'; wrap.style.height = '2340px'; return; }
    const k = Math.min(innerHeight / 2340, (innerWidth - (innerWidth > 900 ? 420 : 0)) / 1080);
    phone.style.transform = `scale(${k})`; wrap.style.width = 1080 * k + 'px'; wrap.style.height = 2340 * k + 'px';
    side.style.display = innerWidth > 900 ? 'block' : 'none';
  } else {
    phone.style.display = 'none'; stage.style.display = 'block';
    if (SHOT) { side.style.display = 'none'; stage.style.transform = 'none'; stage.style.left = '0'; stage.style.top = '0'; wrap.style.width = '2340px'; wrap.style.height = '1080px'; return; }
    const k = Math.min(innerWidth / 2340, innerHeight / 1080);
    stage.style.transform = `scale(${k})`;
    stage.style.left = ((innerWidth - 2340 * k) / 2) + 'px';
    stage.style.top = ((innerHeight - 1080 * k) / 2) + 'px';
    wrap.style.width = '100vw'; wrap.style.height = '100vh';
    side.style.display = 'block'; side.style.position = 'fixed'; side.style.right = '0'; side.style.top = '0'; side.style.zIndex = 9;
  }
}

function wireDrawer() {
  const h = document.getElementById('handle');
  const panel = document.getElementById('panel');
  const stage = document.getElementById('stage');
  let drag = null;
  h.addEventListener('pointerdown', e => {
    h.setPointerCapture(e.pointerId);
    const k = 2340 / stage.getBoundingClientRect().width;
    drag = {x: e.clientX, w: drawerW, k, moved: false};
    panel.classList.add('dragging'); stage.classList.add('dragging');
  });
  h.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = (drag.x - e.clientX) * drag.k;
    if (Math.abs(dx) > 6) drag.moved = true;
    let v = Math.max(0, Math.min(1300, drag.w + dx));
    if (lockDrawer && v < DEF_W) v = DEF_W;
    drawerW = v;
    panel.style.width = v + 'px';
    const sb = document.getElementById('sceneBoxL');
    if (sb) sb.style.left = (-v / 2) + 'px';
    document.getElementById('caption').style.opacity = v > 0 ? 0 : 1;
  });
  h.addEventListener('pointerup', () => {
    panel.classList.remove('dragging'); stage.classList.remove('dragging');
    if (!drag) return;
    if (!drag.moved) {
      const k = STOPS.indexOf(STOPS.includes(drawerW) ? drawerW : DEF_W);
      let next = STOPS[(k + 1) % STOPS.length];
      if (lockDrawer && next === 0) next = 1300;
      setDrawer(next);
    } else {
      let v = STOPS.reduce((a, b) => Math.abs(b - drawerW) < Math.abs(a - drawerW) ? b : a);
      if (lockDrawer && v === 0) v = DEF_W;
      setDrawer(v);
    }
    drag = null;
  });
}

(async () => {
  [manifest, data, actionIds] = await Promise.all([
    fetch('manifest.json').then(r => r.json()),
    fetch('scenes.json').then(r => r.json()),
    fetch('assets/action_ids.json').then(r => r.json()),
  ]);
  for (const e of actionIds.entries) entryById[e.id] = e;
  Object.assign(aliasToId, actionIds.alias_index || {});
  // also aliases on entries
  for (const e of actionIds.entries) for (const a of (e.aliases || [])) aliasToId[a] = e.id;

  await document.fonts.load('48px NotoTC');
  await document.fonts.load('40px NotoTC');
  await document.fonts.load('30px FP10');

  // pre-scan missing for all order + test screens
  for (const k of [...data.order, ...(data._test_order || [])]) {
    const s = data.screens[k];
    const cue = {lighting: s.lighting, cast: s.cast || [], scene_props: s.scene_props || []};
    await prepareCue(cue, k);
    if (s.cues) for (const c of s.cues) if (c) await prepareCue(c, k);
  }
  // rebuild missing cleanly from action table for declared anims in screens
  // (prepareCue already recorded)

  fit(); addEventListener('resize', fit);
  if (ORIENT === 'landscape') wireDrawer();

  document.getElementById('dl').onclick = () => {
    const a = document.createElement('a'); a.download = 'missing_assets.json';
    a.href = URL.createObjectURL(new Blob([JSON.stringify(window.MISSING, null, 2)], {type: 'application/json'})); a.click();
  };
  document.getElementById('togOrient').onclick = () => {
    const u = new URL(location.href);
    u.searchParams.set('orient', ORIENT === 'portrait' ? 'landscape' : 'portrait');
    location.href = u.toString();
  };
  document.getElementById('snap0').onclick = () => { lockDrawer = false; setDrawer(0); };
  document.getElementById('snap820').onclick = () => setDrawer(820);
  document.getElementById('snap1300').onclick = () => setDrawer(1300);

  // initial drawer from URL
  if (ORIENT === 'landscape' && qs.has('drawer')) {
    drawerW = +qs.get('drawer');
    if (drawerW === 1300) sceneFrozen = true;
  }

  const startKey = qs.get('screen');
  const startPage = Math.max(0, +(qs.get('page') || 0));
  if (startKey && data.screens[startKey]) await goKey(startKey, startPage);
  else await go(Math.max(0, data.order.indexOf(startKey)), false);

  // expose for shoot.py
  window.goKey = goKey;
  window.setDrawer = setDrawer;
  window.setPage = async (p) => {
    pageIdx = p;
    if (sceneFrozen) {
      // 1300: text only; hold newest cue for resume
      heldCueKey = newestSectionIdx();
      renderAll();
    } else {
      await applyCueForNewest();
      renderAll();
    }
  };
  window.visibleSceneRange480 = visibleSceneRange480;
  window.getFreeze = () => ({sceneFrozen, heldCueKey, drawerW});
  window.getInfo = () => ({...window.PAGE_INFO, layout: window.LAYOUT, warns: window.WRITER_WARNS, missing: window.MISSING});

  requestAnimationFrame(loop);
})();
