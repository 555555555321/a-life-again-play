#!/usr/bin/env node
// Messages app logic: flip vs smart, SMS fee, dead read-only, fading, last line from messages[].
const assert = require('assert');
const L = require('../messages_logic.js');
const T = require('../messages_text.js');

function pass(name) { console.log('PASS', name); }

// —— flip vs smart / thin ——
assert.strictEqual(L.messagesUiKind('flip'), 'sms');
assert.strictEqual(L.messagesUiKind('smart'), 'chat');
assert.strictEqual(L.messagesUiKind('thin'), 'chat');
pass('phone.gen flip → SMS, smart/thin → chat');

// —— last line comes from messages[] (newest for that personId) ——
{
  const state = L.makeSampleState('thread');
  state.messages = [
    { personId: 'friend_qing', day: 10, from: 'other', textId: 'out.friend.sms.hi.1', replyOptionId: null, effect: null },
    { personId: 'friend_qing', day: 20, from: 'self', textId: 'out.friend.sms.meal.1', replyOptionId: null, effect: 'contact' },
    { personId: 'friend_qing', day: 20, from: 'other', textId: 'hist.qing.other.invite', replyOptionId: null, effect: null },
    { personId: 'mother', day: 99, from: 'other', textId: 'hist.mother.other.eat', replyOptionId: null, effect: null }
  ];
  const last = L.latestMessage(state.messages, 'friend_qing');
  assert.strictEqual(last.textId, 'hist.qing.other.invite', 'same-day later entry wins');
  assert.strictEqual(L.lastLineText(state, 'friend_qing'), '這週六晚上吃飯，來嗎？');
  assert.strictEqual(L.lastLineText(state, 'mother'), '吃飯了嗎');
  const row = L.contactList(state).find(r => r.personId === 'friend_qing');
  assert.strictEqual(row.lastLine, '這週六晚上吃飯，來嗎？');
  pass('last line is newest messages[] entry for that personId');
}

// —— SMS fee deducted from savingsUsd; insufficient does not send ——
{
  const state = L.makeSampleState('compose');
  assert.strictEqual(L.messagesUiKind(state.phone.gen), 'sms');
  state.savingsUsd = 3;
  const before = state.messages.length;
  const r1 = L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.meal.1' });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(state.savingsUsd, 2);
  assert.strictEqual(state._sample.pendingSmsFeesUsd, 1);
  assert.strictEqual(state.messages.length, before + 1);
  assert.strictEqual(state.messages[state.messages.length - 1].from, 'self');
  assert.strictEqual(state.messages[state.messages.length - 1].textId, 'out.friend.sms.meal.1');
  const r2 = L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.hi.1' });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(state.savingsUsd, 1);
  const r3 = L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.drive.1' });
  assert.strictEqual(r3.ok, true);
  assert.strictEqual(state.savingsUsd, 0);
  const n = state.messages.length;
  const fail = L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.hi.2' });
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.reason, 'insufficient');
  assert.strictEqual(fail.message, '存款不足，這則簡訊沒有送出。');
  assert.strictEqual(state.savingsUsd, 0, 'savings unchanged on failure');
  assert.strictEqual(state.messages.length, n, 'no message written on failure');
  assert.strictEqual(state._sample.pendingSmsFeesUsd, 3);
  pass('SMS fee 1 from savings; insufficient shows 公主 wording and does not send');
}

