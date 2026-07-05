// logs.js — ログの表示・履歴管理と、アクション中に表示するフレーバーテキスト定義

function createLogManager(panel, {
  storageKey = 'fr_log_history',
  maxEntries = 200,
} = {}) {
  let buffer = [];
  let paused = false;
  let history = [];

  function saveHistory() {
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch {}
  }

  function createEntryElement(text, highlight, html, rightAlign, extraClass) {
    const el = document.createElement('div');
    el.className = 'log-entry'
      + (highlight ? ' highlight' : '')
      + (rightAlign ? ' log-entry--right' : '')
      + (extraClass ? ` ${extraClass}` : '');
    if (html) el.innerHTML = text;
    else el.textContent = text;
    return el;
  }

  function restoreLogHistory() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch {}
    if (saved && saved.length > 0) {
      history = saved;
      panel.innerHTML = '';
      for (const { text, highlight, html, rightAlign, extraClass } of history) {
        panel.appendChild(createEntryElement(text, highlight, html, rightAlign, extraClass));
      }
      panel.scrollTop = panel.scrollHeight;
    } else {
      history = [{
        text: '世界を再生しました',
        highlight: true,
        html: false,
        rightAlign: false,
      }];
      saveHistory();
    }
  }

  function appendLog(text, highlight, html, rightAlign = false, extraClass = '') {
    const el = createEntryElement(text, highlight, html, rightAlign, extraClass);
    const atBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40;
    panel.appendChild(el);
    if (atBottom) panel.scrollTop = panel.scrollHeight;

    history.push({ text, highlight, html, rightAlign, extraClass });
    if (history.length > maxEntries) {
      history.shift();
      if (panel.firstChild) panel.removeChild(panel.firstChild);
    }
    saveHistory();
  }

  function addLog(text, highlight = false, html = false, rightAlign = false, extraClass = '') {
    if (paused) {
      buffer.push({ text, highlight, html, rightAlign, extraClass });
      return;
    }
    appendLog(text, highlight, html, rightAlign, extraClass);
  }

  function pauseLog() {
    paused = true;
  }

  function resumeLog() {
    paused = false;
    buffer.forEach(({ text, highlight, html, rightAlign, extraClass }) => {
      appendLog(text, highlight, html, rightAlign, extraClass);
    });
    buffer = [];
  }

  return { addLog, pauseLog, resumeLog, restoreLogHistory };
}

const ACTION_LOGS = {
  explore: [
    '探索を行っています...',
    'なにかが見つかりそうです...',
    '風が吹いています...',
  ],
  forest_explore: [
    '森の中を歩いています...',
    '木の葉が揺れています...',
    '鳥の声が聞こえます...',
    '[lv:2] 下草が深くなってきた...',
    '[lv:2] 木々がより密になっている気がする...',
  ],
  forest_gather: [
    '資源を収集しています...',
    '持ちきれなくなってきました...',
    'はやくかえりたいです...',
  ],
  nostalgia_explore: [
    '人影とすれ違った。顔は見えない…',
    '誰もいない静かな通りを歩く…',
    '家に明かりが灯っている。人の気配はない…',
    '石畳の街路を歩いています...',
    '塔の影が長く伸びています...',
  ],
  nostalgia_inn_rest: [
    '暖炉のそばで一息ついた...',
    '料理のいい匂いがする...',
    'まどろみに身をあずける...',
  ],
  nostalgia_flower_help: [
    '花の水やりを手伝った...',
    '店先の花を並べ替えた...',
    '客の相手をしている...',
  ],
  nostalgia_library_research: [
    '古い書架をめくっている...',
    'インクと紙の匂いがする...',
    '気になる一節を書き写した...',
  ],
  kyusha_explore: [
    '誰もいない廊下を歩いていく…',
    '窓から西日が差している…',
    '遠くから生徒の声が聞こえる…',
  ],
  renril_explore: [
    '上空を竜が飛び交っている…',
    '人々はこの街で翼竜とともに暮らしている…',
    '道端で翼を休める竜がこちらをみている…',
  ],
  mephisto_explore: [
    '紫煙がゆらめいている…',
    '魔法陣の燐光が床を照らしている…',
    'どこかで詠唱の声が響いている…',
  ],
  knights_explore: [
    '訓練の掛け声が響いている…',
    '磨かれた甲冑が整然と並んでいる…',
    '騎士たちが足早に行き交う…',
  ],
};

