// Messages (訊息) app sample: 96×144 native, integer nearest-neighbour scale only.
(function (root) {
  const L = root.MessagesLogic;
  const T = root.MessagesText;
  const NW = 96, NH = 144, SCALE = 10;

  const ASSET = {
    sms_flip: 'assets/ui/messages/sms_flip.png',
    chat_direct: 'assets/ui/messages/chat_direct.png',
    chat_direct_friend_photo: 'assets/ui/messages/chat_direct_friend_photo.png',
    chat_group: 'assets/ui/messages/chat_group.png',
    chat_group_friend_photo: 'assets/ui/messages/chat_group_friend_photo.png',
    friend_avatar_1: 'assets/ui/messages/friend_avatar_1.png',
    friend_avatar_2: 'assets/ui/messages/friend_avatar_2.png',
    photo_crop_1: 'assets/ui/messages/photo_crop_1.png',
    photo_crop_2: 'assets/ui/messages/photo_crop_2.png'
  };
  const LAYOUT = {
    sms_flip: 'assets/ui/messages/sms_flip_layout.json',
    chat_direct: 'assets/ui/messages/chat_direct_layout.json',
    chat_direct_friend_photo: 'assets/ui/messages/chat_direct_friend_photo_layout.json',
    chat_group: 'assets/ui/messages/chat_group_layout.json',
    chat_group_friend_photo: 'assets/ui/messages/chat_group_friend_photo_layout.json'
  };

  let native, imgs = {}, layouts = {}, fontReady = false, wired = false;
  let app = null; // {state, view, personId, draftId, menu, banner, incoming, hits}

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('img ' + src));
      im.src = src;
    });
  }
  async function loadJson(src) {
    const r = await fetch(src);
    return r.json();
  }

  async function ensureAssets() {
    if (imgs.sms_flip && fontReady) return;
    const font = new FontFace(
      'FusionPixel8',
      'url(assets/fonts/fusion-pixel-8px-proportional-zh_hant.ttf)'
    );
    const loaded = await font.load();
    document.fonts.add(loaded);
    await document.fonts.load('8px FusionPixel8');
    fontReady = true;
    calibrateFontBaseline();
    const jobs = [];
    for (const [k, src] of Object.entries(ASSET)) jobs.push(loadImage(src).then(im => { imgs[k] = im; }));
    for (const [k, src] of Object.entries(LAYOUT)) jobs.push(loadJson(src).then(j => { layouts[k] = j; }));
    await Promise.all(jobs);
  }

  function slot(layoutName, name) {
    const lay = layouts[layoutName];
    return lay && lay.slots && lay.slots[name];
  }
  function rectOf(layoutName, name) {
    const s = slot(layoutName, name);
    return s && s.rect;
  }
  function labelState(layoutName, label) {
    const lay = layouts[layoutName];
    const list = (lay && lay.section_one_label_states) || [];
    return list.find(s => s.label === label) || null;
  }

  let _measure = null;
  let _mask = null;
  let FONT_BASELINE = -3;
  function calibrateFontBaseline() {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    g.font = '8px FusionPixel8';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffffff';
    const ref = 16;
    g.fillText('國漢選項收件', 0, ref);
    const img = g.getImageData(0, 0, 48, 32);
    let min = 32;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 48; x++) {
        if (img.data[(y * 48 + x) * 4 + 3] >= 128) { min = y; break; }
      }
      if (min !== 32) break;
    }
    FONT_BASELINE = (min === 32) ? -3 : (ref - min);
  }
  function measureCtx() {
    if (_measure) return _measure;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 16;
    _measure = c.getContext('2d');
    _measure.imageSmoothingEnabled = false;
    _measure.font = '8px FusionPixel8';
    return _measure;
  }
  function wrapText(text, maxW) {
    const g = measureCtx();
    g.font = '8px FusionPixel8';
    const chars = Array.from(text || '');
    const lines = [];
    let buf = '';
    for (const ch of chars) {
      const trial = buf + ch;
      if (g.measureText(trial).width > maxW && buf) {
        lines.push(buf);
        buf = ch;
      } else buf = trial;
    }
    if (buf) lines.push(buf);
    return lines.length ? lines : [''];
  }

  function parseColor(color) {
    const c = (color || '#1b1b22').replace('#', '');
    const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Official method: 1-bit mask, baseline at calibrated offset (Pillow uses -3),
  // clipped to the slot, no smoothing.
  function drawPixelText(g, text, rect, color, opts) {
    opts = opts || {};
    if (!rect || text == null) return 0;
    const [x, y, w, h] = rect;
    if (w <= 0 || h <= 0) return 0;
    const maxW = opts.maxW != null ? opts.maxW : w;
    const mc = measureCtx();
    mc.font = '8px FusionPixel8';
    const lines = wrapText(String(text), maxW);
    const maxLines = opts.maxLines || Math.max(1, Math.floor(h / 8));
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines && shown.length) {
      let last = shown[shown.length - 1];
      while (last.length && mc.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      shown[shown.length - 1] = last + '…';
    }
    const pad = 8;
    const mh = h + pad * 2;
    if (!_mask || _mask.width !== w || _mask.height !== mh) {
      _mask = document.createElement('canvas');
      _mask.width = w;
      _mask.height = mh;
    }
    const m = _mask.getContext('2d', { willReadFrequently: true });
    m.imageSmoothingEnabled = false;
    m.clearRect(0, 0, w, mh);
    m.font = '8px FusionPixel8';
    m.textBaseline = 'alphabetic';
    m.textAlign = 'left';
    m.fillStyle = '#ffffff';
    shown.forEach((line, i) => {
      let px = 0;
      const tw = mc.measureText(line).width;
      if (opts.align === 'right') px = Math.max(0, w - tw);
      else if (opts.align === 'center') px = Math.max(0, Math.floor((w - tw) / 2));
      m.fillText(line, px, pad + i * 8 + FONT_BASELINE);
    });
    const img = m.getImageData(0, pad, w, h);
    const d = img.data;
    const [cr, cg, cb] = parseColor(color || '#1b1b22');
    for (let i = 0; i < d.length; i += 4) {
      const on = d[i + 3] >= 128;
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = on ? 255 : 0;
    }
    m.clearRect(0, 0, w, mh);
    m.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(_mask, 0, 0, w, h, x, y, w, h);
    return shown.length;
  }

  function blitNN(g, img, dx, dy, dw, dh) {
    if (!img) return;
    g.imageSmoothingEnabled = false;
    if (dw == null) g.drawImage(img, dx, dy);
    else g.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
  }
  function fillRectWithSample(g, rect) {
    if (!rect) return;
    const [x, y, w, h] = rect;
    const cx = Math.min(NW - 1, Math.max(0, Math.floor(x + w / 2)));
    const cy = Math.min(NH - 1, Math.max(0, Math.floor(y + h / 2)));
    const px = g.getImageData(cx, cy, 1, 1).data;
    g.fillStyle = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')';
    g.fillRect(x, y, w, h);
  }

  function hit(name, rect, data) {
    app.hits.push({ name, rect, data: data || null });
  }
  function hitAt(nx, ny) {
    for (let i = app.hits.length - 1; i >= 0; i--) {
      const [x, y, w, h] = app.hits[i].rect;
      if (nx >= x && ny >= y && nx < x + w && ny < y + h) return app.hits[i];
    }
    return null;
  }

  function uiKind() { return L.messagesUiKind(app.state.phone.gen); }
  function personById(id) { return (app.state.people || []).find(p => p.id === id); }
  function colors(layoutName) {
    return (layouts[layoutName] && layouts[layoutName].text_colours) || { primary: '#1b1b22', secondary: '#47574c' };
  }

  function chromeForView() {
    if (uiKind() === 'sms') return 'sms_flip';
    if (app.view === 'thread' && app.showFriendPhoto) return 'chat_direct_friend_photo';
    return 'chat_direct';
  }

  function startViewForFixture(fixture) {
    switch (fixture) {
      case 'compose':
      case 'nosavings':
        return { view: 'compose', personId: 'friend_qing', draftId: 'out.friend.sms.meal.1', menu: false };
      case 'thread':
        return { view: 'thread', personId: 'friend_qing', draftId: null, menu: false };
      case 'photo':
        return { view: 'thread', personId: 'friend_qing', draftId: null, menu: false, showFriendPhoto: true };
      case 'dead':
        return { view: 'thread', personId: 'mother', draftId: null, menu: false };
      case 'fade':
        return { view: 'thread', personId: 'friend_shu', draftId: null, menu: false };
      case 'incoming':
        return { view: 'thread', personId: 'friend_qing', draftId: null, menu: false, incomingCat: 'invite' };
      default:
        return { view: 'list', personId: null, draftId: null, menu: false };
    }
  }

  function setupFixture(fixture) {
    const start = startViewForFixture(fixture);
    app.view = start.view;
    app.personId = start.personId;
    app.draftId = start.draftId;
    app.menu = start.menu;
    app.showFriendPhoto = !!start.showFriendPhoto;
    app.banner = null;
    app.incoming = null;
    app.listScroll = 0;
    if (fixture === 'compose') app.banner = T.UI.feeHint;
    if (fixture === 'incoming') {
      const pack = L.incomingPack('invite', uiKind(), { personId: 'friend_qing' });
      app.incoming = { category: 'invite', personId: 'friend_qing', pack };
    }
  }

  function openPerson(id, asCompose) {
    app.personId = id;
    app.menu = false;
    app.banner = null;
    app.incoming = null;
    const p = personById(id);
    const dead = L.isPersonDead(app.state, id);
    app.showFriendPhoto = !!(uiKind() === 'chat' && (app.state.messages || []).some(m => m.personId === id && m.effect === 'photo' && m.from === 'other'));
    if (dead) {
      app.view = 'thread';
      app.draftId = null;
      app.banner = L.deadOpener(app.state, p);
      return;
    }
    if (asCompose || uiKind() === 'sms') {
      app.view = uiKind() === 'sms' ? 'compose' : 'thread';
      if (uiKind() === 'sms') {
        const presets = L.outgoingPresets('sms', p.role);
        app.draftId = presets[0] ? presets[0].textId : null;
        app.banner = T.UI.feeHint;
      } else {
        app.draftId = null;
      }
    } else {
      app.view = 'thread';
      app.draftId = null;
      if (L.isFadedFriend(p, app.state)) app.banner = L.fadeOpener(app.state, p, 0);
    }
  }

  function trySend(textId, replyOptionId) {
    const id = textId || app.draftId;
    if (!app.personId || !id) return { ok: false, reason: 'no_draft' };
    const result = L.sendMessage(app.state, {
      personId: app.personId,
      textId: id,
      replyOptionId: replyOptionId || null
    });
    if (result.ok) {
      app.banner = result.message;
      app.draftId = null;
      app.menu = false;
      app.incoming = null;
      if (uiKind() === 'sms') app.view = 'compose';
      else app.view = 'thread';
    } else if (result.reason === 'insufficient') {
      app.banner = result.message;
    } else if (result.reason === 'char_full') {
      app.banner = result.message;
    } else if (result.reason === 'readonly') {
      const p = personById(app.personId);
      app.banner = L.deadOpener(app.state, p);
    }
    return result;
  }

  function openOptions() {
    if (app.incoming) { app.incoming = null; return; }
    if (app.view === 'list') {
      app.menu = app.menu === 'pick' ? false : 'pick';
      return;
    }
    if (L.isPersonDead(app.state, app.personId)) return;
    app.menu = app.menu === 'presets' ? false : 'presets';
  }

  function goBack() {
    if (app.incoming) { app.incoming = null; return; }
    if (app.menu) { app.menu = false; return; }
    if (app.view !== 'list') {
      app.view = 'list';
      app.personId = null;
      app.draftId = null;
      app.banner = null;
      app.showFriendPhoto = false;
    }
  }

  function onTap(nx, ny) {
    const h = hitAt(nx, ny);
    if (!h) return;
    if (h.name === 'soft_left' || h.name === 'options') openOptions();
    else if (h.name === 'soft_right' || h.name === 'back') goBack();
    else if (h.name === 'contact') openPerson(h.data.personId, false);
    else if (h.name === 'compose_new') {
      app.menu = 'pick';
    } else if (h.name === 'pick_person') openPerson(h.data.personId, true);
    else if (h.name === 'preset') {
      app.draftId = h.data.textId;
      app.menu = false;
      if (uiKind() === 'chat') trySend(h.data.textId);
    } else if (h.name === 'send') trySend();
    else if (h.name === 'reply') {
      const r = trySend(h.data.textId, h.data.textId);
      if (r.ok) app.incoming = null;
    } else if (h.name === 'incoming_dismiss') app.incoming = null;
  }

  function draftText() {
    if (!app.draftId) return '';
    const p = personById(app.personId);
    return L.resolveText(app.draftId, L.personVars(app.state, p));
  }

  // ——— views ———
  function drawFlip(g) {
    blitNN(g, imgs.sms_flip, 0, 0);
    const col = colors('sms_flip');
    const pri = col.primary, sec = col.secondary;
    drawPixelText(g, '今天', rectOf('sms_flip', 'time_stamp'), sec, { align: 'center' });
    fillRectWithSample(g, rectOf('sms_flip', 'softkey_left'));
    fillRectWithSample(g, rectOf('sms_flip', 'softkey_right'));
    drawPixelText(g, T.UI.softkeyLeft, rectOf('sms_flip', 'softkey_left'), pri, { align: 'center' });
    drawPixelText(g, T.UI.softkeyRight, rectOf('sms_flip', 'softkey_right'), pri, { align: 'center' });
    hit('soft_left', rectOf('sms_flip', 'softkey_left_box'));
    hit('soft_right', rectOf('sms_flip', 'softkey_right_box'));

    if (app.menu === 'pick') return drawPickMenu(g, 'sms_flip');
    if (app.menu === 'presets') return drawPresetMenu(g, 'sms_flip');
    if (app.incoming) return drawIncoming(g, 'sms_flip');

    if (app.view === 'list') drawFlipList(g, pri, sec);
    else drawFlipCompose(g, pri, sec);
  }

  function drawFlipList(g, pri, sec) {
    // Cover baked input/send so the inbox can use the whole LCD body.
    const lcd = layouts.sms_flip.lcd_rect;
    g.fillStyle = (layouts.sms_flip.lcd_colours && layouts.sms_flip.lcd_colours[2]) || '#b8cd99';
    g.fillRect(lcd[0], 21, lcd[2], lcd[1] + lcd[3] - 21);
    drawPixelText(g, T.UI.listTitle.sms, [24, 21, 46, 8], pri);
    const rows = L.contactList(app.state);
    if (!rows.length) {
      drawPixelText(g, T.UI.emptyList.sms, [24, 29, 46, 16], sec, { maxLines: 2 });
      return;
    }
    const x = 24, width = 46, startY = 29, rowH = 16;
    const maxRows = 3;
    const vis = visibleRows(rows, maxRows);
    vis.forEach((row, i) => {
      const y = startY + i * rowH;
      drawPixelText(g, row.name, [x, y, width, 8], pri, { maxLines: 1 });
      const line = row.faded ? fadeShortTag(row) : (row.lastLine || T.UI.emptyList.sms);
      drawPixelText(g, line, [x, y + 8, width, 8], sec, { maxLines: 1 });
      hit('contact', [x, y, width, rowH], { personId: row.personId });
    });
  }

  function fadeShortTag(row) {
    // Keep her wording, but the 8px stamp is short — use the year/month tail of the time tag.
    // Full label is drawn on the thread and, when space allows, as the list line (§四之三).
    const t = row.fadeTag || '';
    const m = t.match(/是(.+)$/);
    return m ? m[1] : t;
  }

  function drawFlipCompose(g, pri, sec) {
    const p = personById(app.personId);
    const dead = p && L.isPersonDead(app.state, p.id);
    drawPixelText(g, p ? p.name : '', rectOf('sms_flip', 'recipient'), pri);
    const last = p ? L.lastLineText(app.state, p.id) : '';
    if (app.banner && (app.banner === T.UI.insufficientLine || app.banner === T.UI.charFullLine || app.banner === T.UI.sendFailLine)) {
      const lcd = layouts.sms_flip.lcd_rect;
      g.fillStyle = (layouts.sms_flip.lcd_colours && layouts.sms_flip.lcd_colours[2]) || '#b8cd99';
      g.fillRect(24, 23, 48, lcd[1] + lcd[3] - 23);
      drawPixelText(g, p ? p.name : '', [24, 23, 46, 8], pri);
      drawPixelText(g, app.banner, [24, 34, 46, 40], pri, { maxLines: 5 });
      return;
    }
    if (dead) {
      drawPixelText(g, app.banner || L.deadOpener(app.state, p), [24, 34, 46, 32], pri, { maxLines: 4 });
      return;
    }
    const faded = p && L.isFadedFriend(p, app.state);
    if (faded) {
      const days = app.state.day - (L.lastContactDayOf(app.state, p.id) || app.state.day);
      drawPixelText(g, L.fadeTimeTag(days, 'sms'), rectOf('sms_flip', 'message_stamp'), sec, { maxLines: 1 });
    } else {
      drawPixelText(g, T.UI.itemName.sms, rectOf('sms_flip', 'message_stamp'), sec, { align: 'right' });
    }
    if (app.banner === T.UI.feeHint) {
      // 「傳送一則簡訊會扣一筆費用。」13 字 × 8px = 104px。
      // 收件人橫線（y=31）到輸入框頂（y=52）只有 20px；用 48px 寬排成 6+6+1。
      // 前兩行用完整 8px 格；句號上移 1px、高度 5px，避免被輸入框頂線切掉。
      const hintLines = wrapText(T.UI.feeHint, 48);
      drawPixelText(g, hintLines[0] || '', [24, 32, 48, 8], sec, { maxLines: 1 });
      if (hintLines[1]) drawPixelText(g, hintLines[1], [24, 40, 48, 8], sec, { maxLines: 1 });
      if (hintLines[2]) drawPixelText(g, hintLines[2], [24, 47, 48, 5], sec, { maxLines: 1 });
    } else {
      const body = app.banner ? app.banner : (last || T.UI.emptyList.sms);
      drawPixelText(g, body, rectOf('sms_flip', 'message_body'), pri, { maxLines: 2 });
    }
    const draft = draftText();
    drawPixelText(g, draft || (app.banner === T.UI.feeHint ? T.UI.composeNew.sms : ''), rectOf('sms_flip', 'input_field'), pri, { maxLines: 1 });
    const n = L.smsCharCount(draft);
    drawPixelText(g, String(n) + '/' + String(L.SMS_CHAR_LIMIT), [47, 66, 26, 8], sec, { align: 'right' });
    hit('send', rectOf('sms_flip', 'send_button'));
    if (draft) hit('send', rectOf('sms_flip', 'input_field'));
  }

  function drawChat(g) {
    const chrome = chromeForView();
    blitNN(g, imgs[chrome], 0, 0);
    const col = colors(chrome);
    const pri = col.primary, sec = col.secondary;
    drawPixelText(g, '今天', rectOf(chrome, 'time_stamp'), sec, { align: 'center' });

    if (app.menu === 'pick') return drawPickMenu(g, chrome);
    if (app.menu === 'presets') return drawPresetMenu(g, chrome);
    if (app.incoming) return drawIncoming(g, chrome);

    if (app.view === 'list') drawChatList(g, chrome, pri, sec);
    else drawChatThread(g, chrome, pri, sec);
  }

  function drawLabel(g, chrome, label, color) {
    const st = labelState(chrome, label);
    if (!st) return;
    drawPixelText(g, label, st.rect, color || colors(chrome).primary, { maxLines: 1 });
  }

  function drawChatList(g, chrome, pri, sec) {
    drawLabel(g, chrome, T.UI.listTitle.chat, pri);
    const rows = L.contactList(app.state);
    const area = [18, 32, 60, 72];
    if (!rows.length) {
      drawLabel(g, chrome, T.UI.emptyList.chat, sec);
      return;
    }
    const rowH = 16;
    const maxRows = 4;
    const vis = visibleRows(rows, maxRows);
    vis.forEach((row, i) => {
      const y = area[1] + i * rowH;
      const av = imgs[(personById(row.personId) || {}).avatar] || imgs.friend_avatar_1;
      blitNN(g, av, 18, y, 16, 16);
      drawPixelText(g, row.name, [36, y, 42, 8], pri, { maxLines: 1 });
      if (row.faded) {
        // 列表 42px 放不下「上次聊天是三年前」，改用 fadeShortTag「三年前」。畫面不用「變淡」。
        drawPixelText(g, fadeShortTag(row), [36, y + 8, 42, 8], sec, { maxLines: 1 });
      } else {
        drawPixelText(g, row.lastLine || T.UI.emptyList.chat, [36, y + 8, 42, 8], sec, { maxLines: 1 });
      }
      hit('contact', [18, y, 60, rowH], { personId: row.personId });
    });
    drawLabel(g, chrome, T.UI.composeNew.chat, pri);
    const neu = labelState(chrome, T.UI.composeNew.chat);
    if (neu) hit('compose_new', neu.rect);
  }

  function visibleRows(rows, maxRows) {
    if (rows.length <= maxRows) return rows;
    // Prefer keeping a faded contact on-screen for the 變淡 fixture.
    const fadedIdx = rows.findIndex(r => r.faded);
    if (fadedIdx >= maxRows) {
      return rows.slice(0, maxRows - 1).concat(rows[fadedIdx]);
    }
    return rows.slice(0, maxRows);
  }

  function drawChatThread(g, chrome, pri, sec) {
    const p = personById(app.personId);
    if (!p) return;
    const dead = L.isPersonDead(app.state, p.id);
    const faded = L.isFadedFriend(p, app.state);
    const av = imgs[p.avatar] || imgs.friend_avatar_1;
    blitNN(g, av, ...rectOf(chrome, 'header_avatar'));
    drawPixelText(g, p.name, rectOf(chrome, 'header_title'), pri, { maxLines: 1 });
    hit('back', rectOf(chrome, 'header_avatar'));
    hit('back', rectOf(chrome, 'header_title'));
    if (dead) {
      // opener is long; keep the header clean and write the full line below
    } else if (faded) {
      // Full 64px LCD width sits on the conversation stamp row so the 8-glyph tag is not cropped.
    } else if (app.banner === T.UI.feeHint) {
      // 扣費說明佔頭像下方兩行，不並畫「已讀」。
    } else {
      drawLabel(g, chrome, T.UI.readByOther.chat, sec);
    }

    const msgs = (app.state.messages || []).filter(m => m.personId === p.id);
    const lastOther = [...msgs].reverse().find(m => m.from === 'other');
    const lastSelf = [...msgs].reverse().find(m => m.from === 'self');
    const otherText = lastOther ? L.resolveText(lastOther.textId, L.personVars(app.state, p)) : '';
    const selfText = lastSelf ? L.resolveText(lastSelf.textId, L.personVars(app.state, p)) : '';

    if (dead) {
      drawPixelText(g, app.banner || L.deadOpener(app.state, p), [18, 41, 60, 24], pri, { maxLines: 3 });
    } else if (faded) {
      const days = app.state.day - (L.lastContactDayOf(app.state, p.id) || app.state.day);
      drawPixelText(g, L.fadeTimeTag(days, 'chat'), [16, 41, 64, 8], sec, { maxLines: 1 });
    } else if (app.banner === T.UI.feeHint) {
      // 聊天撰寫若帶了扣費說明：60px 寬排成兩行，放在頭像列下方、氣泡上方，不遮頭像。
      drawPixelText(g, T.UI.feeHint, [18, 38, 60, 16], sec, { maxLines: 2 });
    } else if (app.banner) {
      drawPixelText(g, app.banner, rectOf(chrome, 'conversation_stamp'), sec, { maxLines: 1 });
    }

    if (lastOther) {
      blitNN(g, av, ...rectOf(chrome, 'friend_avatar'));
      drawPixelText(g, otherText, rectOf(chrome, 'friend_message'), pri, { maxLines: 2 });
    }
    if (app.showFriendPhoto || (lastOther && lastOther.effect === 'photo')) {
      const bubble = rectOf(chrome, 'photo_bubble');
      if (bubble) blitNN(g, imgs.photo_crop_1, bubble[0], bubble[1], bubble[2], bubble[3]);
      const sav = rectOf(chrome, 'photo_sender_avatar');
      if (sav) blitNN(g, av, ...sav);
    }
    if (lastSelf) {
      drawPixelText(g, selfText, rectOf(chrome, 'your_message'), pri, { maxLines: 1 });
    }

    if (dead) {
      // Cover the baked input/send so a read-only thread cannot look sendable.
      g.fillStyle = '#d8d2c0';
      g.fillRect(16, 118, 64, 12);
    } else {
      const draft = draftText();
      drawPixelText(g, draft || T.UI.itemName.chat, rectOf(chrome, 'input_field'), draft ? pri : sec, { maxLines: 1 });
      hit('send', rectOf(chrome, 'send_button'));
      hit('options', rectOf(chrome, 'input_field'));
    }
  }

  function lcdRect(chrome) {
    return (layouts[chrome] && layouts[chrome].lcd_rect) || [16, 12, 64, 118];
  }

  function drawPickMenu(g, chrome) {
    const lcd = lcdRect(chrome);
    const [x, y, w, h] = lcd;
    fillLcd(g, chrome, x, y, w, h);
    const pri = colors(chrome).primary, sec = colors(chrome).secondary;
    drawPixelText(g, T.UI.composeNew[uiKind() === 'sms' ? 'sms' : 'chat'], [x + 2, y + 2, w - 4, 8], pri);
    const rows = (app.state.people || []).filter(p => !L.isPersonDead(app.state, p.id));
    rows.forEach((p, i) => {
      const ry = y + 12 + i * 10;
      drawPixelText(g, p.name, [x + 2, ry, w - 4, 8], pri, { maxLines: 1 });
      hit('pick_person', [x, ry, w, 10], { personId: p.id });
    });
    if (uiKind() === 'sms') {
      drawPixelText(g, T.UI.softkeyLeft, rectOf('sms_flip', 'softkey_left'), pri, { align: 'center' });
      drawPixelText(g, T.UI.softkeyRight, rectOf('sms_flip', 'softkey_right'), pri, { align: 'center' });
      hit('soft_left', rectOf('sms_flip', 'softkey_left_box'));
      hit('soft_right', rectOf('sms_flip', 'softkey_right_box'));
    }
  }

  function drawPresetMenu(g, chrome) {
    const lcd = lcdRect(chrome);
    const [x, y, w, h] = lcd;
    fillLcd(g, chrome, x, y, w, h);
    const pri = colors(chrome).primary;
    const p = personById(app.personId);
    const presets = L.outgoingPresets(uiKind(), p ? p.role : 'friend').slice(0, 5);
    drawPixelText(g, T.UI.composeNew[uiKind() === 'sms' ? 'sms' : 'chat'], [x + 2, y + 2, w - 4, 8], pri);
    presets.forEach((pr, i) => {
      const ry = y + 12 + i * 10;
      const text = T.fillTemplate(pr.text, L.personVars(app.state, p));
      drawPixelText(g, text, [x + 2, ry, w - 4, 8], pri, { maxLines: 1 });
      hit('preset', [x, ry, w, 10], { textId: pr.textId });
    });
    if (uiKind() === 'sms') {
      drawPixelText(g, T.UI.softkeyLeft, rectOf('sms_flip', 'softkey_left'), pri, { align: 'center' });
      drawPixelText(g, T.UI.softkeyRight, rectOf('sms_flip', 'softkey_right'), pri, { align: 'center' });
      hit('soft_left', rectOf('sms_flip', 'softkey_left_box'));
      hit('soft_right', rectOf('sms_flip', 'softkey_right_box'));
    }
  }

  function drawIncoming(g, chrome) {
    const lcd = lcdRect(chrome);
    const [x, y, w, h] = lcd;
    fillLcd(g, chrome, x, y, w, h);
    const pri = colors(chrome).primary, sec = colors(chrome).secondary;
    const pack = app.incoming.pack;
    const p = personById(app.incoming.personId);
    const body = T.fillTemplate(pack.text, L.personVars(app.state, p));
    const faded = p && L.isFadedFriend(p, app.state);
    if (faded) {
      const days = app.state.day - (L.lastContactDayOf(app.state, p.id) || app.state.day);
      drawPixelText(g, L.fadeTimeTag(days, uiKind()), [x + 2, y + 2, w - 4, 8], sec, { maxLines: 1 });
      drawPixelText(g, body, [x + 2, y + 12, w - 4, 24], pri, { maxLines: 3 });
    } else {
      drawPixelText(g, body, [x + 2, y + 2, w - 4, 32], pri, { maxLines: 4 });
    }
    const replies = pack.replies || [];
    const ry0 = y + (uiKind() === 'sms' ? 36 : 56);
    replies.forEach((r, i) => {
      const ry = ry0 + i * 10;
      drawPixelText(g, r.text, [x + 2, ry, w - 4, 8], pri, { maxLines: 1 });
      hit('reply', [x, ry, w, 10], { textId: r.textId });
    });
    if (uiKind() === 'sms') {
      drawPixelText(g, T.UI.softkeyLeft, rectOf('sms_flip', 'softkey_left'), pri, { align: 'center' });
      drawPixelText(g, T.UI.softkeyRight, rectOf('sms_flip', 'softkey_right'), pri, { align: 'center' });
      hit('soft_left', rectOf('sms_flip', 'softkey_left_box'));
      hit('soft_right', rectOf('sms_flip', 'softkey_right_box'));
    }
  }

  function fillLcd(g, chrome, x, y, w, h) {
    // Cover existing LCD pixels with the palest LCD colour (flip) or a dark inbox fill (chat)
    // so a menu can be read. Do not recolor the chrome around the LCD.
    if (chrome === 'sms_flip') {
      const pal = layouts.sms_flip.lcd_colours;
      g.fillStyle = pal && pal[2] ? pal[2] : '#b8cd99';
    } else {
      g.fillStyle = '#d8d2c0';
    }
    g.fillRect(x, y, w, h);
  }

  function drawNative(g) {
    app.hits = [];
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, NW, NH);
    if (uiKind() === 'sms') drawFlip(g);
    else drawChat(g);
  }

  function paintTo(display) {
    if (!native || !app) return;
    const ng = native.getContext('2d', { willReadFrequently: true });
    ng.imageSmoothingEnabled = false;
    drawNative(ng);
    const dg = display;
    dg.imageSmoothingEnabled = false;
    if (dg.imageSmoothingQuality) dg.imageSmoothingQuality = 'low';
    dg.clearRect(0, 0, display.canvas.width, display.canvas.height);
    const scale = Math.floor(display.canvas.width / NW);
    const dw = NW * scale, dh = NH * scale;
    const ox = Math.floor((display.canvas.width - dw) / 2);
    const oy = Math.floor((display.canvas.height - dh) / 2);
    dg.drawImage(native, 0, 0, NW, NH, ox, oy, dw, dh);
    app._scale = scale;
    app._origin = [ox, oy];
  }

  function prepareCanvas() {
    const phone = document.getElementById('phone');
    if (phone) phone.classList.add('messages');
    const c = document.getElementById('sceneP');
    if (c) {
      c.width = NW * SCALE;
      c.height = NH * SCALE;
    }
    native = document.createElement('canvas');
    native.width = NW;
    native.height = NH;
  }

  function parseQuery() {
    const qs = new URLSearchParams(location.search);
    const fixture = qs.get('fixture') || 'list';
    const gen = qs.get('gen') || qs.get('phone') || null;
    const savings = qs.get('savings');
    return {
      fixture,
      overrides: {
        gen: gen || undefined,
        savingsUsd: savings != null && savings !== '' ? Number(savings) : undefined
      }
    };
  }

  async function initMessages() {
    await ensureAssets();
    prepareCanvas();
    const q = parseQuery();
    const state = L.makeSampleState(q.fixture, q.overrides);
    app = {
      state, fixture: q.fixture, view: 'list', personId: null, draftId: null,
      menu: false, banner: null, incoming: null, showFriendPhoto: false,
      listScroll: 0, hits: [], ready: true
    };
    setupFixture(q.fixture);
    wire();
    root.MESSAGES = {
      app,
      ready: true,
      fontBaseline: FONT_BASELINE,
      trySend,
      openPerson,
      goBack,
      openOptions,
      paint: function () {
        const c = document.getElementById('sceneP');
        if (c) paintTo(c.getContext('2d'));
      },
      state: () => app.state
    };
    document.body.dataset.ready = 'messages';
  }

  function wire() {
    if (wired) return;
    wired = true;
    const c = document.getElementById('sceneP');
    if (!c) return;
    const toNative = (e) => {
      const r = c.getBoundingClientRect();
      const scale = app && app._scale ? app._scale : SCALE;
      const origin = (app && app._origin) || [0, 0];
      const cssScaleX = r.width / c.width;
      const cssScaleY = r.height / c.height;
      const px = (e.clientX - r.left) / cssScaleX;
      const py = (e.clientY - r.top) / cssScaleY;
      const nx = Math.floor((px - origin[0]) / scale);
      const ny = Math.floor((py - origin[1]) / scale);
      return [nx, ny];
    };
    c.addEventListener('pointerdown', (e) => {
      if (!app) return;
      const [nx, ny] = toNative(e);
      onTap(nx, ny);
    });
  }

  function drawMessagesTo(g) {
    if (!app || !native) return;
    paintTo(g);
  }

  root.initMessages = initMessages;
  root.drawMessagesTo = drawMessagesTo;
  root.MESSAGES_SCALE = SCALE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