// chat (smart / thin) does not charge
{
  const smart = L.makeSampleState('thread');
  assert.strictEqual(smart.phone.gen, 'smart');
  const sav = smart.savingsUsd;
  const r = L.sendMessage(smart, { personId: 'friend_qing', textId: 'out.friend.chat.meal.1' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(smart.savingsUsd, sav);
  const thin = L.makeSampleState('thread', { gen: 'thin' });
  assert.strictEqual(L.messagesUiKind(thin.phone.gen), 'chat');
  const sav2 = thin.savingsUsd;
  assert.strictEqual(L.sendMessage(thin, { personId: 'friend_qing', textId: 'out.friend.chat.hi.1' }).ok, true);
  assert.strictEqual(thin.savingsUsd, sav2);
  pass('smart and thin chat sends do not deduct savings');
}

// monthly settlement parks fees in the sample bag (no official bill key)
{
  const state = L.makeSampleState('compose');
  state.savingsUsd = 5;
  L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.hi.1' });
  L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.sms.hi.2' });
  const settled = L.settleMonth(state);
  assert.strictEqual(settled.addedUsd, 2);
  assert.strictEqual(settled.billSmsUsd, 2);
  assert.strictEqual(state._sample.pendingSmsFeesUsd, 0);
  assert.ok(settled.missingKey.indexOf('phone.bill') !== -1);
  pass('settleMonth moves pending SMS fees into the sample bill bag');
}

// —— dead relative is read-only (parents.*.alive, no new key) ——
{
  const state = L.makeSampleState('dead');
  assert.strictEqual(state.parents.mother.alive, false);
  assert.strictEqual(L.isPersonDead(state, 'mother'), true);
  assert.strictEqual(L.isPersonDead(state, 'father'), false);
  const n = state.messages.length;
  const sav = state.savingsUsd;
  const r = L.sendMessage(state, { personId: 'mother', textId: 'out.family.chat.hi.1' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'readonly');
  assert.strictEqual(state.messages.length, n);
  assert.strictEqual(state.savingsUsd, sav);
  const opener = L.deadOpener(state, state.people.find(p => p.id === 'mother'));
  assert.strictEqual(opener, '對話停在媽那句『吃飯了嗎』。');
  // father still writable
  assert.strictEqual(L.sendMessage(state, { personId: 'father', textId: 'out.family.chat.meal.2' }).ok, true);
  pass('dead relative (alive=false) is read-only; opener uses last messages[] line');
}

// —— fading friends: lastContactDay vs day, 公主 time tags ——
{
  const state = L.makeSampleState('fade');
  const shu = state.people.find(p => p.id === 'friend_shu');
  assert.strictEqual(L.isFadedFriend(shu, state), true);
  const qing = state.people.find(p => p.id === 'friend_qing');
  assert.strictEqual(L.isFadedFriend(qing, state), false);
  const days = state.day - state.relationships.people.friend_shu.lastContactDay;
  assert.ok(days >= 365 * 3);
  assert.strictEqual(L.fadeTimeTag(days, 'chat'), '上次聊天是三年前');
  assert.strictEqual(L.fadeTimeTag(days, 'sms'), '上次傳訊是三年前');
  const row = L.contactList(state).find(r => r.personId === 'friend_shu');
  assert.strictEqual(row.faded, true);
  assert.strictEqual(row.fadeTag, '上次聊天是三年前');
  assert.ok(row.fadeListLine.indexOf('小樹') !== -1);
  assert.ok(row.fadeListLine.indexOf('三年前') !== -1);
  assert.ok(row.fadeListLine.indexOf('還找得到你') !== -1);
  assert.strictEqual(L.fadeTimeTag(10, 'chat'), '上次聊天是這個月');
  assert.strictEqual(L.fadeTimeTag(35, 'chat'), '上次聊天是一個月前');
  assert.strictEqual(L.fadeTimeTag(70, 'chat'), '上次聊天是兩個月前');
  assert.strictEqual(L.fadeTimeTag(100, 'chat'), '上次聊天是三個月前');
  assert.strictEqual(L.fadeTimeTag(200, 'chat'), '上次聊天是半年前');
  assert.strictEqual(L.fadeTimeTag(400, 'chat'), '上次聊天是一年前');
  assert.strictEqual(L.fadeTimeTag(800, 'chat'), '上次聊天是兩年前');
  assert.strictEqual(L.fadeTimeTag(2000, 'chat'), '上次聊天是五年前');
  assert.strictEqual(L.fadeTimeTag(3650, 'chat'), '上次聊天是十年前');
  assert.strictEqual(L.fadeTimeTag(5000, 'chat'), '上次聊天是十多年前');
  pass('faded friend uses lastContactDay and 公主 time-tag wording');
}

// sending bumps lastContactDay and closeness when the key already exists
{
  const state = L.makeSampleState('thread');
  const before = state.relationships.people.friend_qing.closeness;
  const last = state.relationships.people.friend_qing.lastContactDay;
  state.day = last + 3;
  L.sendMessage(state, { personId: 'friend_qing', textId: 'out.friend.chat.hi.1' });
  assert.strictEqual(state.relationships.people.friend_qing.lastContactDay, state.day);
  assert.ok(Math.abs(state.relationships.people.friend_qing.closeness - (before + L.CLOSENESS_DELTA)) < 1e-12);
  // no closeness on a bare person: only lastContactDay is written
  delete state.relationships.people.ex_lin.closeness;
  L.sendMessage(state, { personId: 'ex_lin', textId: 'out.ex.chat.hi.1' });
  assert.strictEqual(state.relationships.people.ex_lin.lastContactDay, state.day);
  assert.strictEqual(state.relationships.people.ex_lin.closeness, undefined);
  pass('send updates lastContactDay; closeness only if already present');
}

// —— 7 incoming categories, each with 3 replies, verbatim ——
{
  const expected = {
    invite: 3, longlost: 3, birthday: 3, wedding: 3,
    death_notice: 3, child_birth: 3, elders_morning: 3
  };
  assert.deepStrictEqual(T.INCOMING_CATEGORIES, Object.keys(expected));
  for (const cat of T.INCOMING_CATEGORIES) {
    for (const kind of ['sms', 'chat']) {
      const pack = L.incomingPack(cat, kind, { personId: cat === 'elders_morning' ? 'mother' : 'friend_qing' });
      assert.ok(pack, cat + ' ' + kind);
      assert.strictEqual(pack.replies.length, 3, cat + ' ' + kind + ' replies');
      assert.ok(pack.text && pack.text.length > 0);
      for (const r of pack.replies) {
        assert.strictEqual(T.TEXTS[r.textId], r.text);
        assert.ok(r.text.length > 0);
      }
    }
  }
  // child-birth chat is the photo one; flip stays text-only
  assert.strictEqual(L.incomingPack('child_birth', 'chat').hasPhoto, true);
  assert.ok(!L.incomingPack('child_birth', 'sms').hasPhoto);
  const state = L.makeSampleState('thread');
  const rec = L.receiveIncoming(state, 'invite', 'friend_qing');
  assert.strictEqual(rec.ok, true);
  assert.strictEqual(L.latestMessage(state.messages, 'friend_qing').textId, rec.pack.textId);
  const replied = L.replyIncoming(state, rec.pack, 0, 'friend_qing');
  assert.strictEqual(replied.ok, true);
  assert.strictEqual(L.latestMessage(state.messages, 'friend_qing').textId, rec.pack.replies[0].textId);
  // wording checks (verbatim)
  assert.strictEqual(T.TEXTS['in.invite.sms'], '{朋友.名}：「這週六晚上吃飯，來嗎？」');
  assert.strictEqual(T.UI.insufficientLine, '存款不足，這則簡訊沒有送出。');
  pass('7 incoming categories × 3 replies (sms and chat), verbatim catalog');
}

// missing official keys are listed, not invented
{
  assert.ok(L.MISSING_KEYS.some(k => k.proposed.indexOf('phone.bill') !== -1));
  pass('missing official keys listed for 小兵2號');
}

console.log('OK messages_logic_test.js');