// 同行者がいるときに流れるフレーバーテキスト（汎用）
// {name} が同行者名に置換される
const COMPANION_LOGS = [
  '{name}と並んで歩いた...',
  '{name}と少し話をした...',
  '{name}は寂しそうだ...',
  '{name}が空を見上げている...',
  '{name}は黙ってついてくる...',
  '{name}が何かを呟いた...',
];

// キャラクター固有のフレーバーテキスト
// 汎用と50/50で抽選される
const COMPANION_LOGS_SPECIFIC = {
  yuya: [
    '「何かを思い出しそうだよ」',
    '{name}は立ち止まって、どこかを見つめている...振り向いて笑った',
    '「ここ、来たことある気がする」',
    '{name}は何かを探すように辺りを見回した...',
    '「きれいだな」',
  ],
  rabi: [
    '{name}は耳を澄ませている。',
    '{name}は剣の柄に手をかけている。',   
  '「……ずいぶん静かだ」',],
};

// minMs〜maxMsの間でランダムなミリ秒を返す
function randomInterval(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// 行頭の [lv:n] タグを取り除き、{ text, minLv } を返す(タグなしは minLv:0)
// pagecost([pagecost: ...])と同じ「本文にタグを直接書く」方式
const _LV_TAG_RE = /^\[lv:(\d+)\]\s*/;
function _parseLvTag(raw) {
  const m = raw.match(_LV_TAG_RE);
  return m ? { text: raw.slice(m[0].length), minLv: Number(m[1]) } : { text: raw, minLv: 0 };
}

// アクション中にランダムなタイミングでコールバックを呼び続けるスケジューラー
// 直前に出たテキストは次の抽選から除外する(連続重複排除)
// companions: { id, name }の配列。指定時、約1/3の確率で同行者ログを混ぜる
// locationLv: 指定すると、本文に[lv:n]タグが付いたテキストはLv n 以上でのみ出現する
// stop() を呼ぶまで繰り返す
function startFlavorScheduler(actionId, onLog, { minMs = 3000, maxMs = 7000, companions = [], locationLv = 0 } = {}) {
  const allTexts = ACTION_LOGS[actionId];
  if (!allTexts || allTexts.length === 0) return () => {};
  const texts = allTexts.map(_parseLvTag).filter(t => t.minLv <= locationLv).map(t => t.text);
  if (texts.length === 0) return () => {};

  let timer = null;
  let stopped = false;
  let lastText = null;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      if (stopped) return;

      let text;
      // 同行者がいるとき、約55%の確率で同行者ログを出す
      if (companions.length > 0 && Math.random() < 0.55) {
        const companion = companions[Math.floor(Math.random() * companions.length)];
        const specific = COMPANION_LOGS_SPECIFIC[companion.id];
        // 固有テキストがあれば70%で固有、30%で汎用を選ぶ
        const useSpecific = specific && specific.length > 0 && Math.random() < 0.7;
        const source = useSpecific ? specific : COMPANION_LOGS;
        // 置換後の最終テキストで連続重複を判定する({name}を含むテンプレートとlastTextを
        // そのまま比較すると一致せず、連続排除が効かない不具合があったため)
        const rendered = source.map(t => t.replace('{name}', companion.name));
        const pool = rendered.length > 1 ? rendered.filter(t => t !== lastText) : rendered;
        text = pool[Math.floor(Math.random() * pool.length)];
      } else {
        const pool = texts.length > 1 ? texts.filter(t => t !== lastText) : texts;
        text = pool[Math.floor(Math.random() * pool.length)];
      }

      lastText = text;
      onLog(text);
      schedule();
    }, randomInterval(minMs, maxMs));
  }

  schedule();

  return function stop() {
    stopped = true;
    clearTimeout(timer);
  };
}

export { ACTION_LOGS, createLogManager, startFlavorScheduler };
