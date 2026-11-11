// Messages app sample logic. No DOM. Uses existing state keys only.
(function (root) {
  const T = (typeof module === 'object' && module.exports)
    ? require('./messages_text.js')
    : root.MessagesText;

  const SMS_FEE_USD = 1; // 每則 1 點：送出時計入本月待結，月結時才從存款扣一次
  const SMS_CHAR_LIMIT = 70; // 公主：約七十字，暫定
  const FRIEND_FADE_DAYS = 365; // 狀態鍵表：朋友 365 天少聯絡 → 變淡
  const CLOSENESS_DELTA = 0.02; // 傳送後輕觸 closeness（若該人已有此鍵）
  const DAY = 1;
  const MONTH = 30;
  const YEAR = 365;

  function messagesUiKind(gen) {
    return gen === 'flip' ? 'sms' : 'chat'; // smart, thin → chat
  }

  function chineseNumeral(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return '零';
    // Time tags in her text use 兩, not 二.
    const digits = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return digits[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + (n === 12 ? '二' : digits[n - 10]);
    if (n < 100) {
      const ones = n % 10;
      const tens = Math.floor(n / 10);
      const tensWord = tens === 2 ? '二十' : (tens === 1 ? '十' : digits[tens] + '十');
      return ones ? tensWord + (ones === 2 ? '二' : digits[ones]) : tensWord;
    }
    return String(n);
  }

  // 畫面可見時間標籤（公主 §四）；翻蓋機把「聊天」改成「傳訊」。
  function fadeTimeTag(daysSince, uiKind) {
    const verb = uiKind === 'sms' ? '傳訊' : '聊天';
    const d = Math.max(0, Math.floor(Number(daysSince) || 0));
    let when;
    if (d < MONTH) when = '這個月';
    else if (d < MONTH * 2) when = '一個月前';
    else if (d < MONTH * 3) when = '兩個月前';
    else if (d < MONTH * 6) when = '三個月前';
    else if (d < YEAR) when = '半年前';
    else if (d < YEAR * 2) when = '一年前';
    else if (d < YEAR * 3) when = '兩年前';
    else if (d < YEAR * 5) when = '三年前';
    else if (d < YEAR * 10) when = '五年前';
    else if (d < YEAR * 11) when = '十年前';
    else when = '十多年前';
    return '上次' + verb + '是' + when;
  }

  function yearsSinceLabel(daysSince) {
    const y = Math.floor(Math.max(0, Number(daysSince) || 0) / YEAR);
    return chineseNumeral(Math.max(1, y));
  }

  function isFadedFriend(person, state) {
    if (!person || person.role !== 'friend') return false;
    const last = lastContactDayOf(state, person.id);
    if (last == null) return false;
    return (state.day - last) >= FRIEND_FADE_DAYS;
  }

  function lastContactDayOf(state, personId) {
    const p = state.relationships && state.relationships.people && state.relationships.people[personId];
    if (p && p.lastContactDay != null) return p.lastContactDay;
    const last = latestMessage(state.messages, personId);
    return last ? last.day : null;
  }

  function latestMessage(messages, personId) {
    const list = (messages || []).filter(m => m.personId === personId);
    if (!list.length) return null;
    let best = list[0];
    for (let i = 1; i < list.length; i++) {
      const m = list[i];
      if (m.day > best.day) best = m;
      else if (m.day === best.day) best = m; // same day: later in the array wins
    }
    return best;
  }

  function isPersonDead(state, personId) {
    const parents = state.parents || {};
    const mother = parents.mother || {};
    const father = parents.father || {};
    if (personId === 'mother' || personId === mother.personId) return mother.alive === false;
    if (personId === 'father' || personId === father.personId) return father.alive === false;
    return false;
  }

  function personVars(state, person) {
    const mother = (state.parents && state.parents.mother && state.parents.mother.name) || '媽';
    const father = (state.parents && state.parents.father && state.parents.father.name) || '爸';
    const friendName = person && person.role === 'friend' ? person.name : friendNameOf(state);
    const exName = person && person.role === 'ex' ? person.name : exNameOf(state);
    const other = person ? person.name : '';
    return {
      '稱呼.母親': mother,
      '稱呼.父親': father,
      '朋友.名': friendName,
      '前任.名': exName,
      '對方.名': other,
      'self_name': state.selfName || '你'
    };
  }

  function friendNameOf(state) {
    const people = (state.people || []).filter(p => p.role === 'friend');
    return people.length ? people[0].name : '';
  }
  function exNameOf(state) {
    const p = (state.people || []).find(x => x.role === 'ex');
    return p ? p.name : '';
  }

  function resolveText(textId, vars) {
    const tmpl = T.TEXTS[textId];
    if (tmpl == null) return '';
    return T.fillTemplate(tmpl, vars || {});
  }

  function lastLineText(state, personId) {
    const msg = latestMessage(state.messages, personId);
    if (!msg) return '';
    const person = (state.people || []).find(p => p.id === personId);
    return resolveText(msg.textId, personVars(state, person));
  }

  function fadeListLine(state, person) {
    const last = lastLineText(state, person.id);
    const days = state.day - (lastContactDayOf(state, person.id) || state.day);
    const vars = Object.assign(personVars(state, person), {
      '最後一句': last,
      '年數': yearsSinceLabel(days)
    });
    return T.fillTemplate(T.FADE_LIST_LINE, vars);
  }

  function deadOpener(state, person) {
    const last = lastLineText(state, person.id);
    const vars = Object.assign(personVars(state, person), { '最後一句': last });
    if (last && (person.id === 'mother' || person.id === 'father')) {
      return T.fillTemplate(T.DEAD_OPENER_WITH_LAST[person.id], vars);
    }
    // fallback: one of the five set lines, prefer the matching parent backup if no last line
    if (person.id === 'father') return T.fillTemplate(T.DEAD_OPENERS[0], vars);
    if (person.id === 'mother') return T.fillTemplate(T.DEAD_OPENERS[1], vars);
    return T.fillTemplate(T.DEAD_OPENERS[2], vars);
  }

  function fadeOpener(state, person, index) {
    const last = lastLineText(state, person.id);
    const days = state.day - (lastContactDayOf(state, person.id) || state.day);
    const vars = Object.assign(personVars(state, person), {
      '最後一句': last,
      '年數': yearsSinceLabel(days)
    });
    const i = Math.max(0, Math.min(T.FADE_OPENERS.length - 1, index == null ? 0 : index));
    return T.fillTemplate(T.FADE_OPENERS[i], vars);
  }

  function outgoingPresets(uiKind, role) {
    const r = role === 'family' || role === 'ex' ? role : 'friend';
    const ch = uiKind === 'sms' ? 'sms' : 'chat';
    const ids = Object.keys(T.OUT).filter(id => id.indexOf('out.' + r + '.' + ch + '.') === 0);
    return ids.map(textId => ({ textId, text: T.OUT[textId] }));
  }

  function incomingPack(category, uiKind, opts) {
    const cat = T.INCOMING[category];
    if (!cat) return null;
    opts = opts || {};
    if (category === 'birthday' && (opts.role === 'family' || opts.personId === 'mother' || opts.personId === 'father')) {
      return uiKind === 'sms' ? cat.familySms : cat.familyChat;
    }
    if (category === 'elders_morning') {
      const who = opts.personId === 'father' ? 'father' : 'mother';
      if (uiKind === 'sms') return who === 'father' ? cat.smsFather : cat.smsMother;
      if (who === 'father') return cat.chatFatherTea;
      return opts.variant === 'flower' ? cat.chatMotherFlower : cat.chatMotherSun;
    }
    return uiKind === 'sms' ? cat.sms : cat.chat;
  }

  function contactList(state) {
    const people = state.people || [];
    const uiKind = messagesUiKind(state.phone && state.phone.gen);
    return people.map(person => {
      const last = latestMessage(state.messages, person.id);
      const lastDay = lastContactDayOf(state, person.id);
      const days = lastDay == null ? 0 : state.day - lastDay;
      const faded = isFadedFriend(person, state);
      return {
        personId: person.id,
        name: person.name,
        role: person.role,
        lastLine: last ? resolveText(last.textId, personVars(state, person)) : '',
        lastDay,
        faded,
        fadeTag: faded ? fadeTimeTag(days, uiKind) : '',
        fadeListLine: faded ? fadeListLine(state, person) : '',
        dead: isPersonDead(state, person.id),
        unread: !!(last && last.from === 'other' && last.unread)
      };
    });
  }

  function canCompose(state, personId) {
    if (isPersonDead(state, personId)) return { ok: false, reason: 'readonly' };
    return { ok: true };
  }

  function smsCharCount(text) {
    return Array.from(text || '').length;
  }


  // 狀態鍵表第 200 列 phone.bill.smsPendingUsd：
  // 本月已送出簡訊的累計費用，月結從存款扣一次後歸 0。
  // 樣本直接寫在 state.phone.bill.smsPendingUsd，正式接鍵時不必再改名。
  function smsPendingUsd(state) {
    const bill = state.phone && state.phone.bill;
    return Number(bill && bill.smsPendingUsd) || 0;
  }

  function setSmsPendingUsd(state, value) {
    state.phone = state.phone || {};
    state.phone.bill = state.phone.bill || {};
    state.phone.bill.smsPendingUsd = value;
    return value;
  }

  function sendMessage(state, opts) {
    opts = opts || {};
    const personId = opts.personId;
    const textId = opts.textId;
    const uiKind = messagesUiKind(state.phone && state.phone.gen);
    const kind = opts.kind || (uiKind === 'sms' ? 'sms' : 'chat');

    if (isPersonDead(state, personId)) {
      return { ok: false, reason: 'readonly' };
    }
    const text = resolveText(textId, personVars(state, (state.people || []).find(p => p.id === personId)));
    if (uiKind === 'sms') {  // 只有翻蓋機簡訊扣存款
      if (smsCharCount(text) > SMS_CHAR_LIMIT) {
        return { ok: false, reason: 'char_full', message: T.UI.charFullLine };
      }
      const savings = Number(state.savingsUsd);
      const pending = smsPendingUsd(state);
      // 可支用額 = 存款 − 本月已待結簡訊費。不夠則用公主「存款不足」句，不送出、不記帳。
      if (!((savings - pending) >= SMS_FEE_USD)) {
        return { ok: false, reason: 'insufficient', message: T.UI.insufficientLine };
      }
      setSmsPendingUsd(state, pending + SMS_FEE_USD);
    }
    if (!state.messages) state.messages = [];
    state.messages.push({
      personId,
      day: state.day,
      from: 'self',
      textId,
      replyOptionId: opts.replyOptionId != null ? opts.replyOptionId : null,
      effect: 'contact'
    });
    bumpRelationship(state, personId);
    return {
      ok: true,
      message: uiKind === 'sms' ? T.UI.sentOkLine.sms : T.UI.sentOkLine.chat,
      savingsUsd: state.savingsUsd
    };
  }

  function receiveIncoming(state, category, personId, packOpts) {
    const uiKind = messagesUiKind(state.phone && state.phone.gen);
    const pack = incomingPack(category, uiKind, Object.assign({ personId }, packOpts));
    if (!pack) return { ok: false, reason: 'unknown_category' };
    if (isPersonDead(state, personId)) return { ok: false, reason: 'readonly' };
    if (!state.messages) state.messages = [];
    state.messages.push({
      personId,
      day: state.day,
      from: 'other',
      textId: pack.textId,
      replyOptionId: null,
      effect: pack.hasPhoto ? 'photo' : null,
      unread: true
    });
    bumpRelationship(state, personId, { closeness: false });
    return { ok: true, pack, category };
  }

  function replyIncoming(state, pack, replyIndex, personId) {
    const reply = pack && pack.replies && pack.replies[replyIndex];
    if (!reply) return { ok: false, reason: 'no_reply' };
    return sendMessage(state, {
      personId,
      textId: reply.textId,
      replyOptionId: reply.textId
    });
  }

  function bumpRelationship(state, personId, opts) {
    opts = opts || {};
    state.relationships = state.relationships || { people: {} };
    state.relationships.people = state.relationships.people || {};
    const rec = state.relationships.people[personId] || {};
    rec.role = rec.role || ((state.people || []).find(p => p.id === personId) || {}).role;
    rec.lastContactDay = state.day;
    // closeness is registered (暫定) but may be absent at runtime. Only touch it if already present, or if the sample supplied it.
    if (opts.closeness !== false && typeof rec.closeness === 'number') {
      rec.closeness = Math.max(0, Math.min(1, rec.closeness + CLOSENESS_DELTA));
    }
    state.relationships.people[personId] = rec;
  }

  // 月結：把本月簡訊費從存款扣一次，並將 phone.bill.smsPendingUsd 歸 0（鍵表第 200 列）。
  function settleMonth(state) {
    const pending = smsPendingUsd(state);
    const savings = Number(state.savingsUsd) || 0;
    state.savingsUsd = savings - pending;
    setSmsPendingUsd(state, 0);
    return {
      addedUsd: pending,
      billSmsUsd: pending,
      savingsUsd: state.savingsUsd
    };
  }

  function defaultPeople() {
    return [
      { id: 'mother', name: '媽', role: 'family', avatar: 'friend_avatar_1' },
      { id: 'father', name: '爸', role: 'family', avatar: 'friend_avatar_2' },
      { id: 'friend_qing', name: '阿青', role: 'friend', avatar: 'friend_avatar_1' },
      { id: 'friend_shu', name: '小樹', role: 'friend', avatar: 'friend_avatar_2' },
      { id: 'ex_lin', name: '阿林', role: 'ex', avatar: 'friend_avatar_1' }
    ];
  }

  // day 6574 ≈ 出生於 2000-01-01 後第 18 年正月（2018）；flip 樣本改用較早的一天。
  function makeSampleState(fixture, overrides) {
    const TODAY = 6574;
    const FADE_DAY = TODAY - (YEAR * 3) - 20; // 三年前
    const recent = TODAY - 2;
    const people = defaultPeople();
    const state = {
      day: TODAY,
      selfName: '小安',
      phone: { owned: true, gen: 'smart', bill: { smsPendingUsd: 0 } },
      savingsUsd: 40,
      messages: [
        { personId: 'mother', day: recent, from: 'other', textId: 'hist.mother.other.eat', replyOptionId: null, effect: null },
        { personId: 'father', day: recent - 1, from: 'other', textId: 'hist.father.other.home', replyOptionId: null, effect: null },
        { personId: 'friend_qing', day: recent, from: 'other', textId: 'hist.qing.other.invite', replyOptionId: null, effect: null },
        { personId: 'friend_shu', day: FADE_DAY, from: 'other', textId: 'hist.shu.other.photo', replyOptionId: null, effect: null },
        { personId: 'ex_lin', day: TODAY - 40, from: 'self', textId: 'out.ex.sms.hi.1', replyOptionId: null, effect: 'contact' }
      ],
      people,
      relationships: {
        people: {
          mother: { role: 'family', lastContactDay: recent, closeness: 0.8 },
          father: { role: 'family', lastContactDay: recent - 1, closeness: 0.7 },
          friend_qing: { role: 'friend', lastContactDay: recent, closeness: 0.6 },
          friend_shu: { role: 'friend', lastContactDay: FADE_DAY, closeness: 0.25 },
          ex_lin: { role: 'ex', lastContactDay: TODAY - 40, closeness: 0.2 }
        }
      },
      parents: {
        mother: { alive: true, deathAge: null, personId: 'mother', name: '媽' },
        father: { alive: true, deathAge: null, personId: 'father', name: '爸' }
      }
      // phone.bill.smsPendingUsd 見上；樣本不再另放 _sample 待結欄，以免雙邊記帳。
    };

    fixture = fixture || 'list';
    if (fixture === 'list' || fixture === 'compose') {
      state.phone.gen = 'flip';
      state.day = 3650;
      // keep relative last-contact offsets
      const delta = TODAY - state.day;
      state.messages.forEach(m => { m.day -= delta; });
      Object.values(state.relationships.people).forEach(p => { p.lastContactDay -= delta; });
    }
    if (fixture === 'compose') {
      state.phone.gen = 'flip';
    }
    if (fixture === 'thread' || fixture === 'photo' || fixture === 'incoming') {
      state.phone.gen = 'smart';
    }
    if (fixture === 'photo') {
      receiveIncoming(state, 'child_birth', 'friend_qing');
    }
    if (fixture === 'nosavings') {
      state.phone.gen = 'flip';
      state.savingsUsd = 0;
    }
    if (fixture === 'dead') {
      state.phone.gen = 'smart';
      state.parents.mother.alive = false;
      state.parents.mother.deathAge = 48;
    }
    if (fixture === 'fade') {
      state.phone.gen = 'smart';
    }
    if (overrides) {
      if (overrides.gen) state.phone.gen = overrides.gen;
      if (overrides.savingsUsd != null) state.savingsUsd = overrides.savingsUsd;
      if (overrides.day != null) state.day = overrides.day;
    }
    return state;
  }

  // 電話費待結已接狀態鍵表第 200 列 phone.bill.smsPendingUsd，不再列為缺鍵。
  const MISSING_KEYS = [];

  const api = {
    SMS_FEE_USD, SMS_CHAR_LIMIT, FRIEND_FADE_DAYS, CLOSENESS_DELTA,
    messagesUiKind, chineseNumeral, fadeTimeTag, yearsSinceLabel,
    isFadedFriend, lastContactDayOf, latestMessage, isPersonDead,
    personVars, resolveText, lastLineText, fadeListLine, deadOpener, fadeOpener,
    outgoingPresets, incomingPack, contactList, canCompose, smsCharCount,
    sendMessage, receiveIncoming, replyIncoming, bumpRelationship, settleMonth,
    defaultPeople, makeSampleState, MISSING_KEYS, smsPendingUsd, setSmsPendingUsd
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MessagesLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
