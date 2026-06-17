// logs.js — アクション中に表示するフレーバーテキスト定義

const ACTION_LOGS = {
  explore: [
    '探索を行っています...',
    'なにかが見つかりそうです...',
    '風が吹いています...',
  ],
};

// minMs〜maxMsの間でランダムなミリ秒を返す
function randomInterval(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// アクション中にランダムなタイミングでコールバックを呼び続けるスケジューラー
// 直前に出たテキストは次の抽選から除外する(連続重複排除)
// stop() を呼ぶまで繰り返す
function startFlavorScheduler(actionId, onLog, { minMs = 3000, maxMs = 7000 } = {}) {
  const texts = ACTION_LOGS[actionId];
  if (!texts || texts.length === 0) return () => {};

  let timer = null;
  let stopped = false;
  let lastText = null;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      if (stopped) return;
      const pool = texts.length > 1 ? texts.filter(t => t !== lastText) : texts;
      const text = pool[Math.floor(Math.random() * pool.length)];
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
