// 公主 訊息App文字.md wording, used verbatim. textId values are storage keys, not shown.
(function (root) {
  const UI = {
    listTitle: { sms: '收件匣', chat: '聊天' },
    itemName: { sms: '簡訊', chat: '訊息' },
    composeNew: { sms: '撰寫簡訊', chat: '新聊天' },
    group: { sms: null, chat: '群組' },
    sentOk: { sms: '已傳送', chat: '已送達' },
    sentOkLine: { sms: '已傳送。', chat: '已送達。' },
    readByOther: { sms: null, chat: '已讀' },
    unread: { sms: '未讀', chat: '未讀' },
    sending: { sms: '傳送中', chat: '傳送中' },
    sendFail: { sms: '傳送失敗', chat: '傳送失敗' },
    sendFailLine: '傳送失敗，請等一下再試。',
    insufficientShort: '存款不足',
    insufficientLine: '存款不足，這則簡訊沒有送出。',
    charFullShort: '字數已滿',
    charFullLine: '字數已滿，請再短一點。',
    feeHint: '傳送一則簡訊會扣一筆費用。',
    photo: { sms: null, chat: '照片' },
    sticker: { sms: null, chat: '貼圖' },
    typing: { sms: null, chat: '對方正在輸入' },
    emptyList: { sms: '還沒有簡訊', chat: '還沒有聊天' },
    noMatch: { sms: '沒有符合的號碼', chat: '沒有符合的聊天' },
    youSentPhoto: '你傳了一張照片。',
    youSentSticker: '你傳了一張貼圖。',
    otherSentPhoto: '{對方.名}傳來一張照片。',
    otherSentSticker: '{對方.名}傳來一張貼圖。',
    groupJoined: '你加入了這個群組。',
    softkeyLeft: '選項',
    softkeyRight: '返回',
    readOnlyHint: null
  };

  // Outgoing lines (section 二). text is verbatim, including placeholders.
  const OUT = {
    'out.friend.sms.meal.1': '週末要不要一起吃飯？',
    'out.friend.sms.meal.2': '週六晚上有空嗎？想找你吃飯。',
    'out.friend.chat.meal.1': '{朋友.名}，這週日要不要一起吃飯？我想了好久，剛好有空。',
    'out.friend.chat.meal.2': '要不要找一天吃飯？你方便的時候跟我說，我來訂位子。',
    'out.family.sms.meal.1': '{稱呼.母親}，這週日回去吃飯。',
    'out.family.sms.meal.2': '媽，今晚我回去，你們先吃也沒關係。',
    'out.family.chat.meal.1': '{稱呼.母親}，這週日我想回去吃飯。你們想吃什麼，我到市場順路買。',
    'out.family.chat.meal.2': '今晚我回去。不用特別準備，桌上有什麼就吃什麼。',
    'out.ex.sms.meal.1': '有空的話，找一天吃個飯？',
    'out.ex.sms.meal.2': '想請你吃頓飯。你要是不方便，當我沒說。',
    'out.ex.chat.meal.1': '{前任.名}，如果你願意，想找一天一起吃個飯。完全看你方不方便。',
    'out.ex.chat.meal.2': '只是想請你吃一頓，聊近況就好。你不想的話，沒關係。',

    'out.friend.sms.drive.1': '我開車過去，你在家嗎？',
    'out.friend.sms.drive.2': '下午我開車去找你，門牌還是以前那個嗎？',
    'out.friend.chat.drive.1': '我今天可以開車過去。你在家的話，跟我說一聲，我再出發。',
    'out.friend.chat.drive.2': '我想開車去你那邊坐一下。路上若塞車，我會再傳訊息。',
    'out.family.sms.drive.1': '我開車回去，傍晚到。',
    'out.family.sms.drive.2': '{稱呼.父親}，我開車回去，不用出來接。',
    'out.family.chat.drive.1': '我開車回去，預計晚飯前到。到了會跟你們說一聲。',
    'out.family.chat.drive.2': '{稱呼.母親}，我今天開車回去。你們先忙，我到樓下再傳。',
    'out.ex.sms.drive.1': '方便的話，我可以開車過去一趟。',
    'out.ex.sms.drive.2': '我想開車去一趟。你要是不想，跟我說一聲。',
    'out.ex.chat.drive.1': '如果你方便，我可以開車過去。時間完全聽你的，不方便就算了。',
    'out.ex.chat.drive.2': '我可以開車過去一趟，把上次說的東西還你。你定時間就好。',

    'out.friend.sms.yes.1': '好，幾點？',
    'out.friend.sms.yes.2': '我到。地點還是老地方嗎？',
    'out.friend.sms.no.1': '這週先不行，下次再約。',
    'out.friend.sms.no.2': '那天我有事，你們先去。',
    'out.friend.chat.yes.1': '好，我去。時間地點你定，我配合。',
    'out.friend.chat.yes.2': '去。到了跟你說一聲，你再下來。',
    'out.friend.chat.no.1': '這週我先不去了，下週如果你們還要，叫我一聲。',
    'out.friend.chat.no.2': '那天我沒辦法到。你們先玩，回來跟我說一下就好。',
    'out.family.sms.yes.1': '好，我會回去。',
    'out.family.sms.yes.2': '好，我準時到。',
    'out.family.sms.no.1': '這週回去不了，下週補。',
    'out.family.sms.no.2': '今晚先不回去，別幫我留菜。',
    'out.family.chat.yes.1': '好，我會回去。有想吃的跟我說，我順路買。',
    'out.family.chat.yes.2': '好，我準時到。到家會跟你們說一聲。',
    'out.family.chat.no.1': '這週我回去不了。你們先吃，我下週補回去一趟。',
    'out.family.chat.no.2': '今晚先不回去。你們別等我，有空再打給你們。',
    'out.ex.sms.yes.1': '好，我去。',
    'out.ex.sms.yes.2': '好。你定時間就好。',
    'out.ex.sms.no.1': '這次我先不過去了。',
    'out.ex.sms.no.2': '謝謝你約我，這次先不必。',
    'out.ex.chat.yes.1': '好，我去。你定時間，我配合。',
    'out.ex.chat.yes.2': '好。見面就見面，別特別準備。',
    'out.ex.chat.no.1': '謝謝你還願意約我。這次我先不過去，希望你諒解。',
    'out.ex.chat.no.2': '這次我先不去了。你好好過，有需要再跟我說。',

    'out.friend.sms.hi.1': '最近好嗎？',
    'out.friend.sms.hi.2': '想到你，隨便問一聲。',
    'out.friend.chat.hi.1': '{朋友.名}，最近好嗎？忽然想到你，就傳一句。',
    'out.friend.chat.hi.2': '今天忽然想起以前常去的那家小店，不知道你還好不好。',
    'out.family.sms.hi.1': '{稱呼.母親}，我這邊都好，你們呢？',
    'out.family.sms.hi.2': '到家了。你們早點休息。',
    'out.family.chat.hi.1': '{稱呼.母親}，我這邊都好，你們吃飯了嗎？別等我，先吃就好。',
    'out.family.chat.hi.2': '今天比較晚到家。你們也早點休息，明天再聊。',
    'out.ex.sms.hi.1': '最近還好嗎？',
    'out.ex.sms.hi.2': '只是想問你過得怎麼樣。',
    'out.ex.chat.hi.1': '只是想來問一聲，你最近還好嗎。不急著回。',
    'out.ex.chat.hi.2': '今天忽然想到以前的事，只是想知道你過得怎麼樣。',

    'out.friend.sms.sorry.1': '上次對你兇了，對不起。',
    'out.friend.sms.sorry.2': '那天是我不好，跟你說對不起。',
    'out.friend.chat.sorry.1': '上次那件事是我不好。對不起，讓你不舒服。',
    'out.friend.chat.sorry.2': '那天不該那樣說。這句對不起想了很久，還是想親口跟你說，先寫在這裡。',
    'out.family.sms.sorry.1': '{稱呼.母親}，上次頂嘴對不起。',
    'out.family.sms.sorry.2': '那天不該大聲，是我不好。',
    'out.family.chat.sorry.1': '{稱呼.母親}，上次不該那樣說話。回到家再跟你說，這句先寫給你。',
    'out.family.chat.sorry.2': '那天讓你們擔心了，對不起。我一切都好，別再想那件事。',
    'out.ex.sms.sorry.1': '上次那些話，對不起。',
    'out.ex.sms.sorry.2': '有些事是我沒做好，想跟你說對不起。',
    'out.ex.chat.sorry.1': '有些話說得太重，是我不好。這句對不起不求你立刻回。',
    'out.ex.chat.sorry.2': '那次分開前後，有些地方是我沒顧到。想跟你說一聲對不起。'
  };

  // Seven incoming categories, each with 3 replies (section 三).
  const INCOMING = {
    invite: {
      sms: {
        textId: 'in.invite.sms',
        text: '{朋友.名}：「這週六晚上吃飯，來嗎？」',
        replies: [
          { textId: 'in.invite.sms.r1', text: '好，我到。幾點？' },
          { textId: 'in.invite.sms.r2', text: '這週不行，下週可以嗎？' },
          { textId: 'in.invite.sms.r3', text: '你們先吃，我下次補。' }
        ]
      },
      chat: {
        textId: 'in.invite.chat',
        text: '{朋友.名}：「這週六晚上我們幾個要吃飯，你要不要來？還是老地方，你來了再叫你。」',
        replies: [
          { textId: 'in.invite.chat.r1', text: '去。我準時到，到了跟你說。' },
          { textId: 'in.invite.chat.r2', text: '這週六我先不去，下週如果還有，叫我一聲。' },
          { textId: 'in.invite.chat.r3', text: '你們先吃。回來跟我說一下就好，下次我補請。' }
        ]
      }
    },
    longlost: {
      sms: {
        textId: 'in.longlost.sms',
        text: '{朋友.名}：「還找得到你。前幾天整理舊東西，看到我們的合照。」',
        replies: [
          { textId: 'in.longlost.sms.r1', text: '還找得到。你最近怎麼樣？' },
          { textId: 'in.longlost.sms.r2', text: '看到也很想你。有空見面嗎？' },
          { textId: 'in.longlost.sms.r3', text: '謝謝你還記得。我先忙完這陣子再找你。' }
        ]
      },
      chat: {
        textId: 'in.longlost.chat',
        text: '{朋友.名}：「不知道這則還送不送得到。前幾天整理舊箱子，翻到以前的合照，看了很久。你最近還好嗎？」',
        replies: [
          { textId: 'in.longlost.chat.r1', text: '還送得到。看到你傳訊，我也愣了一下。最近還好，你呢？' },
          { textId: 'in.longlost.chat.r2', text: '那張照片我好像也還留著。有空的話，見一面好不好？' },
          { textId: 'in.longlost.chat.r3', text: '謝謝你還記得我。這陣子比較忙，等告一段落我再認真回你。' }
        ]
      }
    },
    birthday: {
      sms: {
        textId: 'in.birthday.friend.sms',
        text: '{朋友.名}：「生日快樂。」',
        replies: [
          { textId: 'in.birthday.friend.sms.r1', text: '謝謝，晚上有空再聊。' },
          { textId: 'in.birthday.friend.sms.r2', text: '謝謝你還記得。' },
          { textId: 'in.birthday.friend.sms.r3', text: '謝謝。改日請你吃飯。' }
        ]
      },
      chat: {
        textId: 'in.birthday.friend.chat',
        text: '{朋友.名}：「生日快樂。你又長了一歲，今天過得怎麼樣？」',
        replies: [
          { textId: 'in.birthday.friend.chat.r1', text: '謝謝。今天很平常，收到你這句就很好了。' },
          { textId: 'in.birthday.friend.chat.r2', text: '謝謝你還記得。晚上若有空，我打給你。' },
          { textId: 'in.birthday.friend.chat.r3', text: '謝謝。改日我請你吃飯。' }
        ]
      },
      familySms: {
        textId: 'in.birthday.family.sms',
        text: '{稱呼.母親}：「生日快樂，回來吃飯。」',
        replies: [
          { textId: 'in.birthday.family.sms.r1', text: '好，我會回去。' },
          { textId: 'in.birthday.family.sms.r2', text: '謝謝媽。今晚先不回去，週末補。' },
          { textId: 'in.birthday.family.sms.r3', text: '收到了，我都好。' }
        ]
      },
      familyChat: {
        textId: 'in.birthday.family.chat',
        text: '{稱呼.母親}：「{self_name}，生日快樂。晚上回來吃飯，你愛吃的菜我會煮。」',
        replies: [
          { textId: 'in.birthday.family.chat.r1', text: '好，我會回去。想吃什麼我到了再跟您說。' },
          { textId: 'in.birthday.family.chat.r2', text: '謝謝。今晚回去不了，週末我補回去一趟。' },
          { textId: 'in.birthday.family.chat.r3', text: '收到了。我都好，您也早點休息。' }
        ]
      }
    },
    wedding: {
      sms: {
        textId: 'in.wedding.sms',
        text: '{朋友.名}：「我們要結婚了，希望你來。」',
        replies: [
          { textId: 'in.wedding.sms.r1', text: '我會到。恭喜。' },
          { textId: 'in.wedding.sms.r2', text: '恭喜你們。那天我在外地，心意先到。' },
          { textId: 'in.wedding.sms.r3', text: '收到了，我一定到。' }
        ]
      },
      chat: {
        textId: 'in.wedding.chat',
        text: '{朋友.名}：「我們決定結婚了，想請你來吃飯。時間地點過幾天傳給你，希望你能到。」',
        replies: [
          { textId: 'in.wedding.chat.r1', text: '我會到。恭喜你們，我很替你們高興。' },
          { textId: 'in.wedding.chat.r2', text: '恭喜。那天我人在外地，去不了，心意先到，改日再補請你們。' },
          { textId: 'in.wedding.chat.r3', text: '收到了，我一定到。需要幫忙跟我說。' }
        ]
      }
    },
    death_notice: {
      sms: {
        textId: 'in.death.sms',
        text: '{朋友.名}：「想告訴你，我父親走了。方便的話，希望你能來。」',
        replies: [
          { textId: 'in.death.sms.r1', text: '我會到。' },
          { textId: 'in.death.sms.r2', text: '收到了。節哀。' },
          { textId: 'in.death.sms.r3', text: '今天可能去不了，改天去看你。' }
        ]
      },
      chat: {
        textId: 'in.death.chat',
        text: '{朋友.名}：「想先跟你說一聲，我父親走了。這幾天家裡人都在，你若方便來看一眼，我很感激。不方便也沒關係。」',
        replies: [
          { textId: 'in.death.chat.r1', text: '我會到。你不用招呼我，到了再跟你說一聲。' },
          { textId: 'in.death.chat.r2', text: '收到了。節哀。這幾天你先顧家裡，需要什麼再跟我說。' },
          { textId: 'in.death.chat.r3', text: '今天我可能趕不過去。改天去看你，你不必回這則。' }
        ]
      }
    },
    child_birth: {
      sms: {
        textId: 'in.birth.sms',
        text: '{朋友.名}：「孩子出生了，我們都好。」',
        replies: [
          { textId: 'in.birth.sms.r1', text: '恭喜，好好休息。' },
          { textId: 'in.birth.sms.r2', text: '恭喜。你們都好就好。' },
          { textId: 'in.birth.sms.r3', text: '收到了，改日去看你們。' }
        ]
      },
      chat: {
        textId: 'in.birth.chat',
        text: '{朋友.名}：「孩子出生了，我們都好。傳一張給你看，這幾天先在家休息。」',
        hasPhoto: true,
        replies: [
          { textId: 'in.birth.chat.r1', text: '恭喜。你們好好休息，我改日再去看。' },
          { textId: 'in.birth.chat.r2', text: '收到照片了，孩子看起來很安穩。恭喜你們。' },
          { textId: 'in.birth.chat.r3', text: '恭喜。需要幫忙買什麼，跟我說一聲。' }
        ]
      }
    },
    elders_morning: {
      smsMother: {
        textId: 'in.morning.mother.sms',
        text: '{稱呼.母親}：「早安，記得吃早餐。」',
        replies: [
          { textId: 'in.morning.mother.sms.r1', text: '早安，我吃了。' },
          { textId: 'in.morning.mother.sms.r2', text: '收到，您也記得吃。' },
          { textId: 'in.morning.mother.sms.r3', text: '今天會出門，晚上再打給您。' }
        ]
      },
      smsFather: {
        textId: 'in.morning.father.sms',
        text: '{稱呼.父親}：「早上了，出門小心。」',
        replies: [
          { textId: 'in.morning.father.sms.r1', text: '知道了。您也小心。' },
          { textId: 'in.morning.father.sms.r2', text: '收到。今晚再打給您。' },
          { textId: 'in.morning.father.sms.r3', text: '我都好，您先忙。' }
        ]
      },
      chatMotherSun: {
        textId: 'in.morning.mother.chat.sun',
        text: '{稱呼.母親}傳來一張圖：院子裡的朝陽，下面寫著「早安，記得吃早餐」。',
        hasPhoto: true,
        replies: [
          { textId: 'in.morning.mother.chat.sun.r1', text: '早安，我吃了。' },
          { textId: 'in.morning.mother.chat.sun.r2', text: '收到，您也要記得吃。' },
          { textId: 'in.morning.mother.chat.sun.r3', text: '今天會出門，晚上再打給您。' }
        ]
      },
      chatFatherTea: {
        textId: 'in.morning.father.chat.tea',
        text: '{稱呼.父親}傳來一張圖：窗台上的茶杯還冒著熱氣，下面寫著「新的一天，好好過」。',
        hasPhoto: true,
        replies: [
          { textId: 'in.morning.father.chat.tea.r1', text: '收到了。您也慢慢喝。' },
          { textId: 'in.morning.father.chat.tea.r2', text: '早安。我都好，您別擔心。' },
          { textId: 'in.morning.father.chat.tea.r3', text: '這張我留下了。晚上再打給您。' }
        ]
      },
      chatMotherFlower: {
        textId: 'in.morning.mother.chat.flower',
        text: '{稱呼.母親}傳來一張圖：陽台上的盆花開了，下面寫著「天氣好，記得加件衣服」。',
        hasPhoto: true,
        replies: [
          { textId: 'in.morning.mother.chat.flower.r1', text: '收到。今天會加一件。' },
          { textId: 'in.morning.mother.chat.flower.r2', text: '花開得正好。您也別在風裡站太久。' },
          { textId: 'in.morning.mother.chat.flower.r3', text: '知道了。週末回去看您。' }
        ]
      }
    }
  };

  const INCOMING_CATEGORIES = [
    'invite', 'longlost', 'birthday', 'wedding', 'death_notice', 'child_birth', 'elders_morning'
  ];

  const FADE_OPENERS = [
    '對話停在最後那句『{最後一句}』。',
    '你們的對話還停在那句『{最後一句}』，後面沒有新的了。',
    '最後一句還是那句『{最後一句}』，已經是{年數}年前的事。',
    '這個名字還在，只是很久沒有新的訊息。'
  ];
  const FADE_LIST_LINE = '{對方.名}　『{最後一句}』　{年數}年前';

  const DEAD_OPENERS = [
    '對話停在{稱呼.父親}那句『到家說一聲』。',
    '對話停在{稱呼.母親}那句『吃飯了嗎』。',
    '你把對話往上翻，最後一則還停在那天，沒有新的訊息。',
    '號碼還在通訊錄裡，只是不會再亮起來。',
    '你沒有刪掉這些對話，就讓它停在原處。'
  ];
  const DEAD_OPENER_WITH_LAST = {
    father: '對話停在{稱呼.父親}那句『{最後一句}』。',
    mother: '對話停在{稱呼.母親}那句『{最後一句}』。'
  };

  // Seed texts used in the sample history (still her wording).
  const SAMPLE_HISTORY = {
    'hist.mother.other.eat': '吃飯了嗎',
    'hist.father.other.home': '到家說一聲',
    'hist.qing.other.invite': '這週六晚上吃飯，來嗎？',
    'hist.shu.other.photo': '還找得到你。前幾天整理舊東西，看到我們的合照。',
    'hist.lin.other.hi': '最近還好嗎？'
  };

  const TEXTS = Object.assign({}, OUT, SAMPLE_HISTORY);
  for (const cat of Object.values(INCOMING)) {
    for (const pack of Object.values(cat)) {
      if (!pack || !pack.textId) continue;
      TEXTS[pack.textId] = pack.text;
      for (const r of pack.replies || []) TEXTS[r.textId] = r.text;
    }
  }

  function fillTemplate(tmpl, vars) {
    if (tmpl == null) return '';
    return String(tmpl).replace(/\{([^}]+)\}/g, function (_, k) {
      return (vars && vars[k] != null) ? String(vars[k]) : '';
    });
  }

  const api = {
    UI, OUT, INCOMING, INCOMING_CATEGORIES, FADE_OPENERS, FADE_LIST_LINE,
    DEAD_OPENERS, DEAD_OPENER_WITH_LAST, SAMPLE_HISTORY, TEXTS, fillTemplate
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MessagesText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
