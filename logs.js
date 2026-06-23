// logs.js — アクション中に表示するフレーバーテキスト定義

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
  ],
  forest_gather: [
    '資源を収集しています...',
    '持ちきれなくなってきました...',
    'はやくかえりたいです...',
  ],
  tower_explore: [
    '石畳の街路を歩いています...',
    '人々の声が聞こえます...',
    '塔の影が長く伸びています...',
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

// アクション中にランダムなタイミングでコールバックを呼び続けるスケジューラー
// 直前に出たテキストは次の抽選から除外する(連続重複排除)
// companions: { id, name }の配列。指定時、約1/3の確率で同行者ログを混ぜる
// stop() を呼ぶまで繰り返す
function startFlavorScheduler(actionId, onLog, { minMs = 3000, maxMs = 7000, companions = [] } = {}) {
  const texts = ACTION_LOGS[actionId];
  if (!texts || texts.length === 0) return () => {};

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
        const pool = source.length > 1 ? source.filter(t => t !== lastText) : source;
        const template = pool[Math.floor(Math.random() * pool.length)];
        text = template.replace('{name}', companion.name);
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

export { ACTION_LOGS, startFlavorScheduler };
